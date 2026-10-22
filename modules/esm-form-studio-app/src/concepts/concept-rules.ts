/**
 * Concept rules for the question dialog's search.
 * Each result is judged for the role it would play, then ranked so the right concept is the easy pick:
 *
 *  - a question concept: never retired, never a set (that is a group), never a class that can't be a question
 *    (Drug form always; the configured blocked classes are warnings, as in the Check), never an ICD-11
 *    extension code; its datatype should fit the rendering (warning);
 *  - a group concept: should be a set (warning: reuse an existing CIEL set);
 *  - an answer concept: never retired, never a set, never an ICD-11 extension-code diagnosis (X...; WHO says they
 *    can't be used alone); drugs are fine as answers, even when they map to an XM medicine code
 *    (they come from the drug team).
 *
 * Ranking: exact name, then names that start with the search, then the rest; inside each, concepts that fit before
 * ones with warnings, and concepts used in more forms first (reuse). Blocked ones go last.
 */
export type ConceptRole = 'question' | 'group' | 'answer';

export interface SearchConcept {
  uuid: string;
  display: string;
  retired?: boolean;
  set?: boolean;
  datatype?: { display?: string; name?: string };
  conceptClass?: { display?: string; name?: string };
  names?: Array<{ name?: string; display?: string }>;
  mappings?: Array<{ display?: string; conceptReferenceTerm?: { code?: string; display?: string } }>;
}

export interface Judged {
  concept: SearchConcept;
  verdict: 'ok' | 'warn' | 'blocked';
  reasons: Array<string>;
  usedIn: number;
  score: number;
}

/** Classes that never make sense as a question (the Cardiac "Na+" pointing at the Drug-form "NA"). */
export const NEVER_A_QUESTION = ['Drug form'];
const DRUG_CLASSES = ['Drug', 'Medicament'];

const RENDER_FITS: Record<string, Array<string>> = {
  number: ['Numeric'],
  text: ['Text'],
  textarea: ['Text'],
  date: ['Date', 'Datetime'],
  datetime: ['Datetime', 'Date'],
  radio: ['Coded', 'Boolean'],
  select: ['Coded', 'Boolean'],
  checkbox: ['Coded'],
  'content-switcher': ['Coded', 'Boolean'],
  toggle: ['Boolean', 'Coded'],
};

const lc = (s?: string) => (s ?? '').trim().toLowerCase();
const datatypeOf = (c: SearchConcept) => c.datatype?.display ?? c.datatype?.name ?? '';
const classOf = (c: SearchConcept) => c.conceptClass?.display ?? c.conceptClass?.name ?? '';
const namesOf = (c: SearchConcept) => [c.display, ...(c.names ?? []).map((n) => n.name ?? n.display)].filter(Boolean);

/** An ICD-11 extension code (Chapter X: XM medicines, XA anatomy, ...) among the concept's mappings. */
export function icd11ExtensionCode(c: SearchConcept): string | undefined {
  for (const m of c.mappings ?? []) {
    const text = m.display ?? m.conceptReferenceTerm?.display ?? '';
    const match = text.match(/ICD-11[^:]*:\s*(X\S+)/i);
    if (match) return match[1];
  }
  return undefined;
}

export function judgeConcept(
  c: SearchConcept,
  role: ConceptRole,
  options: { rendering?: string; blockedClasses?: Array<string> } = {},
): Pick<Judged, 'verdict' | 'reasons'> {
  const blocked: Array<string> = [];
  const warnings: Array<string> = [];
  const cls = classOf(c);
  const datatype = datatypeOf(c);
  if (c.retired) blocked.push('retired');
  // an ICD-11 extension code as a diagnosis can't be used alone; a drug that merely maps to an XM
  // medicine code is a real drug (the drug team's concept) and stays allowed
  const xCode = icd11ExtensionCode(c);
  if (xCode && !DRUG_CLASSES.includes(cls)) blocked.push(`ICD-11 extension code ${xCode}: can't be used alone`);
  if (role === 'question' && DRUG_CLASSES.includes(cls) && !options.blockedClasses?.includes(cls)) {
    warnings.push(`class ${cls}`);
  }
  if (role === 'group') {
    if (!c.set) warnings.push('not a set concept');
  } else if (c.set) {
    blocked.push(role === 'answer' ? 'a set, not an answer' : 'a set: use it for a group, not a question');
  }
  if (role === 'question') {
    if (NEVER_A_QUESTION.includes(cls)) blocked.push(`class ${cls} is never a question`);
    else if (options.blockedClasses?.includes(cls)) warnings.push(`class ${cls}`);
    const fits = RENDER_FITS[options.rendering ?? ''];
    if (fits && datatype && !fits.includes(datatype))
      warnings.push(`${datatype} concept, ${options.rendering} question`);
  }
  return blocked.length
    ? { verdict: 'blocked', reasons: blocked }
    : { verdict: warnings.length ? 'warn' : 'ok', reasons: warnings };
}

export function rankConcepts(
  concepts: Array<SearchConcept>,
  query: string,
  role: ConceptRole,
  options: { rendering?: string; blockedClasses?: Array<string>; usage?: Map<string, Array<string>> } = {},
): Array<Judged> {
  const q = lc(query);
  const seen = new Set<string>();
  return concepts
    .filter((c) => c?.uuid && !seen.has(c.uuid) && seen.add(c.uuid))
    .map((concept) => {
      const { verdict, reasons } = judgeConcept(concept, role, options);
      const names = namesOf(concept).map(lc);
      const nameScore = names.includes(q)
        ? 3
        : names.some((n) => n.startsWith(q))
          ? 2
          : names.some((n) => n.includes(q))
            ? 1
            : 0;
      const usedIn = options.usage?.get(concept.uuid.toLowerCase())?.length ?? 0;
      const verdictScore = verdict === 'ok' ? 2 : verdict === 'warn' ? 1 : -100;
      return {
        concept,
        verdict,
        reasons,
        usedIn,
        score: nameScore * 10 + verdictScore * 3 + Math.min(usedIn, 50) / 10,
      };
    })
    .sort((a, b) => b.score - a.score || a.concept.display.localeCompare(b.concept.display));
}
