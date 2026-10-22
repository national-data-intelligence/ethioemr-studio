import { expect, it } from 'vitest';
import template from './standard-form-template.json';
import { newFormUuid, standardFormSchema } from './standard-template';

it('gives the same uuid as the Python converter for the same name', () => {
  // python: uuid5(uuid5(NAMESPACE_URL, "https://emr-forms/bahmni-o3"), "Cardiac History Sheet")
  expect(newFormUuid('Cardiac History Sheet')).toBe('b359b66e-964f-5ef8-9755-c8d319f0e32a');
});

it('is the standard template with only the metadata filled in', () => {
  const schema = standardFormSchema({
    name: ' Cardiac History Sheet ',
    description: 'Records cardiac history.',
    encounter: 'Consultation',
  });
  expect(schema).toEqual({
    ...template,
    name: 'Cardiac History Sheet',
    description: 'Records cardiac history.',
    encounter: 'Consultation',
    uuid: 'b359b66e-964f-5ef8-9755-c8d319f0e32a',
  });
  // same key order as the template, so exported files look like it
  expect(Object.keys(schema)).toEqual(Object.keys(template));
});

it('keeps the template untouched between forms', () => {
  const first = standardFormSchema({ name: 'A', description: '', encounter: 'Triage', version: '2.0' });
  first.pages[1].label = 'Changed';
  const second = standardFormSchema({ name: 'B', description: '', encounter: 'Triage' });
  expect(second.pages[1].label).toBe('Vital Signs & Assessment');
  expect(first.version).toBe('2.0');
  expect(second.version).toBe('1.1');
});
