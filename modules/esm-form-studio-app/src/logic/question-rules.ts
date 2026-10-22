/**
 * One question's rules, read from and written into the form. Only what a person changed is
 * rewritten; everything else in the question, including rules "written by hand", stays byte for byte.
 */
import {
  compileCalc,
  compileDecimals,
  compileShow,
  compileWarn,
  decimalsMessage,
  describeCalc,
  describeShow,
  describeWarn,
  type CalcRule,
  type Labels,
  type Parsed,
  parseCalc,
  parseDecimals,
  parseHide,
  parseWarn,
  type ShowRule,
  type WarnRule,
} from './rules';

export interface RuleQuestion {
  id?: string;
  label?: string;
  type?: string;
  hide?: { hideWhenExpression?: string };
  validators?: Array<{ type?: string; warnsWhenExpression?: string; failsWhenExpression?: string; message?: string }>;
  questionOptions?: {
    rendering?: string;
    concept?: string;
    answers?: Array<{ concept?: string; label?: string }>;
    calculate?: { calculateExpression?: string };
  };
  readonly?: boolean | string;
  questions?: Array<RuleQuestion>;
}

export interface QuestionRules {
  show?: Parsed<ShowRule>;
  warn?: Parsed<WarnRule>;
  decimals?: number;
  calc?: Parsed<CalcRule>;
}

export function readRules(q: RuleQuestion): QuestionRules {
  const validators = q.validators ?? [];
  const warnExpr = validators.find((v) => v.warnsWhenExpression)?.warnsWhenExpression;
  const decimals = validators.map((v) => parseDecimals(v.failsWhenExpression)).find((d) => d !== undefined);
  return {
    show: parseHide(q.hide?.hideWhenExpression),
    warn: parseWarn(warnExpr),
    decimals,
    calc: parseCalc(q.questionOptions?.calculate?.calculateExpression),
  };
}

/** What a person set in the rules dialog. `undefined` = remove; a key left out = unchanged. */
export interface RuleEdits {
  show?: ShowRule | null;
  warn?: WarnRule | null;
  decimals?: number | null;
  calc?: CalcRule | null;
}

export function writeRules<Q extends RuleQuestion>(question: Q, edits: RuleEdits): Q {
  const q: Q = structuredClone(question);
  if ('show' in edits) {
    if (edits.show?.conditions.length) q.hide = { ...q.hide, hideWhenExpression: compileShow(edits.show) };
    else delete q.hide;
  }
  if ('warn' in edits) {
    const others = (q.validators ?? []).filter((v) => !v.warnsWhenExpression);
    const hasLimit = edits.warn && (edits.warn.below !== undefined || edits.warn.above !== undefined);
    q.validators = hasLimit
      ? [
          ...others,
          {
            type: 'js_expression',
            warnsWhenExpression: compileWarn(edits.warn),
            message: `${describeWarn(edits.warn)
              .replace(/^Warns \(yellow, still saves\) /, 'Unusual value: ')
              .replace(/\.$/, '')}. Please check.`,
          },
        ]
      : others;
  }
  if ('decimals' in edits) {
    const others = (q.validators ?? []).filter((v) => parseDecimals(v.failsWhenExpression) === undefined);
    q.validators =
      edits.decimals === null || edits.decimals === undefined
        ? others
        : [
            ...others,
            {
              type: 'js_expression',
              failsWhenExpression: compileDecimals(edits.decimals),
              message: decimalsMessage(edits.decimals),
            },
          ];
  }
  if ('calc' in edits) {
    q.questionOptions = { ...q.questionOptions };
    if (edits.calc) {
      q.questionOptions.calculate = { calculateExpression: compileCalc(edits.calc) };
      q.readonly = true;
    } else {
      delete q.questionOptions.calculate;
    }
  }
  // drop the list only if this edit emptied it (a form's own empty list stays as it was)
  if (('warn' in edits || 'decimals' in edits) && q.validators && !q.validators.length && question.validators?.length) {
    delete q.validators;
  }
  return q;
}

/** Labels from the form itself: question labels by id, answer labels by question and concept. */
export function labelsFor(schema: {
  pages?: Array<{ sections?: Array<{ questions?: Array<RuleQuestion> }> }>;
}): Labels {
  const byId = new Map<string, RuleQuestion>();
  const visit = (q: RuleQuestion) => {
    if (q.id) byId.set(q.id, q);
    q.questions?.forEach(visit);
  };
  schema.pages?.forEach((p) => p.sections?.forEach((s) => s.questions?.forEach(visit)));
  return {
    question: (id) => byId.get(id)?.label?.replace(/:$/, '') ?? id,
    answer: (id, concept) =>
      byId.get(id)?.questionOptions?.answers?.find((a) => a.concept === concept)?.label ??
      (/^1065A/.test(concept) ? 'Yes' : /^1066A/.test(concept) ? 'No' : concept.slice(0, 8)),
  };
}

/** Every rule of a question as plain sentences (for the preview and the Rules overview). */
export function ruleSentences(
  q: RuleQuestion,
  labels: Labels,
): Array<{ kind: 'show' | 'warn' | 'format' | 'calc' | 'custom'; text: string }> {
  const r = readRules(q);
  const out: Array<{ kind: 'show' | 'warn' | 'format' | 'calc' | 'custom'; text: string }> = [];
  if (r.show)
    out.push(
      'rule' in r.show
        ? { kind: 'show', text: describeShow(r.show.rule, labels) }
        : { kind: 'custom', text: 'Has a show/hide rule written by hand.' },
    );
  if (r.warn)
    out.push(
      'rule' in r.warn
        ? { kind: 'warn', text: describeWarn(r.warn.rule) }
        : { kind: 'custom', text: 'Has a warning rule written by hand.' },
    );
  if (r.decimals !== undefined) out.push({ kind: 'format', text: decimalsMessage(r.decimals) });
  if (r.calc)
    out.push(
      'rule' in r.calc
        ? { kind: 'calc', text: describeCalc(r.calc.rule, labels) }
        : { kind: 'custom', text: 'Calculated by a formula written by hand.' },
    );
  return out;
}
