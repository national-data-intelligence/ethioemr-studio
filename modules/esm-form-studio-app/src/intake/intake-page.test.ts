import { expect, it } from 'vitest';
import { type FormSummary } from '../api/forms.resource';
import { findReplaced } from './intake-page.component';

const forms = [
  { uuid: 'ff723d59-0650-4b84-858d-c1045b690683', name: 'Central Triage Form' },
  { uuid: 'aaaa', name: 'Cardiac History Sheet' },
] as Array<FormSummary>;

it('finds the shipped form an intake rebuilds: by "Replaces" (name or uuid), else by the same name', () => {
  expect(findReplaced(forms, { name: 'central triage form ' })?.uuid).toBe('ff723d59-0650-4b84-858d-c1045b690683');
  expect(findReplaced(forms, { name: 'New name', replaces: 'aaaa' })?.name).toBe('Cardiac History Sheet');
  expect(findReplaced(forms, { name: 'Brand new form' })).toBeUndefined();
});
