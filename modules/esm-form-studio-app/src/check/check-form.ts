/**
 * The Check: everything that can make a form wrong or unsavable, found before export.
 * Errors block export; warnings are for a person to judge.
 *
 * Without the server (instant):
 *  - JSON schema (the bundled OpenMRS form.schema.json, the same check the editor runs);
 *  - duplicate question ids; obs questions without a concept; choice questions without answers;
 *  - `__UNMAPPED__` placeholders left by an intake;
 *  - expressions (hide, calculate, validators) that name a question that doesn't exist (the formgen BMI case),
 *    or compare a coded question with a word instead of an answer concept (`x !== 'yes'`, which
 *    silently hides the field forever).
 * Against the server's dictionary:
 *  - a concept or answer concept that doesn't exist (the ER General Notes "Ulcers" and "Former Smoker" defects);
 *  - retired concepts; question concepts of a blocked class (the Cardiac History "Na+" pointing at the Drug-form "NA");
 *  - a set used as a single question, or a group whose concept isn't a set;
 *  - the rendering doesn't fit the concept's datatype (warning).
 */
import Ajv from 'ajv';
import standardFormSchema from '../form-model/form.schema.json';
import { type ConceptSource, type ServerConcept } from '../intake/match-concepts';

export interface CheckIssue {
  level: 'error' | 'warning';
  rule: string;
  /** "Page › Section › Question" */
  where?: string;
  message: string;
  questionId?: string;
  /** machine-readable specifics, for tools (the command-line Check's rules-only mode) */
  detail?: { name?: string; question?: string; value?: string; expression?: string };
}

interface Question {
  id?: string;
  label?: string;
  type?: string;
  questionOptions?: {
    rendering?: string;
    concept?: string;
    answers?: Array<{ concept?: string; label?: string }>;
    calculate?: { calculateExpression?: string };
  };
  hide?: { hideWhenExpression?: string };
  validators?: Array<{ failsWhenExpression?: string; warnsWhenExpression?: string }>;
  questions?: Array<Question>;
}
interface Schema {
  pages?: Array<{
    label?: string;
    hide?: { hideWhenExpression?: string };
    sections?: Array<{ label?: string; hide?: { hideWhenExpression?: string }; questions?: Array<Question> }>;
  }>;
}

/** Names the form engine 4.2.1 puts in scope for expressions (expression-runner.ts, common-expression-helpers.ts). */
export const ENGINE_NAMES = new Set(
  (
    'myValue patient sex age HD visit visitType visitTypeUuid _ mode previousEncounter ' +
    'api isEmpty dayjs today includes isDateBefore isDateAfter addWeeksToDate addDaysToDate isDateAfterSimple ' +
    'useFieldValue doesNotMatchExpression calcBMI calcEDD calcMonthsOnART calcViralLoadStatus calcNextVisitDate ' +
    'calcTreatmentEndDate calcAgeBasedOnDate calcBSA arrayContains arrayContainsAny parseDate formatDate ' +
    'extractRepeatingGroupValues calcGravida calcWeightForHeightZscore calcBMIForAgeZscore calcHeightForAgeZscore ' +
    'calcTimeDifference resolve ' +
    // JavaScript
    'true false null undefined NaN Infinity typeof instanceof new in of return if else var let const function ' +
    'Math Number String Boolean Date Array Object JSON parseInt parseFloat isNaN isFinite'
  ).split(' '),
);

const CODED = new Set(['select', 'radio', 'checkbox', 'multiCheckbox', 'content-switcher', 'ui-select-extended']);
// with or without dashes (the server resolves both), or a CIEL id
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$|^\d+A{4,}$/i;
const REFERENCE = /^[^:\s]+:\S+$/;

/**
 * Severity, set on evidence from the 368 shipped forms: a concept class that is never a clinical
 * question is an error (Drug form: the Cardiac "Na+" defect); drug, medicament and diagnosis concepts used as
 * questions appear on purpose in working forms, so they are warnings.
 */
export const ERROR_CLASSES = ['Drug form'];

export { DEFAULT_BLOCKED_CLASSES } from './blocked-classes';

/** Datatypes each rendering can store (warning only: some shipped forms bend this on purpose). */
const RENDER_DATATYPES: Record<string, Array<string>> = {
  number: ['Numeric'],
  text: ['Text', 'Numeric', 'Coded'],
  textarea: ['Text'],
  date: ['Date', 'Datetime', 'Time'],
  datetime: ['Datetime', 'Date'],
  radio: ['Coded', 'Boolean'],
  select: ['Coded', 'Boolean'],
  checkbox: ['Coded'],
  toggle: ['Boolean', 'Coded'],
  'content-switcher': ['Coded', 'Boolean'],
};

/** Every question with where it sits; group children included. */
export function walk(schema: Schema) {
  const out: Array<{ q: Question; where: string; parent?: Question }> = [];
  for (const page of schema.pages ?? []) {
    for (const section of page.sections ?? []) {
      const visit = (q: Question, parent?: Question) => {
        out.push({ q, parent, where: [page.label, section.label, parent?.label, q.label].filter(Boolean).join(' › ') });
        q.questions?.forEach((child) => visit(child, q));
      };
      section.questions?.forEach((q) => visit(q));
    }
  }
  return out;
}

/** The identifiers an expression uses: string literals removed, `.property` access ignored. */
export function identifiers(expression: string): Array<{ name: string; called: boolean }> {
  const code = expression
    // string literals
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''")
    // regular-expression literals, e.g. /^\d+$/.test(myValue)
    .replace(/(^|[(,=:[!&|?{};]\s*)\/(?:\\.|[^/\\\n])+\/[gimsuy]*/g, '$1RE');
  const found: Array<{ name: string; called: boolean }> = [];
  // (?<!...): a name not after "." (property) or inside another word
  const re = /(?<![.\w$])([A-Za-z_$][\w$]*)(\s*\()?/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m[1] !== 'RE') found.push({ name: m[1], called: Boolean(m[2]) });
  }
  return found;
}

export function checkFormOffline(schema: Schema): Array<CheckIssue> {
  const issues: Array<CheckIssue> = [];
  const all = walk(schema);

  // JSON schema
  try {
    const validate = new Ajv({ allErrors: true, strict: false }).compile(standardFormSchema);
    if (!validate(schema)) {
      for (const e of (validate.errors ?? []).slice(0, 20)) {
        issues.push({ level: 'warning', rule: 'schema', where: e.instancePath, message: `Form schema: ${e.message}.` });
      }
    }
  } catch (e) {
    issues.push({ level: 'warning', rule: 'schema', message: `Could not run the schema check: ${String(e)}` });
  }

  // ids
  const ids = new Map<string, number>();
  for (const { q } of all) if (q.id) ids.set(q.id, (ids.get(q.id) ?? 0) + 1);
  for (const [id, n] of ids) {
    if (n > 1)
      issues.push({
        level: 'error',
        rule: 'duplicate-id',
        message: `Question id "${id}" is used ${n} times.`,
        questionId: id,
      });
  }

  const byId = new Map(all.filter(({ q }) => q.id).map(({ q }) => [q.id, q]));
  const expressionChecks = (expression: string | undefined, where: string, kind: string, questionId?: string) => {
    if (!expression) return;
    // names the expression declares itself: arrow-function parameters (`.some(v => v === ...)`)
    const locals = new Set(
      [...expression.matchAll(/(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>/g)].flatMap((m) =>
        (m[1] ?? m[2]).split(',').map((p) => p.trim()),
      ),
    );
    for (const { name, called } of identifiers(expression)) {
      if (ENGINE_NAMES.has(name) || byId.has(name) || locals.has(name)) continue;
      issues.push(
        called
          ? {
              level: 'warning',
              rule: 'expression',
              where,
              questionId,
              message: `${kind} calls "${name}()", which is not a form-engine helper.`,
              detail: { name, expression },
            }
          : {
              level: 'error',
              rule: 'expression',
              where,
              questionId,
              message: `${kind} uses "${name}", which is not a question in this form.`,
              detail: { name, expression },
            },
      );
    }
    // a coded question compared with a word: `smoker !== 'yes'`, `includes(symptoms, 'Fever')`
    const literal = /\b([A-Za-z_$][\w$]*)\s*(?:===?|!==?)\s*'([^']*)'|includes\(\s*([A-Za-z_$][\w$]*)\s*,\s*'([^']*)'/g;
    for (let m = literal.exec(expression); m; m = literal.exec(expression)) {
      const target = byId.get(m[1] ?? m[3]);
      const value = m[2] ?? m[4];
      const answers = target?.questionOptions?.answers;
      if (target && CODED.has(target.questionOptions?.rendering ?? '') && answers?.length && value !== '') {
        if (!answers.some((a) => a.concept === value)) {
          issues.push({
            level: 'error',
            rule: 'expression-word',
            where,
            questionId,
            message: `${kind} compares "${target.id}" with '${value}', which is not one of its answer concepts (so the rule never matches).`,
            detail: { question: target.id, value, expression },
          });
        }
      }
    }
  };

  for (const { q, where } of all) {
    const options = q.questionOptions ?? {};
    const concept = options.concept;
    const isObs = q.type === 'obs' || q.type === 'obsGroup';
    if (isObs && !concept) {
      issues.push({ level: 'error', rule: 'no-concept', where, questionId: q.id, message: 'No concept.' });
    }
    for (const c of [concept, ...(options.answers ?? []).map((a) => a.concept)]) {
      if (!c || String(c).startsWith('__UNMAPPED__')) continue;
      if (!UUID.test(c) && !REFERENCE.test(c)) {
        // e.g. 9647586e-1081-901m-...: letters outside a-f. The database accepts any code, and these two project
        // concepts exist with exactly this code (master_new_concepts.csv; the local EthioEMR), so it's a warning:
        // make sure the concept exists on the target (Check concepts on the server does that)
        issues.push({
          level: 'warning',
          rule: 'concept-uuid-shape',
          where,
          questionId: q.id,
          message: `Concept code "${c}" is not a standard uuid (it has letters other than 0-9 and a-f). It works only where a concept was created with exactly this code; Check concepts on the server confirms it.`,
        });
      } else if (/^\d+A{4,}$/i.test(c) && c !== c.toUpperCase()) {
        // the server stores CIEL-style uuids in capitals and the engine compares letter by letter
        // (form-engine-lib 4.2.1 useFormFieldsMeta + form-helper findConceptByReference, obs-adapter findObsByFormField)
        issues.push({
          level: 'warning',
          rule: 'concept-uuid-case',
          where,
          questionId: q.id,
          message: `Concept ${c.slice(0, 12)}… is written in small letters; the dictionary has ${c
            .toUpperCase()
            .slice(
              0,
              12,
            )}…. Saving works, but when a saved form is opened again this answer may not show. Write it in capitals.`,
        });
      }
    }
    for (const c of [concept, ...(options.answers ?? []).map((a) => a.concept)]) {
      if (c && String(c).startsWith('__UNMAPPED__')) {
        issues.push({
          level: 'error',
          rule: 'unmapped',
          where,
          questionId: q.id,
          message: 'A concept still has to be picked.',
        });
        break;
      }
    }
    if (
      q.type === 'obs' &&
      CODED.has(options.rendering ?? '') &&
      options.rendering !== 'ui-select-extended' &&
      !options.answers?.length
    ) {
      issues.push({
        level: 'error',
        rule: 'no-answers',
        where,
        questionId: q.id,
        message: `A ${options.rendering} question with no answers shows an empty list.`,
      });
    }
    expressionChecks(q.hide?.hideWhenExpression, where, 'Hide rule', q.id);
    expressionChecks(options.calculate?.calculateExpression, where, 'Calculation', q.id);
    for (const v of q.validators ?? []) {
      expressionChecks(v.failsWhenExpression, where, 'Validation', q.id);
      expressionChecks(v.warnsWhenExpression, where, 'Warning rule', q.id);
    }
  }
  for (const page of schema.pages ?? []) {
    expressionChecks(page.hide?.hideWhenExpression, page.label ?? '', 'Page hide rule');
    for (const section of page.sections ?? []) {
      expressionChecks(section.hide?.hideWhenExpression, `${page.label} › ${section.label}`, 'Section hide rule');
    }
  }
  return issues;
}

/** Concepts and answers against the server's dictionary. */
export async function checkFormConcepts(
  schema: Schema,
  source: ConceptSource,
  blockedClasses: Array<string>,
  onProgress?: (done: number, total: number) => void,
  /** new concepts confirmed for this form (uuid -> name): not on the server yet, created by the export */
  pending: Map<string, string> = new Map(),
): Promise<Array<CheckIssue>> {
  const issues: Array<CheckIssue> = [];
  const all = walk(schema).filter(({ q }) => q.type === 'obs' || q.type === 'obsGroup');
  // a uuid, or a reference by code ("CIEL:169405"), which the engine resolves through /conceptreferences
  const lookup = async (ref: string) =>
    // anything that isn't a SOURCE:code reference is looked up as a uuid: the database accepts any code, and some
    // project concepts were created with non-standard ones (9647586e-1081-901m-..., in master_new_concepts.csv)
    UUID.test(ref) || !REFERENCE.test(ref) ? source.byUuid(ref) : source.byReference?.(ref);
  let done = 0;
  const queue = [...all];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { q, where } = item;
      const options = q.questionOptions ?? {};
      const uuid = options.concept;
      if (uuid && !uuid.startsWith('__UNMAPPED__')) {
        const concept: ServerConcept | undefined = pending.has(uuid) ? undefined : await lookup(uuid);
        if (pending.has(uuid)) {
          issues.push({
            level: 'warning',
            rule: 'new-concept',
            where,
            questionId: q.id,
            message: `New concept "${pending.get(uuid)}": created by the export (master_new_concepts.csv).`,
          });
        } else if (!concept) {
          issues.push({
            level: 'error',
            rule: 'concept-missing',
            where,
            questionId: q.id,
            message: `Concept ${uuid} does not exist on this server.`,
            detail: { value: uuid },
          });
        } else {
          const cls = concept.conceptClass?.display ?? '';
          if (concept.retired) {
            issues.push({
              level: 'warning',
              rule: 'concept-retired',
              where,
              questionId: q.id,
              message: `${concept.display} is retired.`,
            });
          }
          if (q.type === 'obsGroup' && !concept.set) {
            issues.push({
              level: 'warning',
              rule: 'group-not-set',
              where,
              questionId: q.id,
              message: `${concept.display} is not a set concept, so it can't hold a group.`,
            });
          }
          if (q.type === 'obs') {
            if (concept.set) {
              issues.push({
                level: 'error',
                rule: 'set-as-question',
                where,
                questionId: q.id,
                message: `${concept.display} is a set concept; it can't be a single question.`,
              });
            } else if (blockedClasses.includes(cls)) {
              issues.push({
                level: ERROR_CLASSES.includes(cls) ? 'error' : 'warning',
                rule: 'blocked-class',
                where,
                questionId: q.id,
                message: `"${q.label}" uses ${concept.display} (class ${cls}), which can't be a question here.`,
              });
            }
            const fit = RENDER_DATATYPES[options.rendering ?? ''];
            const datatype = concept.datatype?.display ?? '';
            if (fit && datatype && !fit.includes(datatype)) {
              issues.push({
                level: 'warning',
                rule: 'shape',
                where,
                questionId: q.id,
                message: `Rendering ${options.rendering} on a ${datatype} concept (${concept.display}).`,
              });
            }
          }
        }
      }
      for (const answer of options.answers ?? []) {
        if (!answer.concept || answer.concept.startsWith('__UNMAPPED__') || pending.has(answer.concept)) continue;
        const a = await lookup(answer.concept);
        if (!a) {
          issues.push({
            level: 'error',
            rule: 'answer-missing',
            where,
            questionId: q.id,
            message: `Answer "${answer.label}" points at ${answer.concept}, which does not exist on this server.`,
            detail: { value: answer.concept },
          });
        } else if (a.retired) {
          issues.push({
            level: 'warning',
            rule: 'answer-retired',
            where,
            questionId: q.id,
            message: `Answer "${answer.label}" (${a.display}) is retired.`,
          });
        }
      }
      onProgress?.(++done, all.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return issues;
}
