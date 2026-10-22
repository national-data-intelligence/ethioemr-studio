/**
 * Export as content files: what a person commits to the content repository on a
 * form-updates branch. Formats copied from the repository itself (measured on content/, 2026-10-17):
 *  - ampathforms/<File>.json: 2-space JSON, as all 368 shipped forms are;
 *  - concepts/master_new_concepts.csv rows: the exact 12-column header, CRLF line ends, answers joined with ";",
 *    `_order` 1 for answers and plain concepts and 2 for questions that list answers (so answers load first);
 *  - concepts/zz_numeric_precision_fixes.csv rows for numeric concepts (the master has no
 *    numeric columns).
 * The bundle is a zip laid out like the repository, with a README of the steps.
 */
import { strToU8, zipSync } from 'fflate';
import { type NewConcept } from './new-concepts';

export const MASTER_HEADER =
  'Uuid,Void/Retire,Same as mappings,Fully specified name:en,Short name:en,Description:en,Data class,Data type,Answers,Members,_version:89,_order:1';
export const NUMERIC_HEADER =
  'Uuid,Void/Retire,Fully specified name:en,Data class,Data type,Absolute low,Absolute high,Units,Allow decimals,_version:3';
const CONTENT = 'configuration/backend_configuration';

/** Content file names: the form name with spaces as underscores, as in content/.../ampathforms/. */
export const exportFileName = (name: string) => `${(name?.trim() || 'Untitled_form').replace(/\s+/g, '_')}.json`;

export const formJson = (schema: unknown) => JSON.stringify(schema, null, 2) + '\n';

const cell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const line = (cells: Array<unknown>) => cells.map(cell).join(',');

/** Rows for master_new_concepts.csv: answers first, then the concepts that use them. */
export function masterRows(concepts: Array<NewConcept>): Array<string> {
  const ordered = [...concepts].sort((a, b) => Number(Boolean(a.answers?.length)) - Number(Boolean(b.answers?.length)));
  return ordered.map((c) =>
    line([
      c.uuid,
      '',
      '',
      c.name,
      '',
      c.description,
      c.conceptClass,
      c.datatype,
      (c.answers ?? []).join(';'),
      '',
      '1',
      c.answers?.length ? '2' : '1',
    ]),
  );
}

/** Rows for zz_numeric_precision_fixes.csv (numeric concepts only). */
export function numericRows(concepts: Array<NewConcept>): Array<string> {
  return concepts
    .filter((c) => c.datatype === 'Numeric')
    .map((c) =>
      line([
        c.uuid,
        '',
        c.name,
        c.conceptClass,
        'Numeric',
        c.absoluteLow,
        c.absoluteHigh,
        c.units,
        c.allowDecimal ? 'TRUE' : 'FALSE',
        '',
      ]),
    );
}

const csv = (header: string, rows: Array<string>) => [header, ...rows].join('\r\n') + '\r\n';

export function readme(fileName: string, formName: string, concepts: Array<NewConcept>, rebuilds: boolean) {
  const numeric = concepts.filter((c) => c.datatype === 'Numeric').length;
  return [
    `# ${formName}: content files from Form Studio`,
    '',
    'Commit these to the content repository (ethiopiaemr-openmrs-content) on a `form-updates` branch. Nothing was saved to a server.',
    '',
    `1. Form: copy \`${CONTENT}/ampathforms/${fileName}\` into the same folder.${
      rebuilds
        ? ' This form already ships: replace the existing file that has the same "uuid" (its file name may differ).'
        : ''
    }`,
    concepts.length
      ? `2. New concepts (${concepts.length}): append the rows of \`${CONTENT}/concepts/master_new_concepts.APPEND.csv\` (without its header line) to the end of \`master_new_concepts.csv\`, in all three copies, byte for byte.`
      : '2. New concepts: none.',
    numeric
      ? `3. Numeric settings (${numeric}): append the rows of \`zz_numeric_precision_fixes.APPEND.csv\` (without its header line) to \`zz_numeric_precision_fixes.csv\`.`
      : '3. Numeric settings: none.',
    '4. Before the pull request: run the content checks and one real save of the form on a test instance.',
    '',
  ].join('\n');
}

/** The zip: the repository layout plus README.md. */
export function contentBundle(schema: { name?: string }, concepts: Array<NewConcept>, rebuilds: boolean): Uint8Array {
  const fileName = exportFileName(schema.name);
  const files: Record<string, Uint8Array> = {
    'README.md': strToU8(readme(fileName, schema.name ?? fileName, concepts, rebuilds)),
    [`${CONTENT}/ampathforms/${fileName}`]: strToU8(formJson(schema)),
  };
  if (concepts.length) {
    files[`${CONTENT}/concepts/master_new_concepts.APPEND.csv`] = strToU8(csv(MASTER_HEADER, masterRows(concepts)));
  }
  const numeric = numericRows(concepts);
  if (numeric.length) {
    files[`${CONTENT}/concepts/zz_numeric_precision_fixes.APPEND.csv`] = strToU8(csv(NUMERIC_HEADER, numeric));
  }
  return zipSync(files);
}
