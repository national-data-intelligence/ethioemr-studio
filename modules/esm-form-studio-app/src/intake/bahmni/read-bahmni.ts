/**
 * A Bahmni export -> IntakeForm. The exports are zips of two concept CSVs (concepts.csv, concept_sets.csv; checked
 * on all 229 exports), not Bahmni form JSON: they are Bahmni "Forms 1.0", a tree of concept sets. Labels, answers
 * and field types are ported from the Python converter; the structure keeps what the Python loses:
 *
 *  - the root set is the form; its child sets are sections, in their original order, and loose fields between
 *    them stay where they are (runs of loose fields become their own sections) instead of moving to the top;
 *  - a set with two or more real sub-sets becomes a page; its own loose fields get a section named after the page
 *    (not "General": sections are named by clinical meaning);
 *  - deeper sub-sets are flattened into their section, each behind a heading line, so "HEENT › Eye" keeps "Eye";
 *  - "Concept Details" flattens to its value (Abnormal toggle dropped, range warning added);
 *  - "Graph Data" fields are dropped (a chart widget, not a field; a Graph set's other fields stay); Complex is not
 *    built (it fails to save); class Computed is read-only; Time uses the engine's time picker;
 *  - flags are read from `**flag**` in the description, on fields and on sets: allowAddMore on a set marks a block
 *    that Bahmni lets you fill many times (a repeating group in O3, which needs an existing set concept).
 */
import { unzipSync, strFromU8 } from 'fflate';
import {
  type IntakeForm,
  type IntakeIssue,
  type IntakeOption,
  type IntakeQuestion,
  type IntakeSection,
  type IntakeType,
} from '../intake-types';
import { cleanName } from './clean-name';
import { parseCsv } from './csv';

type Row = Record<string, string>;

/** Vital fields get a soft range warning (as in the Python converter; spo2 warns below 90). */
const VITAL_WARN: Array<[string, number | undefined, number | undefined]> = [
  ['spo2', 90, undefined],
  ['systolic', 90, 120],
  ['diastolic', 60, 90],
  ['pulse', 60, 100],
  ['heart rate', 60, 100],
  ['respiratory', 16, 24],
  ['temperature', 35, 37.5],
];

const numbered = (row: Row, prefix: string) =>
  Object.keys(row)
    .map((k) => k.match(new RegExp(`^${prefix}\\.(\\d+)$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)
    .map((n) => (row[`${prefix}.${n}`] ?? '').trim())
    .filter(Boolean);

/** All flags in the exports are written `**flag**` (counted on all 229 zips); a bare word in prose is not a flag. */
const flag = (row: Row | undefined, name: string) =>
  new RegExp(`\\*\\*${name}\\*\\*`, 'i').test(row?.description ?? '');

const allGroups = (sections: Array<IntakeSection>) =>
  sections.flatMap((section) => section.questions.filter((q) => q.type === 'group'));
const isCielId = (uuid: string) => /^\d+A+$/.test(uuid ?? '');
const isGraphData = (name: string) => /\bgraph data\b/i.test(name);

export function bahmniToIntake(conceptsCsv: string, setsCsv: string, formName: string): IntakeForm {
  const sets = new Map<string, { kids: Array<string>; class: string; row: Row }>();
  for (const row of parseCsv(setsCsv)) {
    if (row.name) sets.set(row.name, { kids: numbered(row, 'child'), class: row.class ?? '', row });
  }
  const concepts = new Map<string, Row>();
  for (const row of parseCsv(conceptsCsv)) {
    if (row.name && !concepts.has(row.name)) concepts.set(row.name, row);
  }

  let root = sets.has(formName) ? formName : undefined;
  if (!root) {
    const children = new Set([...sets.values()].flatMap((s) => s.kids));
    const candidates = [...sets.keys()].filter((name) => !children.has(name));
    root = candidates[candidates.length - 1];
  }
  const problems: Array<IntakeIssue> = [];
  if (!root) {
    problems.push({ level: 'error', message: 'No form set found in concept_sets.csv: is this a Bahmni form export?' });
    return { source: 'bahmni', name: cleanName(formName), pages: [], problems };
  }
  const name = cleanName(root);

  const labelOf = (n: string) => cleanName((concepts.get(n)?.shortname || '').trim() || n);
  const setClass = (n: string) => sets.get(n)?.class ?? '';
  /** a field that becomes a question (Abnormal toggles, N/A answer rows, graph data are dropped) */
  const isField = (n: string) => {
    const row = concepts.get(n);
    if (row?.class === 'Abnormal' || row?.datatype === 'N/A') return false;
    if (isGraphData(n)) {
      problems.push({
        level: 'info',
        where: labelOf(n),
        message: 'Bahmni graph data: dropped (a chart widget, not a form field).',
      });
      return false;
    }
    return true;
  };
  const leavesOf = (setName: string, seen: Set<string>): Array<string> =>
    (sets.get(setName)?.kids ?? []).flatMap((kid) =>
      sets.has(kid) ? (seen.has(kid) ? [] : leavesOf(kid, new Set([...seen, kid]))) : isField(kid) ? [kid] : [],
    );
  const hasLeaves = (setName: string) => leavesOf(setName, new Set([setName])).length > 0;
  const realSubsets = (setName: string) => (sets.get(setName)?.kids ?? []).filter((k) => sets.has(k) && hasLeaves(k));

  const question = (n: string): IntakeQuestion | undefined => {
    const row = concepts.get(n) ?? {};
    const datatype = row.datatype || 'Text';
    const label = labelOf(n);
    if (datatype === 'Complex') {
      problems.push({
        level: 'warning',
        where: label,
        message:
          'Bahmni image/video field (Complex): not built, it fails to save in O3. Add a file question by hand if needed.',
      });
      return undefined;
    }
    const q: IntakeQuestion = {
      label,
      type: 'text',
      names: [n, row.shortname].filter(Boolean),
      cielHint: isCielId(row.uuid) ? row.uuid : undefined,
      required: flag(row, 'required') || undefined,
      allowFutureDates: flag(row, 'allowFutureDates') || undefined,
      repeat: flag(row, 'allowAddMore') || flag(row, 'alloeAddMore') || undefined,
    };
    const typeFor: Record<string, IntakeType> = {
      Numeric: 'number',
      Boolean: 'yes/no',
      Date: 'date',
      Datetime: 'date-time',
      Time: 'time',
      Text: 'text',
    };
    if (datatype === 'Coded') {
      const answers = numbered(row, 'answer');
      q.options = answers.map(
        (answer): IntakeOption => ({
          label: labelOf(answer),
          names: [answer],
          cielHint: isCielId(concepts.get(answer)?.uuid) ? concepts.get(answer).uuid : undefined,
        }),
      );
      q.type = answers.length ? (flag(row, 'multiSelect') ? 'many of' : 'dropdown') : 'text';
    } else if (typeFor[datatype]) {
      q.type = typeFor[datatype];
    } else {
      q.notes = [`Bahmni datatype ${datatype}: built as text`];
    }
    if (row.class === 'Computed') {
      q.type = q.type === 'number' ? 'calculated' : q.type;
      q.notes = [...(q.notes ?? []), 'Bahmni "Computed": read-only in Bahmni; write its calculation'];
    }
    if (row.class === 'Duration') {
      q.notes = [...(q.notes ?? []), 'Bahmni duration: add a unit (days / weeks / months / years) if needed'];
    }
    if (q.type === 'number') {
      const low = n.toLowerCase();
      const vital = VITAL_WARN.find(([key]) => low.includes(key));
      if (vital) [, q.warnBelow, q.warnAbove] = vital;
    }
    return q;
  };
  const heading = (label: string): IntakeQuestion => ({ label: cleanName(label), type: 'note', notes: undefined });

  /**
   * A repeating (or plain) group on a set: an O3 obsGroup needs the set's own concept, matched later on the server.
   * Bahmni's allowAddMore sets and Chief Complaint Data (complaint + duration, allowAddMore in Bahmni's default
   * app.json) become repeating groups.
   */
  const group = (setName: string, children: Array<IntakeQuestion>, repeat: boolean): IntakeQuestion => ({
    label: labelOf(setName),
    type: 'group',
    repeat: repeat || undefined,
    names: [setName],
    cielHint: isCielId(sets.get(setName)?.row.uuid) ? sets.get(setName).row.uuid : undefined,
    children: children.filter((q) => q.type !== 'note'),
  });
  const isChiefComplaint = (setName: string) =>
    setClass(setName) === 'Concept Details' && /chief complaint/i.test(setName);

  /** A set's questions, with a heading line before every nested set (Concept Details flatten silently). */
  const questionsOf = (setName: string, seen: Set<string>): Array<IntakeQuestion> =>
    (sets.get(setName)?.kids ?? []).flatMap((kid) => {
      if (!sets.has(kid)) {
        return isField(kid) ? [question(kid)].filter(Boolean) : [];
      }
      if (seen.has(kid) || !hasLeaves(kid)) {
        return [];
      }
      const inner = questionsOf(kid, new Set([...seen, kid]));
      if (isChiefComplaint(kid)) return [group(kid, inner, true)];
      if (setClass(kid) === 'Concept Details') return inner;
      if (flag(sets.get(kid).row, 'allowAddMore')) return [group(kid, inner, true)];
      return [heading(labelOf(kid)), ...inner];
    });

  const section = (label: string, setName: string): IntakeSection | undefined => {
    const questions = questionsOf(setName, new Set([setName]));
    if (!questions.some((q) => q.type !== 'note')) return undefined;
    // a heading straight under its own section title says nothing
    if (questions[0]?.type === 'note' && questions[0].label === cleanName(label)) questions.shift();
    // a whole section Bahmni lets you fill many times: one repeating group holding its questions
    const repeat = flag(sets.get(setName)?.row, 'allowAddMore');
    return {
      label: cleanName(label),
      questions: repeat ? [group(setName, questions, true)] : questions,
      repeat: repeat || undefined,
    };
  };
  const looseSection = (label: string, questions: Array<IntakeQuestion>): IntakeSection | undefined =>
    questions.length ? { label, questions } : undefined;

  // walk the root in order: runs of loose fields stay in place
  const mainSections: Array<IntakeSection> = [];
  const extraPages: IntakeForm['pages'] = [];
  let loose: Array<IntakeQuestion> = [];
  let looseRuns = 0;
  const flushLoose = () => {
    if (!loose.length) return;
    looseRuns++;
    const s = looseSection(looseRuns === 1 ? 'Assessment' : `Assessment ${looseRuns}`, loose);
    if (s) mainSections.push(s);
    loose = [];
  };
  for (const child of sets.get(root).kids) {
    if (!sets.has(child)) {
      if (isField(child)) loose.push(...[question(child)].filter(Boolean));
      continue;
    }
    if (setClass(child) === 'Concept Details') {
      const values = leavesOf(child, new Set([child]))
        .map(question)
        .filter(Boolean);
      loose.push(...(isChiefComplaint(child) ? [group(child, values, true)] : values));
      continue;
    }
    flushLoose();
    const subs = realSubsets(child);
    if (subs.length >= 2) {
      const pageLabel = cleanName(labelOf(child));
      const direct = (sets.get(child)?.kids ?? [])
        .filter((k) => !sets.has(k) && isField(k))
        .map(question)
        .filter(Boolean);
      const pageSections = [looseSection(pageLabel, direct), ...subs.map((sub) => section(labelOf(sub), sub))].filter(
        Boolean,
      );
      if (pageSections.length) extraPages.push({ label: pageLabel, sections: pageSections });
      if (flag(sets.get(child).row, 'allowAddMore')) {
        problems.push({
          level: 'warning',
          where: pageLabel,
          message:
            'Bahmni lets this whole block be filled many times (allowAddMore): built once. A repeating group needs an existing set concept.',
        });
      }
    } else {
      const s = section(labelOf(child), child);
      if (s) mainSections.push(s);
    }
  }
  flushLoose();
  if (looseRuns > 1) {
    problems.push({
      level: 'info',
      message: `${looseRuns} groups of loose fields kept in their place as "Assessment …" sections: rename them by meaning.`,
    });
  }
  const repeating = allGroups(mainSections.concat(extraPages.flatMap((p) => p.sections))).filter((g) => g.repeat);
  if (repeating.length) {
    problems.push({
      level: 'info',
      message: `${repeating.length} block(s) Bahmni lets you fill many times were built as repeating groups: ${repeating.map((g) => g.label).join(', ')}.`,
    });
  }
  if (setClass(root) === 'tab' || flag(sets.get(root).row, 'allowAddMore')) {
    problems.push({
      level: 'info',
      message:
        'A Bahmni flowsheet (filled again and again): built for one reading per encounter. Several readings in one encounter would need a repeating group.',
    });
  }

  const pages = [
    ...(mainSections.length ? [{ label: `${name} Assessment`, sections: mainSections }] : []),
    ...extraPages,
  ];
  if (!pages.length) {
    problems.push({ level: 'error', message: 'This export has no fields (an empty Bahmni form).' });
  }
  return { source: 'bahmni', name, description: '', pages, problems };
}

/** The uploaded zip -> IntakeForm. The form is named after the zip, as the Python builder does. */
export function readBahmniZip(bytes: Uint8Array, fileName: string): IntakeForm {
  const files = unzipSync(bytes);
  const find = (base: string) => Object.keys(files).find((path) => path.split('/').pop() === base);
  const conceptsPath = find('concepts.csv');
  const setsPath = find('concept_sets.csv');
  const formName = fileName.replace(/\.zip$/i, '');
  if (!conceptsPath || !setsPath) {
    return {
      source: 'bahmni',
      name: formName,
      pages: [],
      problems: [
        { level: 'error', message: 'The zip needs concepts.csv and concept_sets.csv (a Bahmni form export).' },
      ],
    };
  }
  return bahmniToIntake(strFromU8(files[conceptsPath]), strFromU8(files[setsPath]), formName);
}
