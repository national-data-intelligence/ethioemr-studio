import { describe, expect, it } from 'vitest';
import { icd11ExtensionCode, judgeConcept, rankConcepts, type SearchConcept } from './concept-rules';

const c = (display: string, extra: Partial<SearchConcept> = {}): SearchConcept => ({
  uuid: display.toLowerCase().replace(/\W+/g, '-'),
  display,
  datatype: { display: 'Numeric' },
  conceptClass: { display: 'Question' },
  ...extra,
});

describe('judging a concept for its role', () => {
  it('refuses what can never be a question, and warns on misfits', () => {
    expect(
      judgeConcept(c('NA', { conceptClass: { display: 'Drug form' }, datatype: { display: 'Text' } }), 'question'),
    ).toMatchObject({ verdict: 'blocked' });
    expect(judgeConcept(c('Old', { retired: true }), 'question').verdict).toBe('blocked');
    expect(judgeConcept(c('Vitals', { set: true, datatype: { display: 'N/A' } }), 'question').verdict).toBe('blocked');
    expect(
      judgeConcept(c('Pulse rate', { datatype: { display: 'Text' } }), 'question', { rendering: 'number' }),
    ).toEqual({
      verdict: 'warn',
      reasons: ['Text concept, number question'],
    });
    expect(
      judgeConcept(c('Final diagnosis', { conceptClass: { display: 'Diagnosis' } }), 'question', {
        blockedClasses: ['Diagnosis'],
      }).verdict,
    ).toBe('warn');
  });

  it('lets drugs be answers but not ICD-11 extension codes or sets; groups want sets', () => {
    expect(
      judgeConcept(c('Paracetamol', { conceptClass: { display: 'Drug' }, datatype: { display: 'N/A' } }), 'answer')
        .verdict,
    ).toBe('ok');
    // an extension-code diagnosis is refused; a real drug that maps to an XM medicine code is not
    const xa = c('Left (XK8G)', {
      conceptClass: { display: 'Diagnosis' },
      mappings: [{ display: 'ICD-11-WHO: XK8G' }],
    });
    expect(icd11ExtensionCode(xa)).toBe('XK8G');
    expect(judgeConcept(xa, 'answer').verdict).toBe('blocked');
    const drug = c('Nadolol', { conceptClass: { display: 'Drug' }, mappings: [{ display: 'ICD-11-WHO: XM69F3' }] });
    expect(judgeConcept(drug, 'answer').verdict).toBe('ok');
    expect(judgeConcept(drug, 'question')).toEqual({ verdict: 'warn', reasons: ['class Drug'] });
    expect(judgeConcept(c('Vitals', { set: true }), 'answer').verdict).toBe('blocked');
    expect(judgeConcept(c('Blood pressure', { set: false }), 'group')).toEqual({
      verdict: 'warn',
      reasons: ['not a set concept'],
    });
  });
});

it('ranks exact names first, fitting before misfitting, more-used first, refused last', () => {
  const usage = new Map([
    ['heart-rate-2', ['A', 'B', 'C']],
    ['fetal-heart-rate', ['A', 'B', 'C', 'D', 'E', 'F']],
  ]);
  const ranked = rankConcepts(
    [
      c('Fetal heart rate'),
      c('Heart rate triage category', { datatype: { display: 'Coded' } }),
      c('Heart rate', { uuid: 'heart-rate-2' }),
      c('Heart rate', { uuid: 'heart-rate-retired', retired: true }),
      c('Heart rate', { uuid: 'heart-rate-text', datatype: { display: 'Text' } }),
    ],
    'heart rate',
    'question',
    { rendering: 'number', usage },
  );
  expect(ranked.map((r) => `${r.concept.uuid}:${r.verdict}`)).toEqual([
    'heart-rate-2:ok',
    'heart-rate-text:warn',
    'heart-rate-triage-category:warn',
    'fetal-heart-rate:ok',
    'heart-rate-retired:blocked',
  ]);
  expect(ranked[0].usedIn).toBe(3);
});
