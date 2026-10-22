import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { standardFormSchema } from '../form-model/standard-template';
import { NO, YES } from '../intake/build-schema';
import { contentBundle, formJson, masterRows, MASTER_HEADER, numericRows } from './content-files';
import { applyNewConcepts, conceptName, proposalProblems, proposeNewConcepts } from './new-concepts';

let n = 0;
const fakeUuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const form = () => {
  const schema = standardFormSchema({ name: 'Drain chart', description: '', encounter: 'Consultation' });
  schema.pages[1].sections[0].questions.push(
    {
      id: 'drainSite',
      label: 'Drain site?',
      type: 'obs',
      questionOptions: {
        rendering: 'radio',
        concept: '__UNMAPPED___drainSite',
        answers: [
          { concept: '__UNMAPPED___drainSite_1', label: 'Chest (left)' },
          { concept: 'abc-existing', label: 'Abdomen' },
        ],
      },
    },
    {
      id: 'drainOutput',
      label: 'Drain output (ml)',
      type: 'obs',
      questionOptions: {
        rendering: 'number',
        concept: '__UNMAPPED___drainOutput',
        min: '0',
        max: '5000',
        disallowDecimals: true,
      },
    },
    {
      id: 'drained',
      label: 'Drained',
      type: 'obs',
      questionOptions: {
        rendering: 'radio',
        concept: '__UNMAPPED___drained',
        answers: [
          { concept: YES, label: 'Yes' },
          { concept: NO, label: 'No' },
        ],
      },
    },
  );
  return schema;
};

describe('new concepts', () => {
  it('proposes the project shapes and clean names', () => {
    n = 0;
    const proposals = proposeNewConcepts(form(), fakeUuid);
    const by = Object.fromEntries(proposals.map((p) => [p.placeholder, p.concept]));
    expect(by['__UNMAPPED___drainSite_1']).toMatchObject({ name: 'Chest', conceptClass: 'Finding', datatype: 'N/A' });
    expect(by['__UNMAPPED___drainSite']).toMatchObject({
      name: 'Drain site',
      conceptClass: 'Question',
      datatype: 'Coded',
    });
    expect(by['__UNMAPPED___drainOutput']).toMatchObject({
      datatype: 'Numeric',
      units: 'ml',
      absoluteLow: '0',
      absoluteHigh: '5000',
      allowDecimal: false,
    });
    expect(by['__UNMAPPED___drained']).toMatchObject({ datatype: 'Coded', answers: [YES, NO] });
    expect(conceptName('BLOOD PRESSURE (SITTING)?')).toBe('Blood pressure');
  });

  it('refuses a name that already exists, and a measurement without units', () => {
    n = 0;
    const [answer, question] = proposeNewConcepts(form(), fakeUuid);
    expect(proposalProblems(answer, new Set(['chest']))[0]).toMatch(/reuse it/);
    expect(
      proposalProblems({ ...question, concept: { ...question.concept, datatype: 'Numeric', units: '' } }, new Set()),
    ).toContain('A measurement needs its units.');
  });

  it('replaces the placeholders and links new answers to new questions', () => {
    n = 0;
    const schema = form();
    const proposals = proposeNewConcepts(schema, fakeUuid);
    const updated = applyNewConcepts(schema, proposals);
    expect(JSON.stringify(updated)).not.toContain('__UNMAPPED__');
    const site = proposals.find((p) => p.placeholder === '__UNMAPPED___drainSite').concept;
    const chest = proposals.find((p) => p.placeholder === '__UNMAPPED___drainSite_1').concept;
    expect(site.answers).toEqual([chest.uuid, 'abc-existing']);
    expect(JSON.stringify(schema)).toContain('__UNMAPPED__'); // the input is untouched
  });
});

describe('content files', () => {
  it('writes master rows like the repository: answers first, ";" between answers, _order 1/2, CRLF', () => {
    n = 0;
    const concepts = proposeNewConcepts(form(), fakeUuid).map((p) => p.concept);
    const rows = masterRows(concepts);
    expect(rows[0]).toMatch(/,Finding,N\/A,,,1,1$/);
    expect(rows.at(-1)).toMatch(/,Question,Coded,1065A{32};1066A{32},,1,2$/);
    expect(numericRows(concepts)).toEqual([
      `${concepts.find((c) => c.datatype === 'Numeric').uuid},,Drain output,Question,Numeric,0,5000,ml,FALSE,`,
    ]);
    const zip = unzipSync(contentBundle({ ...form(), name: 'Drain chart' }, concepts, false));
    expect(Object.keys(zip).sort()).toEqual([
      'README.md',
      'configuration/backend_configuration/ampathforms/Drain_chart.json',
      'configuration/backend_configuration/concepts/master_new_concepts.APPEND.csv',
      'configuration/backend_configuration/concepts/zz_numeric_precision_fixes.APPEND.csv',
    ]);
    const master = strFromU8(zip['configuration/backend_configuration/concepts/master_new_concepts.APPEND.csv']);
    expect(master.startsWith(MASTER_HEADER + '\r\n')).toBe(true);
    expect(master.endsWith('\r\n')).toBe(true);
  });

  const CONTENT = path.resolve(__dirname, '../../../../content/configuration/backend_configuration/ampathforms');
  it.skipIf(!fs.existsSync(CONTENT))(
    'exports every unchanged shipped form exactly as the repository has it, file by file',
    () => {
      let same = 0;
      const differ: Array<string> = [];
      const files = fs.readdirSync(CONTENT).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const text = fs.readFileSync(path.join(CONTENT, file), 'utf-8');
        const out = formJson(JSON.parse(text));
        // compared as git does with core.autocrlf=true (the Windows checkout has CRLF, the repository LF); the
        // repository also mixes "with or without final newline" and escaped or raw non-ASCII: the same JSON either way
        const normalise = (s: string) =>
          s
            .replace(/\r\n/g, '\n')
            .replace(/\n$/, '')
            .replace(/\\u([0-9a-f]{4})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)));
        if (normalise(out) === normalise(text)) same++;
        else differ.push(file);
      }
      console.warn(`${same} of ${files.length} identical; differ: ${differ.join(', ')}`);
      expect(same).toBe(files.length);
    },
  );
});
