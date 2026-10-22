import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { labelsFor, readRules, type RuleQuestion, ruleSentences, writeRules } from './question-rules';
import { compileDecimals, compileShow, describeShow, parseHide, parseWarn, type ShowRule } from './rules';

const YES = '1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NO = '1066AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const form: { pages: Array<{ label: string; sections: Array<{ label: string; questions: Array<RuleQuestion> }> }> } = {
  pages: [
    {
      label: 'P',
      sections: [
        {
          label: 'S',
          questions: [
            {
              id: 'smoker',
              label: 'Smoker',
              type: 'obs',
              questionOptions: {
                rendering: 'radio',
                concept: 'c1',
                answers: [
                  { concept: YES, label: 'Yes' },
                  { concept: NO, label: 'No' },
                ],
              },
            },
            {
              id: 'yearsSmoked',
              label: 'Years smoked',
              type: 'obs',
              questionOptions: { rendering: 'number', concept: 'c2' },
            },
            { id: 'pulse', label: 'Pulse', type: 'obs', questionOptions: { rendering: 'number', concept: 'c3' } },
          ],
        },
      ],
    },
  ],
};
const labels = labelsFor(form);

describe('rules in plain words', () => {
  it('reads the common shipped patterns as sentences', () => {
    const say = (e: string) => {
      const p = parseHide(e);
      return 'rule' in p ? describeShow(p.rule, labels) : `custom: ${p.custom}`;
    };
    expect(say(`smoker !== '${YES}'`)).toBe('Shown only when "Smoker" is "Yes".');
    expect(say(`isEmpty(smoker) || smoker !== '${YES}'`)).toBe('Shown only when "Smoker" is "Yes".');
    expect(say(`isEmpty(age) || age >= 18`)).toBe("Shown only when the patient's age is under 18.");
    expect(say(`isEmpty(smoker)`)).toBe('Shown only when "Smoker" has an answer.');
    expect(say(`x.map(y => y).length > 2`)).toMatch(/^custom:/);
    const w = parseWarn('myValue && (myValue < 95 || myValue > 100)');
    expect('rule' in w && w.rule).toEqual({ below: 95, above: 100 });
  });

  it("writes a new rule in the forms' safe style: hidden until answered", () => {
    const rule: ShowRule = {
      join: 'all',
      conditions: [{ kind: 'answer', question: 'smoker', op: 'is', values: [YES] }],
    };
    expect(compileShow(rule)).toBe(`isEmpty(smoker) || smoker !== '${YES}'`);
  });

  it('adds the spike rules (T4) and describes them; untouched rules stay byte for byte', () => {
    const years = writeRules(form.pages[0].sections[0].questions[1], {
      show: { join: 'all', conditions: [{ kind: 'answer', question: 'smoker', op: 'is', values: [YES] }] },
    });
    const pulse = writeRules(form.pages[0].sections[0].questions[2], { warn: { below: 60, above: 100 }, decimals: 0 });
    expect(ruleSentences(years, labels).map((s) => s.text)).toEqual(['Shown only when "Smoker" is "Yes".']);
    expect(ruleSentences(pulse, labels).map((s) => s.text)).toEqual([
      'Warns (yellow, still saves) below 60 or above 100.',
      'Whole numbers only.',
    ]);
    expect(pulse.validators).toEqual([
      {
        type: 'js_expression',
        warnsWhenExpression: '!isEmpty(myValue) && (myValue < 60 || myValue > 100)',
        message: 'Unusual value: below 60 or above 100. Please check.',
      },
      {
        type: 'js_expression',
        failsWhenExpression: compileDecimals(0),
        message: 'Whole numbers only.',
      },
    ]);
    // reading the rules back gives the same rules
    const back = readRules(pulse);
    expect('rule' in back.warn && back.warn.rule).toEqual({ below: 60, above: 100 });
    expect(back.decimals).toBe(0);
    // removing them leaves a clean question
    expect(writeRules(pulse, { warn: null, decimals: null })).toEqual(form.pages[0].sections[0].questions[2]);
  });
});

const FORMS = path.resolve(__dirname, '../../../../content/configuration/backend_configuration/ampathforms');
describe.skipIf(!fs.existsSync(FORMS))('round trip on the shipped forms', () => {
  it('opening and saving the rules without changes leaves every form unchanged', () => {
    let questions = 0;
    for (const file of fs.readdirSync(FORMS).filter((f) => f.endsWith('.json'))) {
      const form = JSON.parse(fs.readFileSync(path.join(FORMS, file), 'utf-8'));
      const visit = (q) => {
        questions++;
        readRules(q);
        expect(writeRules(q, {})).toEqual(q);
        q.questions?.forEach(visit);
      };
      form.pages?.forEach((p) => p.sections?.forEach((s) => s.questions?.forEach(visit)));
    }
    expect(questions).toBeGreaterThan(10000);
  });

  it('adds the spike rule and warning to the three spike forms (T4)', () => {
    for (const file of ['ED_Triage_Form_GYN.json', 'Cardiac_History_Sheet.json', 'ER_General_Notes.json']) {
      const f = JSON.parse(fs.readFileSync(path.join(FORMS, file), 'utf-8'));
      const all = f.pages.flatMap((p) => p.sections.flatMap((s) => s.questions));
      const yesNo = all.find(
        (q) =>
          q.questionOptions?.answers?.some((a) => a.concept === YES) &&
          q.questionOptions.answers.some((a) => a.concept === NO),
      );
      const details = all.find((q) => q.questionOptions?.rendering === 'textarea' && !q.hide);
      const number = all.find((q) => q.questionOptions?.rendering === 'number');
      expect([file, Boolean(yesNo), Boolean(details), Boolean(number)]).toEqual([file, true, true, true]);
      const shown = writeRules(details, {
        show: { join: 'all', conditions: [{ kind: 'answer', question: yesNo.id, op: 'is', values: [YES] }] },
      });
      expect(shown.hide.hideWhenExpression).toBe(`isEmpty(${yesNo.id}) || ${yesNo.id} !== '${YES}'`);
      const warned = writeRules(number, { warn: { below: 1, above: 999 } });
      expect(warned.validators.at(-1).warnsWhenExpression).toBe('!isEmpty(myValue) && (myValue < 1 || myValue > 999)');
    }
  });
});
