/**
 * The browser converter loses no question compared with the Python converter, on every real export. Runs only
 * when FS_PARITY_DIR points at the Python output (one folder per batch) and the Bahmni exports are on disk.
 *
 * The structure differs on purpose (original order kept, headings for nested sets, no "General"), so this
 * compares each form's questions as a list of "label|kind", order ignored. Intended differences: Graph data fields
 * and Complex (image) fields are dropped; Time and Computed keep Python's kind (text or number) for the comparison.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBahmniZip } from './read-bahmni';
import { type IntakeQuestion, type IntakeType } from '../intake-types';

const PARITY = process.env.FS_PARITY_DIR;
const EXPORTS = path.resolve(__dirname, '../../../../../source-data/bahmni-exports');

const kind = (type: IntakeType) =>
  ({
    number: 'number',
    calculated: 'number',
    'yes/no': 'radio',
    dropdown: 'select',
    'many of': 'select',
    date: 'date',
    'date-time': 'datetime',
  })[type] ?? 'text';

describe.skipIf(!PARITY || !fs.existsSync(EXPORTS))('Bahmni converter parity with the Python converter', () => {
  const batches = PARITY ? fs.readdirSync(PARITY) : [];
  for (const batch of batches) {
    it(`loses no question compared with the Python output for ${batch}`, () => {
      const outputs = fs.readdirSync(path.join(PARITY, batch)).filter((f) => f.endsWith('.json'));
      expect(outputs.length).toBeGreaterThan(0);
      const zips = fs.readdirSync(path.join(EXPORTS, batch)).filter((f) => f.endsWith('.zip'));
      let compared = 0;
      let questions = 0;
      let dropped = 0;
      let groups = 0;
      for (const zip of zips) {
        const form = readBahmniZip(new Uint8Array(fs.readFileSync(path.join(EXPORTS, batch, zip))), zip);
        const file = form.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.json';
        if (!outputs.includes(file)) {
          continue; // Python skipped it (empty export) or named it differently
        }
        const droppedLabels = new Set(form.problems.filter((p) => /graph|Complex/.test(p.message)).map((p) => p.where));
        const py = JSON.parse(fs.readFileSync(path.join(PARITY, batch, file), 'utf-8'));
        const pyList = py.pages
          .slice(1)
          .flatMap((p) => p.sections.flatMap((s) => s.questions))
          .filter((q) => !droppedLabels.has(q.label))
          .map((q) => `${q.label}|${q.questionOptions.rendering}`)
          .sort();
        const flat = (q: IntakeQuestion): Array<IntakeQuestion> =>
          q.type === 'group' ? q.children.flatMap(flat) : [q];
        const tsList = form.pages
          .flatMap((p) => p.sections.flatMap((s) => s.questions.flatMap(flat)))
          .filter((q) => q.type !== 'note')
          .map((q) => `${q.label}|${kind(q.type as IntakeType)}`)
          .sort();
        expect(tsList, `${batch}/${zip}`).toEqual(pyList);
        compared++;
        questions += tsList.length;
        dropped += droppedLabels.size;
        groups += form.pages
          .flatMap((p) => p.sections.flatMap((s) => s.questions))
          .filter((q) => q.type === 'group').length;
      }
      expect(compared).toBe(outputs.length);
      console.warn(
        `${batch}: ${compared} forms, ${questions} questions kept, ${dropped} graph/image fields dropped, ${groups} repeating groups`,
      );
    });
  }
});
