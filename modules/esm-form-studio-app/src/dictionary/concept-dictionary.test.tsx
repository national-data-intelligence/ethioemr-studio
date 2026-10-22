import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useConceptSearch, type ConceptIndexEntry } from '../api/concept-index.resource';
import { useFormUsage } from '../api/form-usage.resource';
import ConceptDictionary from './concept-dictionary.component';

vi.mock('../api/concept-index.resource', () => ({
  MAX_RESULTS: 2000,
  MIN_QUERY: 2,
  useConceptSearch: vi.fn(),
  useConceptDetails: vi.fn(() => ({ isLoading: true })),
}));
vi.mock('../api/form-usage.resource', () => ({ useFormUsage: vi.fn() }));

const concept = (n: number, overrides: Partial<ConceptIndexEntry> = {}): ConceptIndexEntry => ({
  uuid: `uuid-${n}`,
  name: `Concept ${String(n).padStart(3, '0')}`,
  names: [`Concept ${n}`],
  className: n % 2 ? 'Finding' : 'Question',
  datatype: n % 3 ? 'Coded' : 'Numeric',
  retired: false,
  set: false,
  ...overrides,
});

const results = [
  ...Array.from({ length: 120 }, (_, i) => concept(i + 1)),
  concept(999, { name: 'Blood pressure', className: 'Diagnosis' }),
];

beforeEach(() => {
  vi.mocked(useConceptSearch).mockImplementation((query: string) =>
    query.trim().length >= 2
      ? { result: { concepts: results, total: results.length }, error: undefined, isLoading: false }
      : { result: undefined, error: undefined, isLoading: false },
  );
  vi.mocked(useFormUsage).mockReturnValue({
    usage: new Map([['uuid-999', ['Vitals']]]),
    error: undefined,
    isLoading: false,
  });
});

it('searches the server once typing pauses, then pages through the matches', async () => {
  render(<ConceptDictionary />);
  expect(screen.getAllByRole('row')).toHaveLength(1); // header only until a search
  await userEvent.type(screen.getByRole('searchbox'), 'concept');
  expect(await screen.findByText('Concept 001', {}, { timeout: 2000 })).toBeInTheDocument();
  expect(vi.mocked(useConceptSearch)).toHaveBeenLastCalledWith('concept', false);
  expect(screen.getAllByRole('row')).toHaveLength(51); // header + 50 per page
  await userEvent.click(screen.getByRole('button', { name: /next page/i }));
  expect(screen.getByText('Concept 051')).toBeInTheDocument();
});

it('narrows the matches by class in the browser', async () => {
  render(<ConceptDictionary />);
  await userEvent.type(screen.getByRole('searchbox'), 'concept');
  await screen.findByText('Concept 001', {}, { timeout: 2000 });
  await userEvent.click(screen.getByRole('combobox', { name: /all classes/i }));
  await userEvent.click(screen.getByRole('option', { name: 'Diagnosis' }));
  expect(screen.getByText('Blood pressure')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(2); // header + the one Diagnosis
});
