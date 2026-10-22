import { expect, it } from 'vitest';
import { type FormSummary } from '../api/forms.resource';
import { filterForms } from './forms-table.component';

const form = (name: string, published: boolean, retired: boolean) =>
  ({ uuid: name, name, version: '1', published, retired, resources: [] }) as unknown as FormSummary;
const forms = [form('ANC', true, false), form('Draft triage', false, false), form('Old vitals', true, true)];

it('filters like the Form Builder dashboard', () => {
  const names = (filter: Parameters<typeof filterForms>[1]) => filterForms(forms, filter, '').map((f) => f.name);
  expect(names('Active')).toEqual(['ANC', 'Draft triage']);
  expect(names('All')).toHaveLength(3);
  expect(names('Published')).toEqual(['ANC']);
  expect(names('Unpublished')).toEqual(['Draft triage']);
  expect(names('Retired')).toEqual(['Old vitals']);
});

it('searches names case-insensitively within the filter', () => {
  expect(filterForms(forms, 'All', 'VITAL').map((f) => f.name)).toEqual(['Old vitals']);
  expect(filterForms(forms, 'Active', 'vital')).toEqual([]);
});
