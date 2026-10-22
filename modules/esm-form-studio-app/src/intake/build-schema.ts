/**
 * IntakeForm (after concept matching) -> O3 form schema, on the standard template: the template's
 * header and Visit Details page, then the converted pages. Rules:
 *  - unmatched concepts get unique placeholders `__UNMAPPED___<id>...` (a shared one collapses dropdowns);
 *  - warnings are `js_expression` validators with `warnsWhenExpression` (the engine ignores `alert`);
 *  - "show if" becomes `hide.hideWhenExpression`, compared against answer concept uuids, never words;
 *  - fields "from EMR" are not built (already in the patient record).
 * Everything that needs a person is returned as an issue for the review screen.
 */
import { standardFormSchema } from '../form-model/standard-template';
import { type FormQuestion, type FormSchema } from '../form-model/types';
import { visitDetailsPage } from '../form-model/visit-details';
import { allQuestions, type IntakeForm, type IntakeIssue, type IntakeQuestion, type IntakeType } from './intake-types';

export const UNMAPPED = '__UNMAPPED__';
export const YES = '1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const NO = '1066AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const RENDERING: Record<IntakeType, string> = {
  text: 'text',
  'long text': 'textarea',
  number: 'number',
  date: 'date',
  'date-time': 'datetime',
  time: 'date', // with datePickerFormat 'timer': the engine's time picker (obs-adapter 4.2.1 saves HH:mm)
  'yes/no': 'radio',
  'one of': 'radio',
  'many of': 'checkbox',
  dropdown: 'select',
  calculated: 'number',
  note: 'markdown',
};

/** camelCase id, at most 40 characters, unique in the form */
export function makeId(text: string, used: Set<string>) {
  const words = text
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const base =
    (words.length
      ? words[0].toLowerCase() +
        words
          .slice(1)
          .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
          .join('')
      : 'question'
    ).slice(0, 40) || 'question';
  let id = base;
  for (let n = 2; used.has(id); n++) {
    id = `${base}${n}`;
  }
  used.add(id);
  return id;
}

/** BMI(height, weight) and EDD(lnmp) shorthands, or an engine expression that at least parses. */
export function compileCalculation(text: string): string | undefined {
  const t = text.trim();
  const bmi = t.match(/^BMI\(\s*(\w+)\s*,\s*(\w+)\s*\)$/i);
  if (bmi) {
    return `calcBMI(${bmi[1]}, ${bmi[2]})`;
  }
  const edd = t.match(/^EDD\(\s*(\w+)\s*\)$/i);
  if (edd) {
    return `calcEDD(${edd[1]})`;
  }
  try {
    // only checks that it parses; never run here
    new Function(`return (${t});`);
    return t;
  } catch {
    return undefined;
  }
}

interface Built {
  schema: FormSchema;
  issues: Array<IntakeIssue>;
  stats: { pages: number; sections: number; questions: number; matched: number; unmatched: number; skipped: number };
}

export function buildSchema(
  form: IntakeForm,
  identity: { name: string; uuid?: string; encounter: string; description: string; version?: string },
): Built {
  const issues: Array<IntakeIssue> = [...form.problems];
  const used = new Set<string>(['encDate', 'encProvider', 'encLocation']);
  const stats = { pages: 0, sections: 0, questions: 0, matched: 0, unmatched: 0, skipped: 0 };
  const where = (page: string, section: string, label?: string) => [page, section, label].filter(Boolean).join(' › ');

  // ids first, so "show if" can point at questions further down
  for (const { question } of allQuestions(form)) {
    question.id =
      question.id && !used.has(question.id) ? (used.add(question.id), question.id) : makeId(question.label, used);
  }
  const byRef = new Map<string, IntakeQuestion>();
  for (const { question } of allQuestions(form)) {
    byRef.set(question.id.toLowerCase(), question);
    if (!byRef.has(question.label.toLowerCase())) {
      byRef.set(question.label.toLowerCase(), question);
    }
  }

  const answerUuid = (controller: IntakeQuestion, option: string) => {
    const wanted = option.trim().toLowerCase();
    if (controller.type === 'yes/no') {
      return wanted === 'yes' ? YES : wanted === 'no' ? NO : undefined;
    }
    const index = (controller.options ?? []).findIndex((o) => o.label.trim().toLowerCase() === wanted);
    if (index < 0) {
      return undefined;
    }
    return controller.options[index].match?.uuid ?? `${UNMAPPED}_${controller.id}_${index + 1}`;
  };

  /** "x = Yes", "x has A", "x is answered", "x is empty", "age > 5" or "sex = F" -> hideWhenExpression */
  const compileShowIf = (rule: string): { expression?: string; problem?: string } => {
    const r = rule.trim();
    const age = r.match(/^age\s*(>=|<=|>|<)\s*(\d+(?:\.\d+)?)$/i);
    if (age) {
      const opposite = { '>': '<=', '<': '>=', '>=': '<', '<=': '>' }[age[1]];
      return { expression: `age ${opposite} ${age[2]}` };
    }
    const sex = r.match(/^sex\s*=\s*([MF])\w*$/i);
    if (sex) {
      return { expression: `sex !== '${sex[1].toUpperCase()}'` };
    }
    const filled = r.match(/^(.+?)\s+is\s+(answered|empty)$/i);
    if (filled) {
      const ctrl = byRef.get(filled[1].trim().toLowerCase());
      if (!ctrl) {
        return { problem: `"${filled[1]}" is not a question in this form` };
      }
      return { expression: filled[2].toLowerCase() === 'answered' ? `isEmpty(${ctrl.id})` : `!isEmpty(${ctrl.id})` };
    }
    const cmp = r.match(/^(.+?)\s+(=|has)\s+(.+)$/i);
    if (!cmp) {
      return { problem: `"${r}" is not a rule Form Studio understands` };
    }
    const ctrl = byRef.get(cmp[1].trim().toLowerCase());
    if (!ctrl) {
      return { problem: `"${cmp[1]}" is not a question in this form` };
    }
    const uuid = answerUuid(ctrl, cmp[3]);
    if (!uuid) {
      return { problem: `"${cmp[3]}" is not an option of "${ctrl.label}"` };
    }
    const multi = cmp[2].toLowerCase() === 'has' || ctrl.type === 'many of';
    return {
      expression: multi ? `!includes(${ctrl.id}, '${uuid}')` : `${ctrl.id} !== '${uuid}'`,
      problem: uuid.startsWith(UNMAPPED) ? 'the rule uses an answer whose concept is not matched yet' : undefined,
    };
  };

  const toQuestion = (q: IntakeQuestion, at: string, inGroup = false): FormQuestion | undefined => {
    if (q.fromEmr) {
      stats.skipped++;
      issues.push({ level: 'info', where: at, message: 'Already in the patient record ("From EMR"): not built.' });
      return undefined;
    }
    stats.questions++;
    for (const note of q.notes ?? []) {
      issues.push({ level: 'info', where: at, message: `Source note: ${note}` });
    }
    if (q.type === 'group') {
      // an O3 obsGroup: its questions are saved together under one set concept; 'repeating' adds an "Add" button
      stats.questions--;
      const children = (q.children ?? [])
        .filter((child) => child.type !== 'note')
        .map((child) => toQuestion(child, `${at} › ${child.label}`, true))
        .filter(Boolean);
      if (!children.length) return undefined;
      if (q.match) {
        stats.matched++;
      } else {
        stats.unmatched++;
        issues.push({
          level: 'warning',
          where: at,
          message: `${q.repeat ? 'Repeating group' : 'Group'}: needs an existing set concept${q.unmatched ? ` (${q.unmatched})` : ''}. Pick one with the group's pencil; never create one.`,
        });
      }
      return {
        label: q.label,
        type: 'obsGroup',
        id: q.id,
        questionOptions: {
          rendering: q.repeat ? 'repeating' : 'group',
          concept: q.match?.uuid ?? `${UNMAPPED}_${q.id}`,
        },
        questions: children,
      };
    }
    if (q.type === 'note') {
      // a heading line or an instruction: no concept, nothing saved
      stats.questions--;
      return {
        id: q.id,
        label: q.label,
        type: 'markdown',
        questionOptions: { rendering: 'markdown' },
        value: [`**${q.label}**`],
      };
    }

    const label = q.unit && !q.label.toLowerCase().includes(q.unit.toLowerCase()) ? `${q.label} (${q.unit})` : q.label;
    const concept = q.match?.uuid ?? `${UNMAPPED}_${q.id}`;
    if (q.match) {
      stats.matched++;
    } else {
      stats.unmatched++;
      issues.push({
        level: 'warning',
        where: at,
        message: `Concept not matched${q.unmatched ? `: ${q.unmatched}` : ''}. Pick one with the question's pencil.`,
      });
    }
    const question: FormQuestion = {
      label,
      type: 'obs',
      id: q.id,
      questionOptions: { rendering: RENDERING[q.type as IntakeType], concept },
    };
    if (q.required) {
      question.required = true;
    }

    if (q.type === 'yes/no') {
      question.questionOptions.answers = [
        { concept: YES, label: 'Yes' },
        { concept: NO, label: 'No' },
      ];
    } else if (['one of', 'many of', 'dropdown'].includes(q.type)) {
      const options = q.options ?? [];
      if (!options.length) {
        question.questionOptions.rendering = 'text'; // never an empty dropdown
        issues.push({ level: 'warning', where: at, message: `"${q.type}" without options: built as text.` });
      }
      question.questionOptions.answers = options.map((option, i) => {
        if (!option.match) {
          stats.unmatched++;
          issues.push({ level: 'warning', where: at, message: `Answer "${option.label}": concept not matched.` });
        }
        return { concept: option.match?.uuid ?? `${UNMAPPED}_${q.id}_${i + 1}`, label: option.label };
      });
      if (!question.questionOptions.answers.length) {
        delete question.questionOptions.answers;
      }
    }

    if (q.type === 'number' || q.type === 'calculated') {
      if (q.min !== undefined) question.questionOptions.min = String(q.min);
      if (q.max !== undefined) question.questionOptions.max = String(q.max);
      if (q.whole) question.questionOptions.disallowDecimals = true;
    }
    if (q.warnBelow !== undefined || q.warnAbove !== undefined) {
      const parts = [
        q.warnBelow !== undefined ? `myValue < ${q.warnBelow}` : '',
        q.warnAbove !== undefined ? `myValue > ${q.warnAbove}` : '',
      ].filter(Boolean);
      const range = [q.warnBelow, q.warnAbove].filter((v) => v !== undefined).join('-');
      question.validators = [
        {
          type: 'js_expression',
          warnsWhenExpression: `!isEmpty(myValue) && (${parts.join(' || ')})`,
          message: `Outside the usual range (${range}${q.unit ? ` ${q.unit}` : ''}).`,
        },
      ];
    }
    if (q.type === 'date' || q.type === 'date-time') {
      question.validators = [
        ...(question.validators ?? []),
        { type: 'date', allowFutureDates: q.allowFutureDates ? 'true' : 'false' },
      ];
    }
    if (q.type === 'time') {
      question.datePickerFormat = 'timer';
      issues.push({
        level: 'info',
        where: at,
        message: 'Time uses the engine time picker: save-test it once on the instance.',
      });
    }
    if (q.type === 'calculated') {
      question.readonly = true;
      const expression = q.calculation ? compileCalculation(q.calculation) : undefined;
      if (expression) {
        question.questionOptions.calculate = { calculateExpression: expression };
      } else {
        issues.push({
          level: 'warning',
          where: at,
          message: q.calculation
            ? `Calculation "${q.calculation}" is not an expression Form Studio can use: write it in the question.`
            : 'Calculated, but no calculation given: write it in the question.',
        });
      }
    }
    if (q.showIf) {
      const { expression, problem } = compileShowIf(q.showIf);
      if (expression) {
        question.hide = { hideWhenExpression: expression };
      }
      if (problem) {
        issues.push({ level: 'warning', where: at, message: `Show if "${q.showIf}": ${problem}.` });
      }
    }
    if (q.repeat && !inGroup) {
      issues.push({
        level: 'info',
        where: at,
        message:
          'Marked "repeat" on a single question: built once. To repeat, put it in a Group (Excel "Group" column).',
      });
    }
    return question;
  };

  const pages = form.pages
    .map((page) => ({
      label: page.label,
      sections: page.sections
        .map((section) => ({
          label: section.label,
          isExpanded: 'true',
          questions: section.questions
            .map((q) => toQuestion(q, where(page.label, section.label, q.label)))
            .filter(Boolean),
        }))
        .filter((section) => section.questions.length > 0),
    }))
    .filter((page) => page.sections.length > 0);
  stats.pages = pages.length;
  stats.sections = pages.reduce((n, page) => n + page.sections.length, 0);

  const schema = standardFormSchema({
    name: identity.name,
    description: identity.description,
    encounter: identity.encounter,
    version: identity.version,
  });
  return {
    schema: { ...schema, uuid: identity.uuid || schema.uuid, pages: [visitDetailsPage(), ...pages] },
    issues,
    stats,
  };
}
