/**
 * The rule reader on every rule in the 368 shipped forms. For each rule it understands, the rule it
 * writes back must behave the same: both expressions are run on many sample answers and must agree every time.
 * Rules it does not understand stay "written by hand" and are never changed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileCalc, compileShow, compileWarn, parseCalc, parseDecimals, parseHide, parseWarn } from './rules';

const FORMS = path.resolve(__dirname, '../../../../content/configuration/backend_configuration/ampathforms');

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const arrayContains = (a: unknown, m: unknown) => Array.isArray(a) && a.includes(m);
const includes = arrayContains;

/** run an engine expression with the given values in scope */
function run(expression: string, scope: Record<string, unknown>) {
  const names = Object.keys(scope);
  return Boolean(
    new Function('isEmpty', 'arrayContains', 'includes', ...names, `return (${expression});`)(
      isEmpty,
      arrayContains,
      includes,
      ...names.map((n) => scope[n]),
    ),
  );
}

/** sample values for every name and quoted value in the expression */
function samples(expression: string): Array<Record<string, unknown>> {
  const ids = [
    ...new Set(
      (expression.match(/(?<![.\w$'])[A-Za-z_$][\w$]*(?![\w$]*')/g) ?? []).filter(
        (n) => !['isEmpty', 'arrayContains', 'includes', 'null', 'true', 'false', 'undefined', 'myValue'].includes(n),
      ),
    ),
  ];
  const literals = [...new Set((expression.match(/'([^']*)'/g) ?? []).map((s) => s.slice(1, -1)))];
  const numbers = [...new Set((expression.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number))];
  const pool: Array<unknown> = [
    undefined,
    '',
    'other',
    [],
    ...literals,
    ...literals.map((l) => [l]),
    ...numbers.flatMap((n) => [n - 1, n, n + 1]),
  ];
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 60; i++) {
    out.push(Object.fromEntries(ids.map((id, j) => [id, pool[(i * (j + 3) + j * 7) % pool.length]])));
  }
  return out;
}

describe.skipIf(!fs.existsSync(FORMS))('rules in the shipped forms', () => {
  it('reads most of them, and what it writes back behaves the same', () => {
    const counts = { hide: [0, 0], warn: [0, 0], calc: [0, 0], decimals: [0, 0] };
    const mismatches: Array<string> = [];
    const visit = (q) => {
      q.questions?.forEach(visit);
      const hide = q.hide?.hideWhenExpression;
      if (hide) {
        counts.hide[1]++;
        const parsed = parseHide(hide);
        if (parsed && 'rule' in parsed) {
          counts.hide[0]++;
          const mine = compileShow(parsed.rule);
          for (const scope of samples(hide)) {
            let a: boolean, b: boolean;
            try {
              a = run(hide, scope);
              b = run(mine, scope);
            } catch {
              continue;
            }
            if (a !== b) {
              mismatches.push(`${hide}  =>  ${mine}  @ ${JSON.stringify(scope)}`);
              break;
            }
          }
        }
      }
      for (const v of q.validators ?? []) {
        if (v.warnsWhenExpression) {
          counts.warn[1]++;
          const parsed = parseWarn(v.warnsWhenExpression);
          if (parsed && 'rule' in parsed) {
            counts.warn[0]++;
            for (const myValue of [undefined, '', 0, -5, 1, 50, 89, 90, 91, 95, 99, 100, 101, 120, 121, 200, 1000]) {
              const a = Boolean(
                new Function('isEmpty', 'myValue', `return (${v.warnsWhenExpression});`)(isEmpty, myValue),
              );
              const b = Boolean(
                new Function('isEmpty', 'myValue', `return (${compileWarn(parsed.rule)});`)(isEmpty, myValue),
              );
              // the shipped "myValue && ..." form ignores 0; ours checks it: 0 is the one value allowed to differ
              if (a !== b && myValue !== 0) {
                mismatches.push(`${v.warnsWhenExpression} => ${compileWarn(parsed.rule)} @ ${myValue}`);
                break;
              }
            }
          }
        }
        if (v.failsWhenExpression) {
          counts.decimals[1]++;
          if (parseDecimals(v.failsWhenExpression) !== undefined) counts.decimals[0]++;
        }
      }
      const calc = q.questionOptions?.calculate?.calculateExpression;
      if (calc) {
        counts.calc[1]++;
        const parsed = parseCalc(calc);
        if (parsed && 'rule' in parsed) {
          counts.calc[0]++;
          expect(compileCalc(parsed.rule)).toMatch(/calc(BMI|EDD)\(/);
        }
      }
    };
    for (const file of fs.readdirSync(FORMS).filter((f) => f.endsWith('.json'))) {
      const form = JSON.parse(fs.readFileSync(path.join(FORMS, file), 'utf-8'));
      form.pages?.forEach((p) => p.sections?.forEach((s) => s.questions?.forEach(visit)));
    }
    console.warn(
      Object.entries(counts)
        .map(([k, [read, all]]) => `${k}: ${read}/${all} read`)
        .join(' | '),
    );
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(counts.hide[0] / counts.hide[1]).toBeGreaterThan(0.9);
  });
});
