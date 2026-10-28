// Runs a drafted rule on sample answers, the way the form engine would, and prints what it gives.
// Input on stdin: {"expression": "...", "ids": ["question ids"], "probes": [{"set": {...}}]}. Output: [result, ...].
// Only for scoring drafts in eval_drafts.py: the helpers below copy the engine's behaviour for the names the
// drafting prompt allows (isEmpty, today, calcBMI, calcEDD, sex, age, myValue).
import fs from 'node:fs';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const helpers = {
  isEmpty: (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0),
  today: () => new Date('2026-10-28T00:00:00Z'),
  calcBMI: (h, w) => (h && w ? Number((Number(w) / (Number(h) / 100) ** 2).toFixed(1)) : null),
  calcEDD: (lmp) => (lmp ? new Date(new Date(lmp).getTime() + 280 * 864e5) : null),
};
const names = [...Object.keys(helpers), 'sex', 'age', 'myValue', ...input.ids.filter((i) => !(i in helpers))];
let fn;
try {
  fn = new Function(...names, `return (${input.expression});`);
} catch (e) {
  console.log(JSON.stringify(input.probes.map(() => ({ error: 'syntax' }))));
  process.exit(0);
}
const out = input.probes.map((p) => {
  try {
    const v = fn(...names.map((n) => (n in helpers ? helpers[n] : p.set[n])));
    return { value: v === undefined ? null : v };
  } catch (e) {
    return { error: String(e.message).slice(0, 80) };
  }
});
console.log(JSON.stringify(out));
