/**
 * The Form Studio Excel template -> IntakeForm. Columns are found by their header text from
 * template-spec.json, so column order doesn't matter. Every row that can't be used is reported with its row
 * number; nothing is guessed silently.
 */
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import spec from './template-spec.json';
import { INTAKE_TYPES, type IntakeForm, type IntakeIssue, type IntakeQuestion, type IntakeType } from '../intake-types';

type Cell = string | number | boolean | Date | null;
type Sheet = Array<Array<Cell>>;

const text = (cell: Cell) =>
  (cell === null || cell === undefined ? '' : cell instanceof Date ? cell.toISOString() : String(cell)).trim();
const yes = (cell: Cell) => /^(y|yes|true|1|x)$/i.test(text(cell));
const num = (cell: Cell) => {
  const t = text(cell);
  return t === '' || Number.isNaN(Number(t)) ? undefined : Number(t);
};

/** Sheets (as rows of cells) -> IntakeForm. Separate from file reading so it can be tested without a file. */
export function sheetsToIntake(sheets: Record<string, Sheet>, fileName: string): IntakeForm {
  const problems: Array<IntakeIssue> = [];
  const about: Record<string, string> = {};
  for (const row of sheets[spec.sheets.about] ?? []) {
    const field = spec.about.find((f) => f.header.toLowerCase() === text(row[0]).toLowerCase());
    if (field) about[field.key] = text(row[1]);
  }

  // option lists from the Options sheet
  const lists = new Map<string, Array<{ label: string; concept?: string }>>();
  const optionRows = sheets[spec.sheets.options] ?? [];
  const optionHeader = (optionRows[0] ?? []).map((c) => text(c).toLowerCase());
  const oc = (key: string) => optionHeader.indexOf(spec.optionColumns.find((c) => c.key === key).header.toLowerCase());
  for (const row of optionRows.slice(1)) {
    const list = text(row[oc('list')]);
    const label = text(row[oc('label')]);
    if (!list || !label) continue;
    lists.set(list.toLowerCase(), [
      ...(lists.get(list.toLowerCase()) ?? []),
      { label, concept: text(row[oc('concept')]) || undefined },
    ]);
  }

  const rows = sheets[spec.sheets.questions];
  if (!rows?.length) {
    problems.push({
      level: 'error',
      message: `No "${spec.sheets.questions}" sheet: is this the Form Studio template?`,
    });
    return { source: 'excel', name: about.name || fileName, pages: [], problems };
  }
  const header = rows[0].map((c) => text(c).toLowerCase());
  const col: Record<string, number> = {};
  for (const column of spec.columns) {
    col[column.key] = header.indexOf(column.header.toLowerCase());
    if (column.required && col[column.key] < 0) {
      problems.push({ level: 'error', message: `The "${column.header}" column is missing.` });
    }
  }
  const get = (row: Array<Cell>, key: string) => (col[key] >= 0 ? row[col[key]] : null);

  const form: IntakeForm = {
    source: 'excel',
    name: about.name || fileName.replace(/\.xlsx$/i, ''),
    description: about.description,
    encounter: about.encounter,
    replaces: about.replaces,
    version: about.version,
    pages: [],
    problems,
  };
  let pageLabel = '';
  let sectionLabel = '';
  rows.slice(1).forEach((row, i) => {
    const rowNo = `row ${i + 2}`;
    const label = text(get(row, 'label'));
    if (!label) {
      if (row.some((c) => text(c)))
        problems.push({ level: 'warning', where: rowNo, message: 'No question text: row skipped.' });
      return;
    }
    const typeText = text(get(row, 'type')).toLowerCase().replace(/\s+/g, ' ');
    const type = (INTAKE_TYPES as ReadonlyArray<string>).includes(typeText) ? (typeText as IntakeType) : undefined;
    if (!type) {
      problems.push({
        level: 'error',
        where: `${rowNo} (${label})`,
        message: `Type "${typeText}" is not one of: ${INTAKE_TYPES.join(', ')}. Row skipped.`,
      });
      return;
    }
    pageLabel = text(get(row, 'page')) || pageLabel || `${form.name} Assessment`;
    sectionLabel = text(get(row, 'section')) || (text(get(row, 'page')) ? pageLabel : sectionLabel) || pageLabel;
    let page = form.pages.find((p) => p.label === pageLabel);
    if (!page) {
      page = { label: pageLabel, sections: [] };
      form.pages.push(page);
    }
    let section = page.sections.find((s) => s.label === sectionLabel);
    if (!section) {
      section = { label: sectionLabel, questions: [] };
      page.sections.push(section);
    }

    const optionsText = text(get(row, 'options'));
    const list = lists.get(optionsText.toLowerCase());
    const options = list
      ? list.map((o) => ({ ...o }))
      : optionsText
        ? optionsText
            .split(';')
            .map((o) => ({ label: o.trim() }))
            .filter((o) => o.label)
        : undefined;
    const question: IntakeQuestion = {
      label,
      id: text(get(row, 'id')) || undefined,
      type,
      concept: text(get(row, 'concept')) || undefined,
      options,
      required: yes(get(row, 'required')) || undefined,
      min: num(get(row, 'min')),
      max: num(get(row, 'max')),
      whole: yes(get(row, 'whole')) || undefined,
      unit: text(get(row, 'unit')) || undefined,
      warnBelow: num(get(row, 'warnBelow')),
      warnAbove: num(get(row, 'warnAbove')),
      allowFutureDates: yes(get(row, 'futureDates')) || undefined,
      showIf: text(get(row, 'showIf')) || undefined,
      calculation: text(get(row, 'calculation')) || undefined,
      repeat: yes(get(row, 'repeat')) || undefined,
      fromEmr: yes(get(row, 'fromEmr')) || undefined,
      notes: text(get(row, 'notes')) ? [text(get(row, 'notes'))] : undefined,
    };
    if (question.id && !/^[A-Za-z][A-Za-z0-9_]*$/.test(question.id)) {
      problems.push({
        level: 'warning',
        where: `${rowNo} (${label})`,
        message: `Question ID "${question.id}" has spaces or symbols: a new one is made.`,
      });
      question.id = undefined;
    }
    if (['one of', 'many of', 'dropdown'].includes(type) && !options?.length) {
      problems.push({ level: 'warning', where: `${rowNo} (${label})`, message: `"${type}" needs options.` });
    }
    // a Group: neighbouring rows with the same group name go into one group question (an O3 obsGroup)
    const groupName = text(get(row, 'group'));
    if (!groupName) {
      section.questions.push(question);
      return;
    }
    const last = section.questions[section.questions.length - 1];
    const group =
      last?.type === 'group' && last.label === groupName
        ? last
        : (section.questions[
            section.questions.push({
              label: groupName,
              type: 'group',
              concept: text(get(row, 'groupConcept')) || undefined,
              names: [groupName],
              children: [],
            }) - 1
          ] as IntakeQuestion);
    if (question.repeat) {
      group.repeat = true;
      question.repeat = undefined;
    }
    group.concept ??= text(get(row, 'groupConcept')) || undefined;
    group.children.push(question);
  });
  if (!form.pages.length) {
    problems.push({ level: 'error', message: 'No questions found.' });
  }
  return form;
}

/** An uploaded .xlsx -> IntakeForm. */
export async function readExcelFile(file: File): Promise<IntakeForm> {
  const names = await readSheetNames(file);
  const sheets: Record<string, Sheet> = {};
  for (const name of [spec.sheets.about, spec.sheets.questions, spec.sheets.options]) {
    if (names.includes(name)) {
      sheets[name] = (await readXlsxFile(file, { sheet: name })) as Sheet;
    }
  }
  return sheetsToIntake(sheets, file.name);
}
