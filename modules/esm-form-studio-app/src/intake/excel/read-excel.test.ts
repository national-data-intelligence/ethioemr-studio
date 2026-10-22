import path from 'node:path';
import readXlsxFile, { readSheetNames } from 'read-excel-file/node';
import { expect, it } from 'vitest';
import spec from './template-spec.json';
import { sheetsToIntake } from './read-excel';

const ASSETS = path.resolve(__dirname, 'assets');

async function load(file: string) {
  const full = path.join(ASSETS, file);
  const sheets = {};
  const wanted = Object.values(spec.sheets).filter((name) => name !== spec.sheets.help);
  for (const name of (await readSheetNames(full)).filter((n) => wanted.includes(n))) {
    sheets[name] = await readXlsxFile(full, { sheet: name });
  }
  return sheetsToIntake(sheets, file);
}

it('reads the worked example made from the Cardiac History Word doc', async () => {
  const form = await load('Example_Cardiac_History_Sheet.xlsx');
  expect(form.problems.filter((p) => p.level === 'error')).toEqual([]);
  expect(form.name).toBe('Cardiac History Sheet');
  expect(form.encounter).toBe('Consultation');
  expect(form.pages.map((p) => p.label)).toEqual([
    'Demographic Information',
    'Presenting Complaint',
    'Past Medical History',
    'Physical Examination',
    'Investigation Summary Sheet',
    'Clinical Diagnosis',
    'Management / Treatment',
    'Care Provider',
    'Counselling Provided',
    'Last Status',
  ]);
  const questions = form.pages.flatMap((p) => p.sections.flatMap((s) => s.questions));
  expect(questions).toHaveLength(170);
  const byLabel = (label: string) => questions.find((q) => q.label === label);
  expect(byLabel('Systolic Blood Pressure')).toMatchObject({ type: 'number', warnBelow: 80, warnAbove: 120 });
  expect(byLabel('Position').options.map((o) => o.label)).toEqual(['Supine', 'Sitting']);
  expect(byLabel('Scope')).toMatchObject({ type: 'one of', required: true });
  expect(byLabel('If yes, how many years').showIf).toBe('smokingHistory = Yes');
  expect(byLabel('Sex').fromEmr).toBe(true);
});

it('reads the empty template without errors other than "no questions"', async () => {
  const form = await load('Form_Studio_Template.xlsx');
  expect(form.problems.map((p) => p.message)).toEqual(['No questions found.']);
});

it('reports bad rows by number and keeps the good ones', () => {
  const header = spec.columns.map((c) => c.header);
  const row = (values: Record<string, string>) => spec.columns.map((c) => values[c.key] ?? null);
  const form = sheetsToIntake(
    {
      About: [['Form name', 'Test form']],
      Questions: [
        header,
        row({ page: 'P1', section: 'S1', label: 'Weight', type: 'number', unit: 'kg', min: '0', max: '300' }),
        row({ label: 'Mood', type: 'smiley' }),
        row({ label: 'Allergy', type: 'one of' }),
        row({ label: 'Allergy list', type: 'many of', options: 'Allergies' }),
        row({ label: 'Pain', id: 'pain score', type: 'number' }),
      ],
      Options: [
        spec.optionColumns.map((c) => c.header),
        ['Allergies', 'Penicillin', ''],
        ['Allergies', 'Sulfa', 'abc'],
      ],
    },
    'test.xlsx',
  );
  const questions = form.pages[0].sections[0].questions;
  expect(questions.map((q) => q.label)).toEqual(['Weight', 'Allergy', 'Allergy list', 'Pain']);
  expect(questions[0]).toMatchObject({ unit: 'kg', min: 0, max: 300 });
  expect(questions[2].options).toEqual([
    { label: 'Penicillin', concept: undefined },
    { label: 'Sulfa', concept: 'abc' },
  ]);
  expect(questions[3].id).toBeUndefined();
  expect(form.problems.map((p) => `${p.level} ${p.where}`)).toEqual([
    'error row 3 (Mood)',
    'warning row 4 (Allergy)',
    'warning row 6 (Pain)',
  ]);
});

it('puts neighbouring rows with the same Group into one group, repeating if any row says Repeat', () => {
  const header = spec.columns.map((c) => c.header);
  const row = (values: Record<string, string>) => spec.columns.map((c) => values[c.key] ?? null);
  const form = sheetsToIntake(
    {
      About: [['Form name', 'Drain chart']],
      Questions: [
        header,
        row({
          page: 'P',
          section: 'Drains',
          label: 'Drain site',
          type: 'text',
          group: 'Drain',
          groupConcept: 'Drain set',
        }),
        row({ label: 'Drain output', type: 'number', unit: 'ml', group: 'Drain', repeat: 'yes' }),
        row({ label: 'Comment', type: 'long text' }),
        row({ label: 'Systolic', type: 'number', group: 'Blood pressure' }),
        row({ label: 'Diastolic', type: 'number', group: 'Blood pressure' }),
      ],
    },
    'drains.xlsx',
  );
  const questions = form.pages[0].sections[0].questions;
  expect(questions.map((q) => `${q.type}:${q.label}`)).toEqual([
    'group:Drain',
    'long text:Comment',
    'group:Blood pressure',
  ]);
  expect(questions[0]).toMatchObject({ repeat: true, concept: 'Drain set' });
  expect(questions[0].children.map((c) => c.label)).toEqual(['Drain site', 'Drain output']);
  expect(questions[0].children[1].repeat).toBeUndefined();
  expect(questions[2].repeat).toBeUndefined();
});
