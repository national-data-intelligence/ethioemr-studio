/**
 * How far the Excel template carries: every Word doc of the batch, converted to the template, is read and built
 * here without a server. Runs only when FS_SHEETS points at the folder of converted sheets.
 */
import fs from 'node:fs';
import path from 'node:path';
import readXlsxFile, { readSheetNames } from 'read-excel-file/node';
import { describe, expect, it } from 'vitest';
import spec from './template-spec.json';
import { sheetsToIntake } from './read-excel';
import { buildSchema } from '../build-schema';
import { checkFormOffline } from '../../check/check-form';

const DIR = process.env.FS_SHEETS;

describe.skipIf(!DIR)('the Excel template on every Word doc of the batch', () => {
  it('reads and builds each one', async () => {
    const rows: Array<string> = [];
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.xlsx'))) {
      const full = path.join(DIR, file);
      const sheets = {};
      const wanted = [spec.sheets.about, spec.sheets.questions, spec.sheets.options];
      for (const name of (await readSheetNames(full)).filter((n) => wanted.includes(n))) {
        sheets[name] = await readXlsxFile(full, { sheet: name });
      }
      const intake = sheetsToIntake(sheets, file);
      const { schema, issues, stats } = buildSchema(intake, {
        name: intake.name,
        encounter: 'Consultation',
        description: '',
      });
      const check = checkFormOffline(schema).filter(
        (i) => i.level === 'error' && !['unmapped', 'no-concept'].includes(i.rule),
      );
      const count = (re: RegExp) => issues.filter((i) => re.test(i.message)).length;
      rows.push(
        [
          file.slice(0, 48).padEnd(48),
          `q=${String(stats.questions).padStart(3)}`,
          `pages=${stats.pages}`,
          `rowErrors=${intake.problems.filter((p) => p.level === 'error').length}`,
          `showIfOk=${schema.pages.flatMap((p) => p.sections.flatMap((s) => s.questions)).filter((q) => q.hide).length}`,
          `showIfBad=${count(/^Show if/)}`,
          `calcTodo=${count(/Calculat/)}`,
          `fromEmr=${stats.skipped}`,
          `checkErrors=${check.length}${check.length ? ' ' + [...new Set(check.map((c) => c.rule))].join(',') : ''}`,
        ].join(' '),
      );
      expect(intake.problems.filter((p) => p.level === 'error')).toEqual([]);
    }
    console.warn(rows.join('\n'));
  });
});
