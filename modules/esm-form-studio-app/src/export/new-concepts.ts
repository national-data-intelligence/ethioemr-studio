/**
 * New concepts for a form. Only for what is
 * still unmatched after the dictionary search; a person confirms each one. Rules kept here:
 *  - class and datatype from the question: an answer option is Finding, N/A; a yes/no question is Question, Coded
 *    with the CIEL Yes 1065 and No 1066 answers; a measurement is Question, Numeric with units, absolute range and
 *    allow-decimals; a note is Question, Text; a date or time is Question with Date, Datetime or Time;
 *  - never a set or group concept (groups reuse an existing set concept), never Diagnosis, drug or
 *    ICD-11;
 *  - names in natural clinical English, no parenthetical tags, no question mark, under 80 characters;
 *  - uuids are random (uuid4); answers are written before the questions that use them.
 * The confirmed concepts are kept with the draft (browser storage, per form uuid) until the export writes them as
 * rows for content/.../concepts/master_new_concepts.csv.
 */
import { YES, NO } from '../intake/build-schema';

export interface NewConcept {
  uuid: string;
  name: string;
  description: string;
  conceptClass: 'Question' | 'Finding';
  datatype: 'Text' | 'Numeric' | 'Coded' | 'Date' | 'Datetime' | 'Time' | 'N/A';
  /** answer uuids, for Coded */
  answers?: Array<string>;
  units?: string;
  absoluteLow?: string;
  absoluteHigh?: string;
  allowDecimal?: boolean;
  /** where it is used, for the person reviewing */
  usedBy: string;
}

/** What needs a new concept: the placeholder it replaces and a proposal a person can edit. */
export interface Proposal {
  placeholder: string;
  /** the form already points at this code, but this EMR doesn't have the concept: it is created with that code,
   * so the form stays as it is (the Check's concept-missing and answer-missing) */
  missingOnServer?: boolean;
  concept: NewConcept;
  /** placeholders of the answer concepts this question uses (created first) */
  answerPlaceholders?: Array<string>;
}

interface Q {
  id?: string;
  label?: string;
  type?: string;
  questionOptions?: {
    rendering?: string;
    concept?: string;
    answers?: Array<{ concept?: string; label?: string }>;
    min?: string;
    max?: string;
    disallowDecimals?: boolean;
    datePickerFormat?: string;
  };
  datePickerFormat?: string;
  questions?: Array<Q>;
}
interface Schema {
  name?: string;
  uuid?: string;
  pages?: Array<{ label?: string; sections?: Array<{ label?: string; questions?: Array<Q> }> }>;
}

const isPlaceholder = (c?: string) => Boolean(c) && String(c).startsWith('__UNMAPPED__');

/** A CIEL-style code (5089AAAA...): those concepts come from CIEL, so Form Studio never creates them; they are
 * loaded into each environment by the dictionary owner. A missing one is reported for the dictionary owner to load. */
export const isCielCode = (c?: string) => /^\d+A{4,}$/i.test(String(c ?? ''));

/** A code a concept can be created with: a standard uuid, with or without dashes. A broken code (letters outside
 * a-f, like the Antenatal card's 9647586e-1081-901m-...) can't be kept: that question needs a real concept instead. */
const VALID_UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** Missing codes Form Studio may create with the same code: valid uuids, not placeholders, not CIEL. */
export const creatableMissing = (missing: Iterable<string>) =>
  new Set([...missing].filter((c) => c && !isPlaceholder(c) && !isCielCode(c) && VALID_UUID.test(c)));

/** A new concept name: natural English, no parenthetical tags, no "?" or ":", sentence case, under 80 characters. */
export function conceptName(label: string): string {
  let name = (label ?? '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[?:*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name === name.toUpperCase() && /[A-Z]{4,}/.test(name)) name = name.toLowerCase();
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return name.length > 80 ? name.slice(0, 80).replace(/\s+\S*$/, '') : name;
}

const DATATYPE: Record<string, NewConcept['datatype']> = {
  text: 'Text',
  textarea: 'Text',
  number: 'Numeric',
  date: 'Date',
  datetime: 'Datetime',
  radio: 'Coded',
  select: 'Coded',
  checkbox: 'Coded',
  'content-switcher': 'Coded',
  toggle: 'Coded',
};

/**
 * Every placeholder in the form that can become a new concept (groups can't: they need an existing set), and every
 * code in `missing` (concepts the form points at that this EMR doesn't have; see creatableMissing): those keep
 * their code, so the form doesn't change and the export adds the concept.
 */
export function proposeNewConcepts(
  schema: Schema,
  newUuid: () => string = () => crypto.randomUUID(),
  missing: Set<string> = new Set(),
): Array<Proposal> {
  const proposals = new Map<string, Proposal>();
  const needs = (c?: string) => isPlaceholder(c) || (Boolean(c) && missing.has(c));
  const uuidFor = (c: string) => (missing.has(c) ? c : newUuid());
  const formName = schema.name || 'this form';
  for (const page of schema.pages ?? []) {
    for (const section of page.sections ?? []) {
      const visit = (q: Q) => {
        q.questions?.forEach(visit);
        if (q.type !== 'obs') return;
        const options = q.questionOptions ?? {};
        const where = `${formName} › ${section.label} › ${q.label}`;
        for (const answer of options.answers ?? []) {
          if (needs(answer.concept) && !proposals.has(answer.concept)) {
            proposals.set(answer.concept, {
              placeholder: answer.concept,
              missingOnServer: missing.has(answer.concept) || undefined,
              concept: {
                uuid: uuidFor(answer.concept),
                name: conceptName(answer.label),
                description: `Answer "${answer.label}" to "${q.label}" on ${formName}.`,
                conceptClass: 'Finding',
                datatype: 'N/A',
                usedBy: where,
              },
            });
          }
        }
        if (!needs(options.concept) || proposals.has(options.concept)) return;
        const timer = q.datePickerFormat === 'timer' || options.datePickerFormat === 'timer';
        const datatype = timer ? 'Time' : (DATATYPE[options.rendering ?? ''] ?? 'Text');
        const answers = (options.answers ?? []).map((a) => a.concept).filter(Boolean);
        const yesNo = answers.length === 2 && answers.includes(YES) && answers.includes(NO);
        proposals.set(options.concept, {
          placeholder: options.concept,
          missingOnServer: missing.has(options.concept) || undefined,
          answerPlaceholders: answers.filter(needs),
          concept: {
            uuid: uuidFor(options.concept),
            name: conceptName(q.label),
            description: `${conceptName(q.label)}, recorded on ${formName}.`,
            conceptClass: 'Question',
            datatype,
            answers: datatype === 'Coded' ? (yesNo ? [YES, NO] : answers) : undefined,
            units: datatype === 'Numeric' ? (q.label?.match(/\(([^)]+)\)\s*$/)?.[1] ?? '') : undefined,
            absoluteLow: datatype === 'Numeric' ? (options.min ?? '') : undefined,
            absoluteHigh: datatype === 'Numeric' ? (options.max ?? '') : undefined,
            allowDecimal: datatype === 'Numeric' ? !options.disallowDecimals : undefined,
            usedBy: where,
          },
        });
      };
      section.questions?.forEach(visit);
    }
  }
  return [...proposals.values()];
}

/** Problems that stop a proposal (shown next to it). */
export function proposalProblems(p: Proposal, existingNames: Set<string>): Array<string> {
  const c = p.concept;
  const problems: Array<string> = [];
  if (!c.name.trim()) problems.push('A name is needed.');
  if (/[()?]/.test(c.name)) problems.push('No brackets or question marks in a concept name.');
  if (c.name.length > 80) problems.push('Keep the name under 80 characters.');
  if (existingNames.has(c.name.trim().toLowerCase())) {
    problems.push('A concept with this name already exists: reuse it (pencil on the question) instead of a new one.');
  }
  if (!c.description.trim()) problems.push('A description is needed.');
  if (c.datatype === 'Numeric' && !c.units?.trim()) problems.push('A measurement needs its units.');
  return problems;
}

/** Puts the confirmed uuids in place of the placeholders. Returns a new schema; the input is not changed. */
export function applyNewConcepts<S>(schema: S, proposals: Array<Proposal>): S {
  let text = JSON.stringify(schema);
  for (const p of proposals) {
    text = text.split(`"${p.placeholder}"`).join(`"${p.concept.uuid}"`);
  }
  // answer lists of the new coded questions point at the new answer uuids too
  const byPlaceholder = new Map(proposals.map((p) => [p.placeholder, p.concept.uuid]));
  for (const p of proposals) {
    if (p.concept.answers) p.concept.answers = p.concept.answers.map((a) => byPlaceholder.get(a) ?? a);
  }
  return JSON.parse(text);
}

// kept with the draft until export
const KEY = 'formStudioNewConcepts';

export function loadNewConcepts(formUuid: string): Array<NewConcept> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')[formUuid] ?? [];
  } catch {
    return [];
  }
}

export function saveNewConcepts(formUuid: string, concepts: Array<NewConcept>) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    all[formUuid] = concepts;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the concepts still live in this page until it is closed
  }
}
