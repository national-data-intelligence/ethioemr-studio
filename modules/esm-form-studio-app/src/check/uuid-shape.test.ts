/**
 * Concept codes the server can't match exactly:
 * a code with letters outside a-f matches only a concept created with exactly that code (warning; two project
 * concepts exist like that); a CIEL-style code in small letters saves, but the form
 * engine compares codes letter by letter, so a reopened form may not show the answer (warning).
 */
import { describe, expect, it } from 'vitest';
import { checkFormOffline } from './check-form';

const form = (concept: string, answers: Array<string> = []) => ({
  pages: [
    {
      label: 'P',
      sections: [
        {
          label: 'S',
          questions: [
            {
              id: 'q',
              label: 'Q',
              type: 'obs',
              questionOptions: {
                rendering: answers.length ? 'radio' : 'number',
                concept,
                answers: answers.map((c, i) => ({ concept: c, label: `A${i}` })),
              },
            },
          ],
        },
      ],
    },
  ],
});
const rules = (f) => checkFormOffline(f).filter((i) => i.rule.startsWith('concept-uuid'));

describe('concept code shapes', () => {
  it('accepts the shapes the server stores and the engine resolves', () => {
    for (const ok of [
      '5092AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', // CIEL-style, capitals
      'f47a1006-1a2b-4c3d-8e4f-100100100601', // dashed
      '13f82aece2cd4e3bbb950140e6cbffce', // undashed: "Assessment" is stored like this on the live server
      'CIEL:169405', // a code reference, resolved by the engine through /conceptreferences
    ]) {
      expect(rules(form(ok))).toEqual([]);
    }
  });

  it('warns on a CIEL-style code in small letters', () => {
    const [issue] = rules(form('5092aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
    expect(issue).toMatchObject({ level: 'warning', rule: 'concept-uuid-case', questionId: 'q' });
    expect(issue.message).toContain('5092AAAAAAAA');
  });

  it('warns on a non-standard code (the Antenatal card answers): it works only where a concept has exactly that code', () => {
    const found = rules(
      form('1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', [
        '9647586e-1081-901m-6345-7ef89abcdef0',
        '0758697f-2192-012n-7456-8ef9abcdef01',
      ]),
    );
    expect(found.map((i) => [i.level, i.rule])).toEqual([
      ['warning', 'concept-uuid-shape'],
      ['warning', 'concept-uuid-shape'],
    ]);
  });
});
