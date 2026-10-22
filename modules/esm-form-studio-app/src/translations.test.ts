/**
 * Every translation key has one wording. The key "usedInForms" once served both the dictionary's heading "Used in
 * forms" and the search tag "used in {{count}} forms"; the translation file keeps one text per key, so the heading
 * showed "used in {{count}} forms". This keeps keys unique and in step with en.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import en from '../translations/en.json';

const SRC = __dirname;
const files = (dir: string): Array<string> =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'builder' ? [] : files(full); // the copied Form Builder keeps its own keys
    return /\.tsx?$/.test(e.name) && !e.name.includes('.test.') ? [full] : [];
  });

it('each translation key has one wording, and en.json agrees with it', () => {
  const wordings = new Map<string, Set<string>>();
  const call = /\bt\(\s*['"]([\w.-]+)['"]\s*,\s*(['"`])((?:\\.|(?!\2).)*)\2/gs;
  for (const file of files(SRC)) {
    for (const m of fs.readFileSync(file, 'utf-8').matchAll(call)) {
      if (!wordings.has(m[1])) wordings.set(m[1], new Set());
      wordings.get(m[1]).add(m[3]);
    }
  }
  const twice = [...wordings].filter(([, w]) => w.size > 1).map(([k, w]) => `${k}: ${[...w].join(' | ')}`);
  expect(twice).toEqual([]);
  const plural = (k: string) => en[`${k}_other`];
  const differs = [...wordings]
    .filter(([k, w]) => (en[k] ?? plural(k)) !== undefined && ![...w].includes(en[k] ?? plural(k)))
    .map(([k, w]) => `${k}: code "${[...w][0]}" vs en.json "${en[k] ?? plural(k)}"`);
  expect(differs).toEqual([]);
  expect(wordings.size).toBeGreaterThan(150);
});

/** Placeholders that only ever hold numbers or dates made by the app; any other placeholder holds a user's text. */
const NUMBER_PLACEHOLDERS = new Set([
  'count',
  'done',
  'total',
  'min',
  'max',
  'words',
  'shown',
  'places',
  'version',
  'read',
  'sampled',
  'found',
]);

it('a sentence that shows a user\'s text turns off i18next escaping ("PR (beats/min)", not "PR (beats&#x2F;min)")', () => {
  const call = /\bt\(\s*['"]([\w.-]+)['"]\s*,\s*(['"`])((?:\.|(?!\2).)*)\2/gs;
  const missing: Array<string> = [];
  for (const file of files(SRC)) {
    const text = fs.readFileSync(file, 'utf-8');
    for (const m of text.matchAll(call)) {
      const holes = [...m[3].matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((h) => h[1]);
      if (!holes.some((h) => !NUMBER_PLACEHOLDERS.has(h))) continue;
      // the call's options: what follows the default text, up to the next t( call
      const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 600);
      const next = rest.search(/\bt\(/);
      const options = next >= 0 ? rest.slice(0, next) : rest;
      if (!/plainText|escapeValue:\s*false/.test(options)) missing.push(`${path.relative(SRC, file)}: ${m[1]}`);
    }
  }
  expect(missing).toEqual([]);
});
