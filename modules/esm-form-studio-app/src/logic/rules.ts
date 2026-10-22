/**
 * Rules in plain words. A clinician writes "Show this question only
 * when Smoker is Yes" or "Warn below 90 or above 120"; Form Studio writes the form-engine expression, and reads the
 * expressions already in a form back into those words.
 *
 * The patterns read here are the ones the 368 shipped forms actually use (counted 2026-10-17): they cover nearly
 * all of their 659 show/hide rules, 459 warnings, 135 number-format checks and the BMI and EDD calculations. Anything
 * else is a "rule written by hand": shown as it is, kept byte for byte, never rewritten unless a person replaces it.
 * An unedited rule keeps its original expression, so opening and saving a form never changes it.
 */

// show and hide
/**
 * `emptyHides`: while the controlling question (or the patient's age) is still empty, the question stays hidden
 * (true, the default for new rules: `isEmpty(x) || ...`) or shows (false: the shipped `x !== 'a'` and `age < 18` forms).
 * Kept from the form so a rule read and written back behaves exactly the same.
 */
export type Condition =
  /** an answer of a choice question: is one of the answers, is not, or (many-of) includes */
  | { kind: 'answer'; question: string; op: 'is' | 'is not' | 'includes'; values: Array<string>; emptyHides?: boolean }
  /** any question: has an answer or is empty (`falsy`: the shipped `!x` form) */
  | { kind: 'answered'; question: string; answered: boolean; falsy?: boolean }
  /** a number question compared with a number */
  | { kind: 'number'; question: string; op: '<' | '<=' | '>' | '>='; value: number; emptyHides?: boolean }
  | { kind: 'age'; op: '<' | '<=' | '>' | '>='; value: number; emptyHides?: boolean }
  | { kind: 'sex'; value: 'M' | 'F' };

export interface ShowRule {
  /** show the question only when these hold */
  conditions: Array<Condition>;
  join: 'all' | 'any';
}

export type Parsed<T> = { rule: T; original?: string } | { custom: string };

const ID = '[A-Za-z_$][\\w$]*';
const VALUE = `'([^']*)'`;
const NUM = '(-?\\d+(?:\\.\\d+)?)';
const OPPOSITE = { '<': '>=', '<=': '>', '>': '<=', '>=': '<' } as const;
type Cmp = keyof typeof OPPOSITE;

const strip = (e: string) => e.replace(/\s+/g, ' ').trim();
const balanced = (s: string) => {
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')' && --depth < 0) return false;
  }
  return depth === 0;
};
const unwrap = (e: string) => {
  let s = strip(e);
  while (s.startsWith('(') && s.endsWith(')') && balanced(s.slice(1, -1))) s = s.slice(1, -1).trim();
  return s;
};

/** split at top-level `op` (|| or &&), outside brackets and strings */
function splitTop(e: string, op: '||' | '&&'): Array<string> {
  const parts: Array<string> = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (quote) {
      if (c === quote && e[i - 1] !== '\\') quote = '';
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && e.startsWith(op, i)) {
      parts.push(e.slice(start, i).trim());
      start = i + op.length;
      i++;
    }
  }
  parts.push(e.slice(start).trim());
  return parts;
}

const re = (pattern: string) => new RegExp(`^${pattern}$`);

/**
 * One "hide when" term, turned into the condition under which the question shows (unguarded: shows while empty).
 * e.g. `smoker !== 'Yes'` hides when smoker isn't Yes, so it shows when smoker is Yes.
 */
function showFromHideTerm(term: string): Condition | undefined {
  const t = unwrap(term);
  let m: RegExpMatchArray | null;
  if ((m = t.match(re(`(${ID})\\s*!==?\\s*${VALUE}`))))
    return { kind: 'answer', question: m[1], op: 'is', values: [m[2]], emptyHides: false };
  if ((m = t.match(re(`(${ID})\\s*===?\\s*${VALUE}`))))
    return { kind: 'answer', question: m[1], op: 'is not', values: [m[2]], emptyHides: false };
  if ((m = t.match(re(`!(?:arrayContains|includes)\\(\\s*(${ID})\\s*,\\s*${VALUE}\\s*\\)`))))
    return { kind: 'answer', question: m[1], op: 'includes', values: [m[2]], emptyHides: false };
  if ((m = t.match(re(`!\\(\\s*(${ID})\\s*&&\\s*\\1\\.includes\\(\\s*${VALUE}\\s*\\)\\s*\\)`))))
    return { kind: 'answer', question: m[1], op: 'includes', values: [m[2]], emptyHides: true };
  if ((m = t.match(re(`isEmpty\\(\\s*(${ID})\\s*\\)`))) && m[1] !== 'age')
    return { kind: 'answered', question: m[1], answered: true };
  if ((m = t.match(re(`!isEmpty\\(\\s*(${ID})\\s*\\)`)))) return { kind: 'answered', question: m[1], answered: false };
  if ((m = t.match(re(`!(${ID})`)))) return { kind: 'answered', question: m[1], answered: true, falsy: true };
  if ((m = t.match(re(`(${ID})\\s*(<=|>=|<|>)\\s*${NUM}`)))) {
    const op = OPPOSITE[m[2] as Cmp];
    return m[1] === 'age'
      ? { kind: 'age', op, value: Number(m[3]), emptyHides: false }
      : { kind: 'number', question: m[1], op, value: Number(m[3]), emptyHides: false };
  }
  if ((m = t.match(/^sex\s*!==?\s*'([MF])'$/))) return { kind: 'sex', value: m[1] as 'M' | 'F' };
  return undefined;
}

const subject = (c: Condition) => (c.kind === 'age' ? 'age' : 'question' in c ? c.question : undefined);

/** "x is a" conditions on one question, merged into "x is a or b" */
function mergeAnyOf(conds: Array<Condition>, emptyHides: boolean): Condition | undefined {
  const all = conds.every((c) => c?.kind === 'answer' && c.op === 'is');
  const questions = new Set(conds.map(subject));
  if (!all || questions.size !== 1) return undefined;
  const first = conds[0] as Extract<Condition, { kind: 'answer' }>;
  return { ...first, values: conds.flatMap((c) => (c as typeof first).values), emptyHides };
}

/** Reads a hideWhenExpression into "show only when ...". */
export function parseHide(expression?: string): Parsed<ShowRule> | undefined {
  if (!expression?.trim()) return undefined;
  const e = unwrap(expression);
  const done = (conditions: Array<Condition>, join: ShowRule['join']) => ({
    rule: { conditions, join },
    original: expression,
  });

  const ors = splitTop(e, '||');
  if (ors.length > 1) {
    // the team's guard: `isEmpty(x) || <about x>` hides while x is empty
    const guarded = ors[0].match(re(`isEmpty\\(\\s*(${ID})\\s*\\)`))?.[1];
    const rest = guarded ? ors.slice(1) : ors;
    if (guarded && rest.length === 1) {
      const inner = splitTop(unwrap(rest[0]), '&&').map(showFromHideTerm);
      if (inner.length > 1) {
        const merged = mergeAnyOf(inner, true);
        if (merged && subject(merged) === guarded) return done([merged], 'all');
        return { custom: expression };
      }
      const one = inner[0];
      if (one && subject(one) === guarded && one.kind !== 'answered' && one.kind !== 'sex') {
        return done([{ ...one, emptyHides: true } as Condition], 'all');
      }
      // `isEmpty(x) || !x`: shown once x has a (truthy) answer
      if (one?.kind === 'answered' && one.falsy && one.question === guarded)
        return done([{ ...one, falsy: false }], 'all');
      return { custom: expression };
    }
    // hide when A || B  ->  show when not-A and not-B
    const conds = ors.map(showFromHideTerm);
    return conds.every(Boolean) ? done(conds, 'all') : { custom: expression };
  }

  const ands = splitTop(e, '&&');
  if (ands.length > 1) {
    const conds = ands.map(showFromHideTerm);
    if (!conds.every(Boolean)) return { custom: expression };
    const merged = mergeAnyOf(conds, false);
    // hide when A && B  ->  show when not-A or not-B
    return merged ? done([merged], 'all') : done(conds, 'any');
  }

  // `!(x === a || y === b)`  ->  show when x is a, or y is b
  const negated = e.match(/^!\((.*)\)$/s);
  if (negated && balanced(negated[1])) {
    const parts = splitTop(unwrap(negated[1]), '||');
    if (parts.length > 1) {
      const conds = parts.map((p) => {
        const m = unwrap(p).match(re(`(${ID})\\s*===?\\s*${VALUE}`));
        return m
          ? ({ kind: 'answer', question: m[1], op: 'is', values: [m[2]], emptyHides: false } as Condition)
          : undefined;
      });
      if (conds.every(Boolean)) return done(conds, 'any');
    }
  }

  const single = showFromHideTerm(e);
  return single ? done([single], 'all') : { custom: expression };
}

/** The hide term for one show condition, in the shipped forms' own style. */
function hideTerm(c: Condition): string {
  const guard = (q: string, rest: string, emptyHides?: boolean) =>
    emptyHides === false ? rest : `isEmpty(${q}) || ${rest}`;
  switch (c.kind) {
    case 'answer':
      if (c.op === 'includes')
        return guard(c.question, `!arrayContains(${c.question}, '${c.values[0]}')`, c.emptyHides);
      if (c.op === 'is not') return guard(c.question, `${c.question} === '${c.values[0]}'`, c.emptyHides ?? false);
      return c.values.length === 1
        ? guard(c.question, `${c.question} !== '${c.values[0]}'`, c.emptyHides)
        : guard(c.question, `(${c.values.map((v) => `${c.question} !== '${v}'`).join(' && ')})`, c.emptyHides);
    case 'answered':
      if (c.falsy) return `!${c.question}`;
      return c.answered ? `isEmpty(${c.question})` : `!isEmpty(${c.question})`;
    case 'number':
      return guard(c.question, `${c.question} ${OPPOSITE[c.op]} ${c.value}`, c.emptyHides);
    case 'age':
      return guard('age', `age ${OPPOSITE[c.op]} ${c.value}`, c.emptyHides);
    case 'sex':
      return `sex !== '${c.value}'`;
  }
}

export function compileShow(rule: ShowRule): string {
  const terms = rule.conditions.map(hideTerm);
  if (terms.length === 1) return terms[0];
  // show when all hold: hide when any fails; show when any holds: hide when all fail
  return rule.join === 'all' ? terms.map((t) => `(${t})`).join(' || ') : terms.map((t) => `(${t})`).join(' && ');
}

// warnings
export interface WarnRule {
  below?: number;
  above?: number;
  /** 'atOrBelow': the shipped "myValue <= 90" form (SpO2) */
  inclusive?: boolean;
}

/** `myValue && (myValue < 95 || myValue > 100)` and variants (409 of the 459 shipped warnings). */
export function parseWarn(expression?: string): Parsed<WarnRule> | undefined {
  if (!expression?.trim()) return undefined;
  const e = strip(expression)
    .replace(/^!isEmpty\(myValue\)\s*&&\s*/, '')
    .replace(/^myValue\s*&&\s*/, '');
  const terms = splitTop(unwrap(e), '||').map((t) => unwrap(t).match(/^myValue\s*(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)$/));
  if (!terms.length || terms.some((m) => !m)) return { custom: expression };
  const rule: WarnRule = {};
  for (const m of terms) {
    const value = Number(m[2]);
    if (m[1].startsWith('<')) {
      rule.below = value;
      if (m[1] === '<=') rule.inclusive = true;
    } else rule.above = value;
  }
  return { rule, original: expression };
}

export function compileWarn(rule: WarnRule): string {
  const terms = [
    rule.below !== undefined ? `myValue ${rule.inclusive ? '<=' : '<'} ${rule.below}` : '',
    rule.above !== undefined ? `myValue > ${rule.above}` : '',
  ].filter(Boolean);
  return `!isEmpty(myValue) && (${terms.join(' || ')})`;
}

// number format
/** The shipped "whole number", "1 decimal" and "2 decimals" checks (124 of the 135 hard validations). */
const DECIMAL_CHECKS: Record<number, string> = {
  0: "!isEmpty(myValue) && !/^-?\\d+$/.test(''+myValue)",
  1: "!isEmpty(myValue) && !/^-?\\d+(\\.\\d)?$/.test(''+myValue)",
  2: "!isEmpty(myValue) && !/^-?\\d+(\\.\\d{1,2})?$/.test(''+myValue)",
};

export function parseDecimals(expression?: string): number | undefined {
  const e = strip(expression ?? '');
  const hit = Object.entries(DECIMAL_CHECKS).find(([, check]) => strip(check) === e);
  return hit ? Number(hit[0]) : undefined;
}
export const compileDecimals = (places: number) => DECIMAL_CHECKS[places];
export const decimalsMessage = (places: number) =>
  places === 0 ? 'Whole numbers only.' : `At most ${places} decimal place${places > 1 ? 's' : ''}.`;

// calculations
export type CalcRule = { kind: 'bmi'; height: string; weight: string } | { kind: 'edd'; lnmp: string };

export function parseCalc(expression?: string): Parsed<CalcRule> | undefined {
  if (!expression?.trim()) return undefined;
  const e = strip(expression);
  let m = e.match(
    new RegExp(
      `^(?:\\(isEmpty\\((${ID})\\) \\|\\| isEmpty\\((${ID})\\)\\) \\? (?:null|''|"") : )?calcBMI\\(\\s*(${ID})\\s*,\\s*(${ID})\\s*\\)$`,
    ),
  );
  if (m) return { rule: { kind: 'bmi', height: m[3], weight: m[4] }, original: expression };
  m = e.match(new RegExp(`^calcEDD\\(\\s*(${ID})\\s*\\)$`));
  if (m) return { rule: { kind: 'edd', lnmp: m[1] }, original: expression };
  return { custom: expression };
}

export const compileCalc = (rule: CalcRule) =>
  rule.kind === 'bmi'
    ? `(isEmpty(${rule.height}) || isEmpty(${rule.weight})) ? null : calcBMI(${rule.height}, ${rule.weight})`
    : `calcEDD(${rule.lnmp})`;

// plain words
export interface Labels {
  question: (id: string) => string;
  answer: (questionId: string, conceptUuid: string) => string;
}

const OP_WORDS: Record<Cmp, string> = { '<': 'under', '<=': 'at most', '>': 'over', '>=': 'at least' };

export function describeCondition(c: Condition, labels: Labels): string {
  switch (c.kind) {
    case 'answer': {
      const answers = c.values.map((v) => `"${labels.answer(c.question, v)}"`);
      const list = answers.length > 1 ? `${answers.slice(0, -1).join(', ')} or ${answers.at(-1)}` : answers[0];
      return c.op === 'includes'
        ? `"${labels.question(c.question)}" includes ${list}`
        : `"${labels.question(c.question)}" is ${c.op === 'is not' ? 'not ' : ''}${list}`;
    }
    case 'answered':
      return `"${labels.question(c.question)}" ${c.answered ? 'has an answer' : 'is empty'}`;
    case 'number':
      return `"${labels.question(c.question)}" is ${OP_WORDS[c.op]} ${c.value}`;
    case 'age':
      return `the patient's age is ${OP_WORDS[c.op]} ${c.value}`;
    case 'sex':
      return `the patient is ${c.value === 'F' ? 'female' : 'male'}`;
  }
}

export const describeShow = (rule: ShowRule, labels: Labels) =>
  `Shown only when ${rule.conditions.map((c) => describeCondition(c, labels)).join(rule.join === 'all' ? ' and ' : ' or ')}.`;

export const describeWarn = (rule: WarnRule) =>
  `Warns (yellow, still saves) ${[
    rule.below !== undefined ? `${rule.inclusive ? 'at or below' : 'below'} ${rule.below}` : '',
    rule.above !== undefined ? `above ${rule.above}` : '',
  ]
    .filter(Boolean)
    .join(' or ')}.`;

export const describeCalc = (rule: CalcRule, labels: Labels) =>
  rule.kind === 'bmi'
    ? `Calculated: BMI from "${labels.question(rule.height)}" and "${labels.question(rule.weight)}".`
    : `Calculated: expected delivery date from "${labels.question(rule.lnmp)}".`;
