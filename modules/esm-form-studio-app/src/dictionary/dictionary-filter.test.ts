import { describe, expect, it } from 'vitest';
import { type ConceptIndexEntry } from '../api/concept-index.resource';
import {
  byRelevance,
  distinct,
  filterConcepts,
  sortConcepts,
  synonymsOf,
  type DictionaryFilter,
} from './dictionary-filter';

const concept = (overrides: Partial<ConceptIndexEntry>): ConceptIndexEntry => ({
  uuid: '5085AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  name: 'Systolic blood pressure',
  names: ['Systolic blood pressure', 'SBP'],
  className: 'Finding',
  datatype: 'Numeric',
  retired: false,
  set: false,
  ...overrides,
});

const concepts = [
  concept({}),
  concept({ uuid: 'aaa-1', name: 'Malaria', names: ['Malaria', 'Paludisme'], className: 'Diagnosis', datatype: 'N/A' }),
  concept({ uuid: 'aaa-2', name: 'Old weight', names: ['Old weight'], retired: true }),
];
const none: DictionaryFilter = {
  query: '',
  className: '',
  datatype: '',
  includeRetired: false,
  usedInFormsOnly: false,
};
const usage = new Map([['5085aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ['Vitals', 'Triage']]]);

describe('concept dictionary filtering', () => {
  it('hides retired concepts unless asked', () => {
    expect(filterConcepts(concepts, none)).toHaveLength(2);
    expect(filterConcepts(concepts, { ...none, includeRetired: true })).toHaveLength(3);
  });

  it('searches every name in every locale, and the uuid', () => {
    expect(filterConcepts(concepts, { ...none, query: 'sbp' }).map((c) => c.name)).toEqual(['Systolic blood pressure']);
    expect(filterConcepts(concepts, { ...none, query: 'paludisme' }).map((c) => c.name)).toEqual(['Malaria']);
    expect(filterConcepts(concepts, { ...none, query: 'aaa-1' }).map((c) => c.name)).toEqual(['Malaria']);
  });

  it('filters by class, datatype and use in forms', () => {
    expect(filterConcepts(concepts, { ...none, className: 'Diagnosis' }).map((c) => c.name)).toEqual(['Malaria']);
    expect(filterConcepts(concepts, { ...none, datatype: 'Numeric' }).map((c) => c.name)).toEqual([
      'Systolic blood pressure',
    ]);
    expect(filterConcepts(concepts, { ...none, usedInFormsOnly: true }, usage).map((c) => c.name)).toEqual([
      'Systolic blood pressure',
    ]);
  });

  it('sorts the whole list, by usage too', () => {
    expect(sortConcepts(concepts, 'name', 'ASC').map((c) => c.name)).toEqual([
      'Malaria',
      'Old weight',
      'Systolic blood pressure',
    ]);
    expect(sortConcepts(concepts, 'usedIn', 'DESC', usage)[0].name).toBe('Systolic blood pressure');
  });

  it('lists the values for the dropdowns', () => {
    expect(distinct(concepts, 'className')).toEqual(['Diagnosis', 'Finding']);
  });
});

describe('synonyms', () => {
  it('lists the other names once, without the display name', () => {
    const c = concept({
      uuid: 's-1',
      name: 'Weight (kg)',
      names: ['Weight (kg)', 'WT', 'weight (kg)', 'Ibiro (Kg)', 'WT'],
    });
    expect(synonymsOf(c)).toEqual(['WT', 'Ibiro (Kg)']);
  });
});

describe('best match first while searching', () => {
  it('puts the exact name first, then names starting with the search', () => {
    const list = ['Baseline weight (kg)', 'Birth weight (kg)', 'Weight (kg) z-score', 'Weight (kg)'].map((name, i) =>
      concept({ uuid: `w-${i}`, name, names: [name] }),
    );
    expect(byRelevance(list, 'weight (kg)').map((c) => c.name)).toEqual([
      'Weight (kg)',
      'Weight (kg) z-score',
      'Baseline weight (kg)',
      'Birth weight (kg)',
    ]);
  });
});
