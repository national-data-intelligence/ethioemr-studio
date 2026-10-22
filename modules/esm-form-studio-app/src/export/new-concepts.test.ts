/**
 * The concept creator: placeholders get new codes; concepts the form points at that this EMR doesn't have keep their
 * code (the form doesn't change, the export adds them); CIEL codes are never created.
 */
import { describe, expect, it } from 'vitest';
import { applyNewConcepts, creatableMissing, isCielCode, proposeNewConcepts } from './new-concepts';

const YES = '1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NO = '1066AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OURS = 'f47a1006-1a2b-4c3d-8e4f-100100100601'; // a project concept missing on this EMR
const OUR_ANSWER = 'f47a1006-1a2b-4c3d-8e4f-100100100602';
const CIEL = '5089AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const form = {
  name: 'Clinic visit',
  pages: [
    {
      label: 'P',
      sections: [
        {
          label: 'Vitals',
          questions: [
            {
              id: 'weight',
              label: 'Weight (kg)',
              type: 'obs',
              questionOptions: { rendering: 'number', concept: CIEL },
            },
            {
              id: 'fit',
              label: 'Fit for surgery?',
              type: 'obs',
              questionOptions: {
                rendering: 'radio',
                concept: OURS,
                answers: [
                  { concept: OUR_ANSWER, label: 'Unfit' },
                  { concept: YES, label: 'Yes' },
                ],
              },
            },
            {
              id: 'note',
              label: 'Nurse note',
              type: 'obs',
              questionOptions: { rendering: 'textarea', concept: '__UNMAPPED___note' },
            },
            {
              id: 'smoker',
              label: 'Smoker',
              type: 'obs',
              questionOptions: {
                rendering: 'radio',
                concept: '__UNMAPPED___smoker',
                answers: [
                  { concept: YES, label: 'Yes' },
                  { concept: NO, label: 'No' },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};

describe('concept creator', () => {
  it('never creates CIEL concepts', () => {
    expect(isCielCode(CIEL)).toBe(true);
    expect(isCielCode('5089aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect([...creatableMissing([CIEL, OURS, '__UNMAPPED___x', OUR_ANSWER])]).toEqual([OURS, OUR_ANSWER]);
    // a broken code can't be kept: the question needs a real concept
    expect([...creatableMissing(['9647586e-1081-901m-6345-7ef89abcdef0'])]).toEqual([]);
  });

  it('proposes placeholders with new codes, and missing concepts with their own code', () => {
    let n = 0;
    const proposals = proposeNewConcepts(form, () => `new-${++n}`, creatableMissing([CIEL, OURS, OUR_ANSWER]));
    const by = Object.fromEntries(proposals.map((p) => [p.placeholder, p]));
    expect(Object.keys(by).sort()).toEqual(['__UNMAPPED___note', '__UNMAPPED___smoker', OUR_ANSWER, OURS].sort());
    expect(by[OURS]).toMatchObject({
      missingOnServer: true,
      concept: {
        uuid: OURS,
        name: 'Fit for surgery',
        conceptClass: 'Question',
        datatype: 'Coded',
        answers: [OUR_ANSWER, YES],
      },
    });
    expect(by[OUR_ANSWER]).toMatchObject({
      missingOnServer: true,
      concept: { uuid: OUR_ANSWER, conceptClass: 'Finding', datatype: 'N/A' },
    });
    expect(by['__UNMAPPED___smoker'].concept).toMatchObject({
      uuid: expect.stringMatching(/^new-/),
      answers: [YES, NO],
    });
    expect(by[CIEL]).toBeUndefined();
  });

  it('applying them changes only the placeholders: the missing codes stay as they are', () => {
    const proposals = proposeNewConcepts(form, () => 'new', creatableMissing([OURS, OUR_ANSWER]));
    const applied = applyNewConcepts(form, proposals);
    const text = JSON.stringify(applied);
    expect(text).toContain(OURS);
    expect(text).toContain(OUR_ANSWER);
    expect(text).not.toContain('__UNMAPPED__');
  });
});
