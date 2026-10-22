import { expect, it } from 'vitest';
import { checkFormConcepts, checkFormOffline, identifiers } from './check-form';
import { type ConceptSource } from '../intake/match-concepts';

const form = (questions: Array<Record<string, unknown>>) => ({
  pages: [{ label: 'P', sections: [{ label: 'S', questions }] }],
});

it('finds the names an expression uses, not strings, regexes, properties or arrow parameters', () => {
  expect(identifiers("/^\d+$/.test(myValue) && x.length > 0 && y !== 'abc'").map((i) => i.name)).toEqual([
    'myValue',
    'x',
    'y',
  ]);
  const issues = checkFormOffline(
    form([
      { id: 'a', label: 'A', type: 'obs', questionOptions: { rendering: 'text', concept: 'c' } },
      {
        id: 'b',
        label: 'B',
        type: 'obs',
        questionOptions: {
          rendering: 'text',
          concept: 'c',
          calculate: { calculateExpression: "[a].some(v => v === 'x') ? missing : myHelper(a)" },
        },
      },
    ]),
  );
  expect(issues.filter((i) => i.rule === 'expression').map((i) => `${i.level} ${i.message}`)).toEqual([
    'error Calculation uses "missing", which is not a question in this form.',
    'warning Calculation calls "myHelper()", which is not a form-engine helper.',
  ]);
});

it('flags duplicate ids, empty choice lists and placeholders', () => {
  const issues = checkFormOffline(
    form([
      {
        id: 'a',
        label: 'A',
        type: 'obs',
        questionOptions: { rendering: 'select', concept: '5089AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      },
      { id: 'a', label: 'A2', type: 'obs', questionOptions: { rendering: 'text', concept: '__UNMAPPED___a2' } },
    ]),
  );
  expect(
    issues
      .filter((i) => i.level === 'error')
      .map((i) => i.rule)
      .sort(),
  ).toEqual(['duplicate-id', 'no-answers', 'unmapped']);
});

it('checks concepts and answers against the dictionary, by uuid or by code', async () => {
  const source: ConceptSource = {
    byUuid: async (uuid) =>
      ({
        '11111111-2222-3333-4444-555555555555': {
          uuid: '11111111-2222-3333-4444-555555555555',
          display: 'NA',
          datatype: { display: 'Text' },
          conceptClass: { display: 'Drug form' },
        },
      })[uuid],
    byReference: async (ref) =>
      ref === 'CIEL:1065'
        ? { uuid: '1065', display: 'Yes', datatype: { display: 'N/A' }, conceptClass: { display: 'Misc' } }
        : undefined,
    byName: async () => [],
  };
  const issues = await checkFormConcepts(
    form([
      {
        id: 'na',
        label: 'Na+',
        type: 'obs',
        questionOptions: {
          rendering: 'number',
          concept: '11111111-2222-3333-4444-555555555555',
          answers: [
            { concept: 'CIEL:1065', label: 'Yes' },
            { concept: 'CIEL:9', label: 'Gone' },
          ],
        },
      },
    ]),
    source,
    ['Drug form'],
  );
  // the Cardiac "Na+" defect, a missing answer by code, and the existing Yes found by code
  expect(issues.map((i) => `${i.level} ${i.rule}`).sort()).toEqual([
    'error answer-missing',
    'error blocked-class',
    'warning shape',
  ]);
  expect(issues.find((i) => i.rule === 'answer-missing').message).toMatch(/Gone.*CIEL:9/);
});
