/**
 * Concept matching for an intake, checked against the live dictionary on this server. The rules:
 *  - a source system's own uuids are never used; a CIEL id is used only if it exists here;
 *  - a name match must be exact (any of the concept's names, any case) and must fit: datatype for the question
 *    type, class not blocked (diagnoses, drugs, sets), not retired;
 *  - ambiguous one-word labels ("Date", "Remarks", "Site" and the like) are not matched by name: a wrong concept
 *    is worse than none;
 *  - answers come from the matched question concept's own answers first.
 * Anything left over stays unmatched with a reason, and the editor flags it.
 */
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { allQuestions, type ConceptMatch, type IntakeForm, type IntakeQuestion, type IntakeType } from './intake-types';
import { NO, YES } from './build-schema';

export interface ServerConcept {
  uuid: string;
  display: string;
  retired?: boolean;
  /** a set concept: the only kind that can hold a group (obsGroup) */
  set?: boolean;
  datatype?: { display: string };
  conceptClass?: { display: string };
  names?: Array<{ name: string }>;
  answers?: Array<{ uuid: string; display: string; names?: Array<{ name: string }> }>;
}

export interface NumericDetails {
  allowDecimal?: boolean;
  units?: string;
  hiNormal?: number;
  lowNormal?: number;
  hiAbsolute?: number;
  lowAbsolute?: number;
}

export interface ConceptSource {
  byUuid: (uuid: string) => Promise<ServerConcept | undefined>;
  byName: (name: string) => Promise<Array<ServerConcept>>;
  /** a concept by code reference, e.g. "CIEL:169405" (the engine resolves these through /conceptreferences) */
  byReference?: (reference: string) => Promise<ServerConcept | undefined>;
  /** a Numeric concept's decimals, unit and ranges (the exports carry none of them) */
  numeric?: (uuid: string) => Promise<NumericDetails | undefined>;
}

const REP =
  'custom:(uuid,display,retired,set,datatype:(display),conceptClass:(display),names:(name),answers:(uuid,display,names:(name)))';

/** Two result lists as one, exact-name hits first, each concept once. */
export function mergeByUuid<T extends { uuid: string }>(first: Array<T>, second: Array<T>): Array<T> {
  const seen = new Set<string>();
  return [...first, ...second].filter((c) => !seen.has(c.uuid) && seen.add(c.uuid));
}

/** The live server, with each lookup made once. */
export function serverConcepts(): ConceptSource {
  const uuidCache = new Map<string, Promise<ServerConcept | undefined>>();
  const nameCache = new Map<string, Promise<Array<ServerConcept>>>();
  return {
    byUuid: (uuid) => {
      if (!uuidCache.has(uuid)) {
        uuidCache.set(
          uuid,
          openmrsFetch<ServerConcept>(`${restBaseUrl}/concept/${encodeURIComponent(uuid)}?v=${REP}`).then(
            (r) => r.data,
            () => undefined,
          ),
        );
      }
      return uuidCache.get(uuid);
    },
    byReference: (reference) =>
      openmrsFetch<Record<string, ServerConcept>>(
        `${restBaseUrl}/conceptreferences?references=${encodeURIComponent(reference)}&v=${REP}`,
      ).then(
        (r) => r.data?.[reference],
        () => undefined,
      ),
    numeric: (uuid) =>
      openmrsFetch<NumericDetails>(
        `${restBaseUrl}/concept/${encodeURIComponent(uuid)}?v=custom:(allowDecimal,units,hiNormal,lowNormal,hiAbsolute,lowAbsolute)`,
      ).then(
        (r) => r.data,
        () => undefined,
      ),
    byName: (name) => {
      const key = name.trim().toLowerCase();
      if (!nameCache.has(key)) {
        // the server's text search (?q=) misses exact names when its index is behind: ask ?name= too
        const ask = (param: string) =>
          openmrsFetch<{ results: Array<ServerConcept> }>(
            `${restBaseUrl}/concept?${param}=${encodeURIComponent(name.trim())}&limit=50&v=${REP}`,
          ).then(
            (r) => r.data?.results ?? [],
            () => [] as Array<ServerConcept>,
          );
        nameCache.set(
          key,
          Promise.all([ask('name'), ask('q')]).then(([exact, text]) => mergeByUuid(exact, text)),
        );
      }
      return nameCache.get(key);
    },
  };
}

/** Labels too vague to match by name (the same list as the Python converter). */
export const GENERIC = new Set(
  (
    'name date other remark remarks signature status cause diagnosis type result time notes note language route ' +
    'complication complications duration assessment plan size ward level amount reason comment comments management ' +
    'recommendation problem concentration dose frequency quantity color colour shape texture distribution surface ' +
    'tone inspection palpation percussion auscultation sensory general specify details description value category ' +
    'group method action grade quality site region position movement sound finding findings impression indication'
  ).split(' '),
);
GENERIC.add('if other specify');
GENERIC.add('other specify');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** CIEL ids from Bahmni come cut to 32 characters: pad the A's back to 36. */
export const padCiel = (id: string) => (/^\d+A+$/.test(id) && id.length < 36 ? id + 'A'.repeat(36 - id.length) : id);
export const isCiel = (id: string) => /^\d+A+$/.test(padCiel(id)) && padCiel(id).length === 36;
export const looksLikeUuid = (text: string) => UUID.test(text.trim()) || isCiel(text.trim());

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Datatypes a question type can be stored in. */
export const DATATYPES: Partial<Record<IntakeType, Array<string>>> = {
  text: ['Text'],
  'long text': ['Text'],
  number: ['Numeric'],
  calculated: ['Numeric'],
  date: ['Date'],
  'date-time': ['Datetime'],
  time: ['Time', 'Text'],
  'yes/no': ['Boolean', 'Coded'],
  'one of': ['Coded'],
  'many of': ['Coded'],
  dropdown: ['Coded'],
};

export function fits(
  concept: ServerConcept,
  type: IntakeType | 'group',
  blockedClasses: Array<string>,
): string | undefined {
  if (concept.retired) {
    return `${concept.display} is retired`;
  }
  // a group needs an existing set concept (never a new one); a set is never a plain question
  if (type === 'group') {
    return concept.set ? undefined : `${concept.display} is not a set concept, so it can't hold a group`;
  }
  if (concept.set) {
    return `${concept.display} is a set concept, which can't be a single question`;
  }
  if (blockedClasses.includes(concept.conceptClass?.display ?? '')) {
    return `${concept.display} is a ${concept.conceptClass.display} concept, which can't be a question`;
  }
  const allowed = DATATYPES[type];
  if (allowed && !allowed.includes(concept.datatype?.display ?? '')) {
    return `${concept.display} is ${concept.datatype?.display ?? 'of another datatype'}, not ${allowed.join(' or ')}`;
  }
  return undefined;
}

const hasName = (concept: { display: string; names?: Array<{ name: string }> }, name: string) =>
  norm(concept.display) === norm(name) || (concept.names ?? []).some((n) => norm(n.name) === norm(name));

/** Strip a trailing unit or note in brackets: "Weight (kg)" -> "Weight". */
const bareLabel = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '').trim();

async function matchQuestion(
  q: IntakeQuestion,
  source: ConceptSource,
  blocked: Array<string>,
): Promise<{ match?: ConceptMatch; concept?: ServerConcept; why?: string }> {
  const reasons: Array<string> = [];
  const tryUuid = async (uuid: string, how: ConceptMatch['how']) => {
    const concept = await source.byUuid(uuid);
    if (!concept) {
      reasons.push(`${uuid} is not on this server`);
      return undefined;
    }
    const problem = fits(concept, q.type, blocked);
    if (problem) {
      reasons.push(problem);
      return undefined;
    }
    return {
      match: { uuid: concept.uuid, display: concept.display, datatype: concept.datatype?.display, how },
      concept,
    };
  };

  if (q.concept && looksLikeUuid(q.concept)) {
    const hit = await tryUuid(padCiel(q.concept.trim()), 'given uuid');
    if (hit) return hit;
  }
  if (q.cielHint && isCiel(q.cielHint)) {
    const hit = await tryUuid(padCiel(q.cielHint), 'CIEL id');
    if (hit) return hit;
  }
  const names = [
    q.concept && !looksLikeUuid(q.concept) ? q.concept : '',
    ...(q.names ?? []),
    q.label,
    bareLabel(q.label),
  ]
    .map((n) => n?.trim())
    .filter((n, i, all) => n && all.indexOf(n) === i);
  const chosen = q.concept && !looksLikeUuid(q.concept) ? q.concept.trim() : undefined;
  for (const name of names) {
    // a name a person typed in the Concept column is a deliberate choice; labels that are too general are not
    if (name !== chosen && GENERIC.has(norm(name))) {
      reasons.push(`"${name}" is too general to match by name`);
      continue;
    }
    const found = (await source.byName(name)).filter((c) => hasName(c, name));
    const fitting = found.filter((c) => !fits(c, q.type, blocked));
    if (
      fitting.length === 1 ||
      (fitting.length > 1 && fitting.filter((c) => norm(c.display) === norm(name)).length === 1)
    ) {
      const concept = fitting.length === 1 ? fitting[0] : fitting.find((c) => norm(c.display) === norm(name));
      return {
        match: { uuid: concept.uuid, display: concept.display, datatype: concept.datatype?.display, how: 'exact name' },
        concept,
      };
    }
    if (fitting.length > 1) {
      reasons.push(`${fitting.length} concepts are named "${name}"`);
    } else if (found.length) {
      reasons.push(fits(found[0], q.type, blocked));
    }
  }
  return { why: reasons[0] ?? 'no concept with this name' };
}

async function matchOptions(q: IntakeQuestion, questionConcept: ServerConcept | undefined, source: ConceptSource) {
  if (q.type === 'yes/no') {
    return;
  }
  for (const option of (q.options ?? []).filter((o) => !o.match)) {
    const names = [
      option.concept && !looksLikeUuid(option.concept) ? option.concept : '',
      option.label,
      ...(option.names ?? []),
    ].filter(Boolean);
    // 1. the question concept's own answers
    const own = questionConcept?.answers?.find((a) => names.some((n) => hasName(a, n)));
    if (own) {
      option.match = { uuid: own.uuid, display: own.display, how: 'answer of the question concept' };
      continue;
    }
    if (/^yes$/i.test(option.label)) {
      option.match = { uuid: YES, display: 'Yes', how: 'standard yes/no' };
      continue;
    }
    if (/^no$/i.test(option.label)) {
      option.match = { uuid: NO, display: 'No', how: 'standard yes/no' };
      continue;
    }
    // 2. a given uuid or a CIEL id that exists here
    for (const [id, how] of [
      [option.concept && looksLikeUuid(option.concept) ? padCiel(option.concept.trim()) : '', 'given uuid'],
      [option.cielHint && isCiel(option.cielHint) ? padCiel(option.cielHint) : '', 'CIEL id'],
    ] as Array<[string, ConceptMatch['how']]>) {
      if (!id || option.match) continue;
      const concept = await source.byUuid(id);
      if (concept && !concept.retired) {
        option.match = { uuid: concept.uuid, display: concept.display, how };
      }
    }
    if (option.match) continue;
    // 3. one exact name, not a drug or diagnosis
    for (const name of names) {
      if (GENERIC.has(norm(name))) continue;
      const found = (await source.byName(name)).filter(
        (c) => hasName(c, name) && !c.retired && !['Drug', 'Diagnosis'].includes(c.conceptClass?.display ?? ''),
      );
      if (found.length === 1) {
        option.match = { uuid: found[0].uuid, display: found[0].display, how: 'exact name' };
        break;
      }
    }
  }
}

/** Matches every question and answer in place. `onProgress(done, total)` drives the progress bar. */
/**
 * The server's numeric settings fill what the source left out. A concept that forbids decimals makes the question
 * whole-number too, or the save fails with HTTP 400.
 */
export async function applyNumericDetails(q: IntakeQuestion, details?: NumericDetails) {
  if (!details) return;
  if (details.allowDecimal === false) q.whole = true;
  if (details.units && !q.unit && !q.label.toLowerCase().includes(details.units.toLowerCase())) q.unit = details.units;
  q.warnBelow ??= details.lowNormal ?? undefined;
  q.warnAbove ??= details.hiNormal ?? undefined;
  q.min ??= details.lowAbsolute ?? undefined;
  q.max ??= details.hiAbsolute ?? undefined;
}

/** The form being rebuilt, as shipped: label -> its concept and answers (continuity first). */
interface ShippedQuestion {
  label?: string;
  questionOptions?: { concept?: string; answers?: Array<{ concept?: string; label?: string }> };
  questions?: Array<ShippedQuestion>;
}
export function indexShippedForm(shipped?: {
  pages?: Array<{ sections?: Array<{ questions?: Array<ShippedQuestion> }> }>;
}) {
  const index = new Map<string, ShippedQuestion>();
  const visit = (q: ShippedQuestion) => {
    const concept = q.questionOptions?.concept;
    if (q.label && concept && !String(concept).startsWith('__')) {
      for (const key of [norm(q.label), norm(bareLabel(q.label.replace(/:$/, '')))]) {
        if (!index.has(key)) index.set(key, q);
      }
    }
    (q.questions ?? []).forEach(visit);
  };
  shipped?.pages?.forEach((page) => page.sections?.forEach((section) => section.questions?.forEach(visit)));
  return index;
}

export async function matchConcepts(
  form: IntakeForm,
  options: {
    source?: ConceptSource;
    blockedClasses: Array<string>;
    onProgress?: (done: number, total: number) => void;
    /** the shipped form this intake rebuilds: its questions' concepts are reused first */
    shipped?: Parameters<typeof indexShippedForm>[0];
  },
) {
  const source = options.source ?? serverConcepts();
  const shipped = indexShippedForm(options.shipped);
  /** the same question (by label) in the shipped form, if its concept still exists here and fits */
  const fromShipped = async (
    q: IntakeQuestion,
  ): Promise<{ match?: ConceptMatch; concept?: ServerConcept; why?: string } | undefined> => {
    const previous = shipped.get(norm(q.label)) ?? shipped.get(norm(bareLabel(q.label)));
    const concept = previous && (await source.byUuid(previous.questionOptions.concept));
    if (!concept || fits(concept, q.type, options.blockedClasses)) {
      return undefined;
    }
    for (const option of q.options ?? []) {
      const answer = previous.questionOptions.answers?.find((a) => a.label && norm(a.label) === norm(option.label));
      if (answer?.concept && !answer.concept.startsWith('__')) {
        option.match = { uuid: answer.concept, display: answer.label, how: 'same question in the shipped form' };
      }
    }
    return {
      match: {
        uuid: concept.uuid,
        display: concept.display,
        datatype: concept.datatype?.display,
        how: 'same question in the shipped form' as const,
      },
      concept,
    };
  };
  const work = allQuestions(form)
    .map(({ question }) => question)
    .filter((q) => q.type !== 'note' && !q.fromEmr);
  let done = 0;
  const queue = [...work];
  const worker = async () => {
    for (let q = queue.shift(); q; q = queue.shift()) {
      const { match, concept, why } =
        (await fromShipped(q)) ?? (await matchQuestion(q, source, options.blockedClasses));
      q.match = match;
      q.unmatched = match ? undefined : why;
      if (match?.datatype === 'Numeric' && source.numeric) {
        await applyNumericDetails(q, await source.numeric(match.uuid));
      }
      await matchOptions(q, concept, source);
      options.onProgress?.(++done, work.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return form;
}
