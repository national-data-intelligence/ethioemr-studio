import { describe, expect, it } from 'vitest';
import { buildSchema, compileCalculation, makeId, NO, UNMAPPED, YES } from './build-schema';
import { applyNumericDetails, matchConcepts, padCiel, type ConceptSource, type ServerConcept } from './match-concepts';
import { type IntakeForm } from './intake-types';

const concept = (c: Partial<ServerConcept> & { uuid: string; display: string }): ServerConcept => ({
  datatype: { display: 'Text' },
  conceptClass: { display: 'Question' },
  names: [{ name: c.display }],
  ...c,
});

/** a fake dictionary: what the server would answer */
const DICTIONARY: Array<ServerConcept> = [
  concept({
    uuid: '5085AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    display: 'Systolic blood pressure',
    datatype: { display: 'Numeric' },
  }),
  concept({
    uuid: 'w-1',
    display: 'Weight (kg)',
    names: [{ name: 'Weight (kg)' }, { name: 'Weight' }],
    datatype: { display: 'Numeric' },
  }),
  concept({
    uuid: 'pos-1',
    display: 'Position',
    datatype: { display: 'Coded' },
    answers: [
      { uuid: 'sup-1', display: 'Supine' },
      { uuid: 'sit-1', display: 'Sitting position', names: [{ name: 'Sitting' }] },
    ],
  }),
  concept({
    uuid: 'na-drug',
    display: 'Na+',
    conceptClass: { display: 'Drug form' },
    datatype: { display: 'Numeric' },
  }),
  concept({ uuid: 'smk-1', display: 'Smoker', datatype: { display: 'Boolean' } }),
  concept({ uuid: 'old-1', display: 'Old field', retired: true }),
  concept({ uuid: 'dup-1', display: 'Pain' }),
  concept({ uuid: 'dup-2', display: 'pain', names: [{ name: 'Pain' }] }),
];
const fake: ConceptSource = {
  byUuid: async (uuid) => DICTIONARY.find((c) => c.uuid === uuid),
  byName: async (name) =>
    DICTIONARY.filter((c) =>
      [c.display, ...(c.names ?? []).map((n) => n.name)].some((n) => n.toLowerCase().includes(name.toLowerCase())),
    ),
};

const intake = (): IntakeForm => ({
  source: 'excel',
  name: 'Cardiac test',
  problems: [],
  pages: [
    {
      label: 'Exam',
      sections: [
        {
          label: 'Vitals',
          questions: [
            {
              label: 'Systolic BP',
              type: 'number',
              cielHint: '5085AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              warnBelow: 90,
              warnAbove: 120,
              unit: 'mmHg',
            },
            { label: 'Weight', type: 'number', min: 0, max: 300, whole: true },
            {
              label: 'Position',
              concept: 'Position',
              type: 'one of',
              options: [{ label: 'Supine' }, { label: 'Sitting' }, { label: 'Standing' }],
            },
            { label: 'Smoker', type: 'yes/no', id: 'smoker' },
            { label: 'Years smoked', type: 'number', showIf: 'smoker = Yes' },
            { label: 'Lying flat', type: 'text', showIf: 'Position = Supine' },
            { label: 'Na+', type: 'number' },
            { label: 'Old field', type: 'text' },
            { label: 'Pain', type: 'text' },
            { label: 'Date', type: 'date' },
            { label: 'BMI', type: 'calculated', calculation: 'BMI(height, weight)' },
            { label: 'Name', type: 'text', fromEmr: true },
            { label: 'Read the instructions', type: 'note' },
          ],
        },
      ],
    },
  ],
});

describe('concept matching against the dictionary', () => {
  it('uses CIEL ids that exist here, exact names that fit, and the question concept answers', async () => {
    const form = await matchConcepts(intake(), { source: fake, blockedClasses: ['Drug form', 'Diagnosis'] });
    const q = Object.fromEntries(form.pages[0].sections[0].questions.map((x) => [x.label, x]));
    expect(q['Systolic BP'].match).toMatchObject({ uuid: '5085AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', how: 'CIEL id' });
    expect(q['Weight'].match).toMatchObject({ uuid: 'w-1', how: 'exact name' });
    expect(q['Position'].match.uuid).toBe('pos-1');
    expect(q['Position'].options.map((o) => o.match?.uuid)).toEqual(['sup-1', 'sit-1', undefined]);
    expect(q['Smoker'].match.uuid).toBe('smk-1');
    // the Drug-form "Na+" is refused (the shipped Cardiac History defect)
    expect(q['Na+'].match).toBeUndefined();
    expect(q['Na+'].unmatched).toMatch(/Drug form/);
    expect(q['Old field'].unmatched).toMatch(/retired/);
    expect(q['Pain'].unmatched).toMatch(/2 concepts/);
    expect(q['Date'].unmatched).toMatch(/too general/);
  });

  it('pads cut CIEL ids', () => {
    expect(padCiel('5085AAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toHaveLength(36);
    expect(padCiel('abc')).toBe('abc');
  });
});

describe('building the schema', () => {
  it('builds the standard template with converted pages, rules and placeholders', async () => {
    const form = await matchConcepts(intake(), { source: fake, blockedClasses: ['Drug form'] });
    const { schema, issues, stats } = buildSchema(form, {
      name: 'Cardiac test',
      encounter: 'Consultation',
      description: 'd',
    });
    expect(schema.pages.map((p) => p.label)).toEqual(['Visit Details', 'Exam']);
    expect(schema.processor).toBe('EncounterFormProcessor');
    const q = Object.fromEntries(schema.pages[1].sections[0].questions.map((x) => [x.label, x]));
    expect(Object.keys(q)).not.toContain('Name'); // from EMR: not built
    expect(q['Systolic BP (mmHg)'].validators).toEqual([
      expect.objectContaining({
        type: 'js_expression',
        warnsWhenExpression: '!isEmpty(myValue) && (myValue < 90 || myValue > 120)',
      }),
    ]);
    expect(q['Weight'].questionOptions).toMatchObject({ concept: 'w-1', min: '0', max: '300', disallowDecimals: true });
    expect(q['Position'].questionOptions.answers).toEqual([
      { concept: 'sup-1', label: 'Supine' },
      { concept: 'sit-1', label: 'Sitting' },
      { concept: `${UNMAPPED}_position_3`, label: 'Standing' },
    ]);
    expect(q['Smoker'].questionOptions.answers).toEqual([
      { concept: YES, label: 'Yes' },
      { concept: NO, label: 'No' },
    ]);
    expect(q['Years smoked'].hide).toEqual({ hideWhenExpression: `smoker !== '${YES}'` });
    expect(q['Lying flat'].hide).toEqual({ hideWhenExpression: "position !== 'sup-1'" });
    expect(q['Na+'].questionOptions.concept).toBe(`${UNMAPPED}_na`);
    expect(q['Date'].validators).toEqual([{ type: 'date', allowFutureDates: 'false' }]);
    expect(q['BMI']).toMatchObject({
      readonly: true,
      questionOptions: { calculate: { calculateExpression: 'calcBMI(height, weight)' } },
    });
    expect(q['Read the instructions']).toMatchObject({ type: 'markdown', value: ['**Read the instructions**'] });
    // every placeholder is unique: a shared one collapses dropdowns
    const placeholders = JSON.stringify(schema).match(/__UNMAPPED__[^"]*/g);
    expect(new Set(placeholders).size).toBe(placeholders.length);
    expect(stats).toMatchObject({ pages: 1, sections: 1, skipped: 1 });
    expect(issues.some((i) => i.message.includes('Already in the patient record'))).toBe(true);
  });

  it('makes unique camelCase ids and checks calculations', () => {
    const used = new Set<string>();
    expect(makeId('Blood pressure (sitting)', used)).toBe('bloodPressureSitting');
    expect(makeId('Blood pressure (sitting)', used)).toBe('bloodPressureSitting2');
    expect(compileCalculation('EDD(lnmp)')).toBe('calcEDD(lnmp)');
    expect(compileCalculation('weight / (height * height)')).toBe('weight / (height * height)');
    expect(compileCalculation('LNMP + 280 days')).toBeUndefined();
  });

  it('reports a show-if rule it cannot use', async () => {
    const form = intake();
    form.pages[0].sections[0].questions[4].showIf = 'nonexistent = Yes';
    const { issues } = buildSchema(await matchConcepts(form, { source: fake, blockedClasses: [] }), {
      name: 'x',
      encounter: 'Consultation',
      description: '',
    });
    expect(issues.find((i) => i.message.startsWith('Show if'))?.message).toMatch(/not a question in this form/);
  });
});

describe('rebuilding a shipped form', () => {
  it("reuses the shipped form's concepts for the same questions, if they still fit", async () => {
    const shipped = {
      pages: [
        {
          sections: [
            {
              questions: [
                { label: 'Pain', questionOptions: { concept: 'dup-2' } },
                {
                  label: 'Position:',
                  questionOptions: { concept: 'pos-1', answers: [{ concept: 'stand-9', label: 'Standing' }] },
                },
                { label: 'Old field', questionOptions: { concept: 'old-1' } },
              ],
            },
          ],
        },
      ],
    };
    const form = await matchConcepts(intake(), { source: fake, blockedClasses: [], shipped });
    const q = Object.fromEntries(form.pages[0].sections[0].questions.map((x) => [x.label, x]));
    // ambiguous by name, but the shipped form says which one
    expect(q['Pain'].match).toMatchObject({ uuid: 'dup-2', how: 'same question in the shipped form' });
    expect(q['Position'].options.map((o) => o.match?.uuid)).toEqual(['sup-1', 'sit-1', 'stand-9']);
    // a shipped concept that is now retired is not reused
    expect(q['Old field'].match).toBeUndefined();
  });
});

describe("the server's numeric settings", () => {
  it('fill what the source left out, and forbid decimals where the concept does', async () => {
    const q = { label: 'Pulse', type: 'number' as const, warnAbove: 120 };
    await applyNumericDetails(q, { allowDecimal: false, units: 'bpm', lowNormal: 60, hiNormal: 100, hiAbsolute: 250 });
    expect(q).toMatchObject({ whole: true, unit: 'bpm', warnBelow: 60, warnAbove: 120, max: 250 });
  });
});

describe('groups', () => {
  it('build an obsGroup on a matched set concept, repeating when asked', async () => {
    const SET = concept({ uuid: 'bp-set', display: 'Blood pressure', set: true, datatype: { display: 'N/A' } });
    const NOT_SET = concept({ uuid: 'drain-q', display: 'Drain', datatype: { display: 'Text' } });
    const source: ConceptSource = {
      byUuid: async (uuid) => [SET, NOT_SET, ...DICTIONARY].find((c) => c.uuid === uuid),
      byName: async (name) => [SET, NOT_SET].filter((c) => c.display.toLowerCase() === name.toLowerCase()),
    };
    const form: IntakeForm = {
      source: 'excel',
      name: 'g',
      problems: [],
      pages: [
        {
          label: 'P',
          sections: [
            {
              label: 'S',
              questions: [
                {
                  label: 'Blood pressure',
                  type: 'group',
                  repeat: true,
                  children: [{ label: 'Systolic', type: 'number' }],
                },
                { label: 'Drain', type: 'group', children: [{ label: 'Site', type: 'text' }] },
              ],
            },
          ],
        },
      ],
    };
    await matchConcepts(form, { source, blockedClasses: ['ConvSet'] });
    const { schema, issues } = buildSchema(form, { name: 'g', encounter: 'Consultation', description: '' });
    const [bp, drain] = schema.pages[1].sections[0].questions;
    expect(bp).toMatchObject({ type: 'obsGroup', questionOptions: { rendering: 'repeating', concept: 'bp-set' } });
    expect(bp.questions.map((q) => q.label)).toEqual(['Systolic']);
    // a plain question concept can't hold a group: a placeholder and a named warning
    expect(drain.questionOptions).toEqual({ rendering: 'group', concept: `${UNMAPPED}_drain` });
    expect(issues.find((i) => i.where === 'P › S › Drain')?.message).toMatch(/needs an existing set concept/);
  });
});
