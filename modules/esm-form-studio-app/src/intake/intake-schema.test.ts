/**
 * intake.schema.json (the AI service's contract for /v1/forms/intake) stays in step with intake-types.ts:
 *  - the field lists below are checked by the TypeScript compiler against the interfaces (a field added to or
 *    removed from a type breaks `yarn typescript` until the schema and this list follow);
 *  - every real Bahmni export and the Excel example, read by Form Studio's own readers, validate against it.
 */
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import readXlsxFile, { readSheetNames } from 'read-excel-file/node';
import { describe, expect, it } from 'vitest';
import schema from './intake.schema.json';
import {
  INTAKE_TYPES,
  type ConceptMatch,
  type IntakeForm,
  type IntakeIssue,
  type IntakeOption,
  type IntakePage,
  type IntakeQuestion,
  type IntakeSection,
} from './intake-types';
import { readBahmniZip } from './bahmni/read-bahmni';
import { sheetsToIntake } from './excel/read-excel';
import spec from './excel/template-spec.json';

// every key of each type, exactly: the compiler refuses a missing or an extra one
const keys = <T>(k: Record<keyof T, true>) => Object.keys(k).sort();
const FIELDS = {
  form: keys<IntakeForm>({
    source: true,
    name: true,
    description: true,
    encounter: true,
    replaces: true,
    version: true,
    pages: true,
    problems: true,
  }),
  page: keys<IntakePage>({ label: true, sections: true }),
  section: keys<IntakeSection>({ label: true, questions: true, repeat: true }),
  question: keys<IntakeQuestion>({
    label: true,
    id: true,
    type: true,
    children: true,
    concept: true,
    names: true,
    cielHint: true,
    options: true,
    required: true,
    min: true,
    max: true,
    whole: true,
    unit: true,
    warnBelow: true,
    warnAbove: true,
    allowFutureDates: true,
    showIf: true,
    calculation: true,
    repeat: true,
    fromEmr: true,
    notes: true,
    match: true,
    unmatched: true,
  }),
  option: keys<IntakeOption>({ label: true, concept: true, names: true, cielHint: true, match: true }),
  match: keys<ConceptMatch>({ uuid: true, display: true, datatype: true, how: true }),
  issue: keys<IntakeIssue>({ level: true, where: true, message: true }),
};
const props = (def?: string) =>
  Object.keys(((def ? schema.$defs[def] : schema) as { properties: Record<string, unknown> }).properties).sort();

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const errorsOf = () => (validate.errors ?? []).slice(0, 5).map((e) => `${e.instancePath} ${e.message}`);

describe('intake.schema.json matches intake-types.ts', () => {
  it('has exactly the fields of each type', () => {
    expect(props()).toEqual(FIELDS.form);
    for (const def of ['page', 'section', 'question', 'option', 'match', 'issue'] as const) {
      expect([def, props(def)]).toEqual([def, FIELDS[def]]);
    }
  });

  it('has exactly the template types', () => {
    expect(schema.$defs.type.enum).toEqual([...INTAKE_TYPES]);
  });

  it('accepts a matched form with a repeating group, and refuses an unknown field', () => {
    const form: IntakeForm = {
      source: 'excel',
      name: 'T',
      pages: [
        {
          label: 'P',
          sections: [
            {
              label: 'S',
              questions: [
                {
                  label: 'Medicines',
                  type: 'group',
                  repeat: true,
                  children: [
                    {
                      label: 'Dose',
                      type: 'number',
                      unit: 'mg',
                      min: 0,
                      match: { uuid: 'u', display: 'Dose', how: 'exact name' },
                    },
                  ],
                },
                {
                  label: 'Smoker',
                  type: 'yes/no',
                  options: [{ label: 'Yes', match: { uuid: 'y', display: 'Yes', how: 'standard yes/no' } }],
                },
              ],
            },
          ],
        },
      ],
      problems: [{ level: 'info', message: 'ok' }],
    };
    expect([validate(form), errorsOf()]).toEqual([true, []]);
    expect(validate({ ...form, extra: 1 })).toBe(false);
    expect(
      validate({
        ...form,
        pages: [{ label: 'P', sections: [{ label: 'S', questions: [{ label: 'G', type: 'group' }] }] }],
      }),
    ).toBe(false);
  });
});

const EXPORTS = path.resolve(__dirname, '../../../../source-data/bahmni-exports');
describe.skipIf(!fs.existsSync(EXPORTS))('every real Bahmni export validates', () => {
  it('reads and validates each zip', () => {
    const zips: Array<string> = [];
    const walk = (dir: string) =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .forEach((e) =>
          e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.zip') && zips.push(path.join(dir, e.name)),
        );
    walk(EXPORTS);
    const bad: Array<string> = [];
    for (const zip of zips) {
      const intake = readBahmniZip(new Uint8Array(fs.readFileSync(zip)), path.basename(zip));
      if (!validate(intake)) bad.push(`${path.basename(zip)}: ${errorsOf().join('; ')}`);
    }
    expect(zips.length).toBeGreaterThan(200);
    expect(bad).toEqual([]);
  });
});

const EXAMPLE = path.resolve(__dirname, 'excel/assets/Example_Cardiac_History_Sheet.xlsx');
describe.skipIf(!fs.existsSync(EXAMPLE))('the Excel example validates', () => {
  it('reads and validates the Cardiac History Sheet example', async () => {
    const sheets = {};
    const wanted = [spec.sheets.about, spec.sheets.questions, spec.sheets.options];
    for (const name of (await readSheetNames(EXAMPLE)).filter((n) => wanted.includes(n))) {
      sheets[name] = await readXlsxFile(EXAMPLE, { sheet: name });
    }
    const intake = sheetsToIntake(sheets, 'Example_Cardiac_History_Sheet.xlsx');
    expect(intake.pages.length).toBeGreaterThan(0);
    expect([validate(intake), errorsOf()]).toEqual([true, []]);
  });
});
