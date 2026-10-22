/**
 * The Check finds the defects known in shipped forms and raises
 * no false hard errors. Needs the local server: set FS_SERVER (e.g. http://localhost:18100/openmrs) and
 * FS_SERVER_AUTH (user:password for that local test instance). Reads the shipped forms from
 * ../../content/configuration/backend_configuration/ampathforms. Read-only: GET requests only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ConceptSource, type ServerConcept } from '../intake/match-concepts';
import { checkFormConcepts, checkFormOffline, type CheckIssue } from './check-form';

const SERVER = process.env.FS_SERVER;
const AUTH = process.env.FS_SERVER_AUTH;
const FORMS = path.resolve(__dirname, '../../../../content/configuration/backend_configuration/ampathforms');
const BLOCKED = ['Diagnosis', 'Drug', 'Drug form', 'Medicament', 'ConvSet', 'LabSet', 'MedSet'];
const REP =
  'custom:(uuid,display,retired,set,datatype:(display),conceptClass:(display),names:(name),answers:(uuid,display,names:(name)))';

function nodeSource(): ConceptSource {
  const cache = new Map<string, Promise<ServerConcept | undefined>>();
  const headers = { Authorization: `Basic ${Buffer.from(AUTH ?? '').toString('base64')}` };
  return {
    byUuid: (uuid) => {
      if (!cache.has(uuid)) {
        cache.set(
          uuid,
          fetch(`${SERVER}/ws/rest/v1/concept/${encodeURIComponent(uuid)}?v=${REP}`, { headers }).then((r) =>
            r.ok ? (r.json() as Promise<ServerConcept>) : undefined,
          ),
        );
      }
      return cache.get(uuid);
    },
    byReference: (reference) =>
      fetch(`${SERVER}/ws/rest/v1/conceptreferences?references=${encodeURIComponent(reference)}&v=${REP}`, { headers })
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => d?.[reference]),
    byName: async () => [],
  };
}

const load = (file: string) => JSON.parse(fs.readFileSync(path.join(FORMS, file), 'utf-8'));
const errors = (issues: Array<CheckIssue>) => issues.filter((i) => i.level === 'error');

describe.skipIf(!SERVER || !AUTH || !fs.existsSync(FORMS))('Check gate against the shipped forms', () => {
  const source = SERVER ? nodeSource() : undefined;
  const check = async (schema) => [...checkFormOffline(schema), ...(await checkFormConcepts(schema, source, BLOCKED))];

  it('flags the known defects', async () => {
    // Cardiac History "Na+" pointing at "NA" (class Drug form): still in the shipped form
    const cardiac = errors(await check(load('Cardiac_History_Sheet.json')));
    expect(cardiac.some((i) => i.rule === 'blocked-class' && /Na\+/.test(i.message))).toBe(true);
    // ER General Notes "Ulcers" and "Former Smoker": their answer concepts were added to the content repo after the
    // spike (master_new_concepts.csv), so today they exist and are not errors. The rule itself is proven by
    // pointing the same answers at concepts that don't exist.
    const shipped = errors(await check(load('ER_General_Notes.json')));
    expect(shipped.filter((i) => i.rule === 'answer-missing')).toEqual([]);
    const broken = JSON.stringify(load('ER_General_Notes.json'))
      .replace('99e39b12-7a74-53e0-a538-50da8f8bff85', '00000000-0000-0000-0000-00000000dead')
      .replace('62eb1bca-8d0b-512f-8c76-77a89cc41545', '00000000-0000-0000-0000-00000000beef');
    const missing = errors(await check(JSON.parse(broken)))
      .filter((i) => i.rule === 'answer-missing')
      .map((i) => i.message);
    expect(missing.some((m) => /Ulcers/.test(m))).toBe(true);
    expect(missing.some((m) => /Former Smoker/.test(m))).toBe(true);
  }, 120_000);

  it('flags the formgen BMI broken-id case and a word compared with a coded answer', () => {
    const form = load('Cardiac_History_Sheet.json');
    const section = form.pages[1].sections[0];
    section.questions.push({
      id: 'bmiTest',
      label: 'BMI',
      type: 'obs',
      questionOptions: {
        rendering: 'number',
        concept: 'x',
        calculate: { calculateExpression: 'calcBMI(heightNotInForm, weightNotInForm)' },
      },
    });
    const coded = form.pages
      .flatMap((p) => p.sections.flatMap((s) => s.questions))
      .find((q) => q.questionOptions?.rendering === 'radio' && q.questionOptions.answers?.length);
    section.questions.push({
      id: 'wordTest',
      label: 'Word',
      type: 'obs',
      questionOptions: { rendering: 'text', concept: 'x' },
      hide: { hideWhenExpression: `${coded.id} !== 'yes'` },
    });
    const issues = checkFormOffline(form);
    expect(issues.filter((i) => i.rule === 'expression' && i.questionId === 'bmiTest').map((i) => i.message)).toEqual([
      'Calculation uses "heightNotInForm", which is not a question in this form.',
      'Calculation uses "weightNotInForm", which is not a question in this form.',
    ]);
    expect(issues.some((i) => i.rule === 'expression-word' && i.questionId === 'wordTest')).toBe(true);
  });

  it('reports what it finds across every shipped form', async () => {
    const counts: Record<string, number> = {};
    const examples: Record<string, Array<string>> = {};
    const clean: Array<string> = [];
    const files = fs.readdirSync(FORMS).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const found = errors(await check(load(file)));
      if (!found.length) clean.push(file);
      for (const i of found) {
        counts[i.rule] = (counts[i.rule] ?? 0) + 1;
        examples[i.rule] ??= [];
        if (examples[i.rule].length < 50) examples[i.rule].push(`${file} :: ${i.where} :: ${i.message}`);
      }
    }
    fs.writeFileSync(
      path.resolve(process.env.FS_GATE_REPORT ?? 'check-gate-report.json'),
      JSON.stringify({ forms: files.length, clean: clean.length, counts, examples, cleanForms: clean }, null, 2),
    );
    console.warn(`${files.length} forms, ${clean.length} without errors`, counts);
    expect(files.length).toBeGreaterThan(300);
  }, 900_000);
});
