// Demo-readiness check, browser part: drives each demo feature the way a presenter would and records
// pass or fail, timing and a screenshot per step. Run through `.\platform.ps1 demo-check` (which also runs the
// service checks), or alone: node tools/demo-check/ui-check.mjs
// Needs the demo patient (tools/demo-video/setup-demo-data.mjs --with-vitals) and the speech service for Speak.
// Writes work/demo-check/<time>/report.json and one PNG per step. Does not save any form.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../demo-video/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EMR = process.env.EMR_URL || 'http://localhost:18200/openmrs';
const SPA = EMR + '/spa';
const PATIENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/demo-video/build/demo.json'), 'utf8')).patient;
const WAV = path.join(ROOT, 'services/asr-service/test-audio/consult-am.wav');
const OUT = path.join(ROOT, 'work/demo-check', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}`],
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 900 }, permissions: ['microphone'] });
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const aiErrors = [];
p.on('console', (m) => { if (m.type() === 'error' && /ai-assistant|asr|aiService|form-studio/i.test(m.text())) aiErrors.push(m.text().slice(0, 300)); });

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  let status = 'pass', detail = '';
  try { detail = (await fn()) || ''; } catch (e) { status = 'fail'; detail = String(e.message || e).split('\n')[0].slice(0, 300); }
  const shot = `${String(results.length + 1).padStart(2, '0')}-${name.replace(/\W+/g, '-').toLowerCase()}.png`;
  await p.screenshot({ path: path.join(OUT, shot) }).catch(() => {});
  results.push({ name, status, seconds: Math.round((Date.now() - t0) / 1000), detail, screenshot: shot });
  console.log(`${status.toUpperCase().padEnd(4)} ${name} (${results.at(-1).seconds}s) ${detail}`);
}
const assistant = async (tool) => {
  const fab = p.locator('button[aria-label="Open assistant (Alt+A)"]');
  if (await fab.count()) await fab.click();
  await p.getByRole('button', { name: new RegExp(tool) }).click();
  await p.waitForTimeout(800);
};
// The team build shows a red "Some modules have unresolved backend dependencies" pop-up on every page. It covers
// the chart's right-hand buttons and takes keyboard focus (typing then presses its "View modules" button), so
// close it first, as the presenter must do too.
const closePopup = async () => {
  await p.waitForTimeout(1500);
  for (const x of await p.locator('button[aria-label="close notification"]').all()) await x.click({ timeout: 2000 }).catch(() => {});
};
// Wait for an AI result; if the panel says the AI service is not reachable, press Retry (as a presenter would)
// up to twice. Returns how many retries were needed so the report shows a flaky service even when it passes.
async function aiResult(success, timeout) {
  for (let retries = 0; ; retries++) {
    const ok = success.waitFor({ timeout }).then(() => 'ok');
    const err = p.getByText(/AI service not reachable/).first().waitFor({ timeout }).then(() => 'error');
    if ((await Promise.race([ok, err]).catch(() => 'timeout')) === 'ok') return retries ? ` (after ${retries} retry)` : '';
    if (retries === 2 || !(await p.getByRole('button', { name: 'Retry' }).count())) throw new Error('AI service not reachable or no answer, after ' + retries + ' retries');
    await p.getByRole('button', { name: 'Retry' }).first().click();
  }
}
const closeAssistant = () => p.locator('button[aria-label="Close assistant (Alt+A)"]').click({ timeout: 3000 }).catch(() => {});
const openChart = async () => {
  await p.goto(`${SPA}/patient/${PATIENT}/chart/Patient%20Summary`);
  await p.getByText('Active Visit').first().waitFor({ timeout: 90000 });
  await closePopup();
};

await step('Log in', async () => {
  await p.goto(SPA + '/login');
  await p.fill('#username', 'admin'); await p.click('button:has-text("Continue")');
  await p.fill('#password', 'Admin123'); await p.click('button[type=submit]');
  await p.waitForURL(/home|location/, { timeout: 60000 });
  await closePopup();
  if (/location/.test(p.url())) { await p.getByText('Main Pharmacy').click(); await p.getByRole('button', { name: /Confirm/ }).click(); await p.waitForURL(/home/); }
  // Speak: Amharic with English medical words (this browser only; same as Implementer Tools temporary config)
  await p.evaluate(() => localStorage.setItem('openmrs:temporaryConfig', JSON.stringify({ '@palladium-ethiopia/esm-ai-assistant-app': { asrLanguage: 'am' } })));
  return p.url();
});

await step('Form Studio: start page and form list', async () => {
  await p.goto(SPA + '/form-studio');
  await p.getByText(/Form Studio/).first().waitFor({ timeout: 60000 });
  await closePopup();
  return (await p.locator('h1, h2, h3').allInnerTexts()).slice(0, 4).join(' | ');
});

await step('Form Builder: form list', async () => {
  await p.goto(SPA + '/form-builder');
  await p.locator('table tbody tr').first().waitFor({ timeout: 60000 });
  return `${await p.locator('table tbody tr').count()} rows on the first page`;
});

await step('Patient chart opens (demo patient)', async () => {
  await openChart();
  await p.getByText('Almaz Bekele').first().waitFor();
  return 'Almaz Bekele, active visit';
});

await step('AI: Help & Search answers with sources', async () => {
  await assistant('Help & Search');
  await p.getByText(/Loading forms/).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await p.getByPlaceholder(/Search forms, fields/).fill('danger signs of severe malaria');
  await p.getByRole('button', { name: /Ask: answer from these results/ }).click();
  return 'answer shown with Sources' + (await aiResult(p.getByText('Sources:').first(), 150000));
});
await closeAssistant();

await step('AI: Form Filler fills the triage form', async () => {
  await openChart();
  await p.getByRole('button', { name: 'Clinical forms' }).click();
  await p.getByPlaceholder('Search this list').fill('Central Triage');
  await p.getByText('Central Triage Form', { exact: true }).click();
  await p.getByText('Systolic (mmHg)').first().waitFor({ timeout: 60000 });
  await assistant('Form Filler');
  await p.getByText('Whole form', { exact: true }).click();
  await p.locator('textarea:visible').last().fill('BP 130/85, temp 38.2, pulse 96, weight 62 kg, height 160 cm');
  await p.getByRole('button', { name: /Find values/ }).click();
  const ffNote = await aiResult(p.getByText(/FOUND \d+ VALUES/i).first(), 150000);
  const found = await p.getByText(/FOUND \d+ VALUES/i).first().innerText();
  await p.getByRole('button', { name: /^Insert accepted/ }).click();
  await closeAssistant();
  const sys = await p.getByLabel(/Systolic/).first().inputValue().catch(() => '?');
  if (sys !== '130') throw new Error(`${found}; Systolic field holds "${sys}", expected 130`);
  return `${found}; Systolic = 130 (form not saved)${ffNote}`;
});

await step('AI: Speak transcribes Amharic', async () => {
  await openChart();
  await assistant('Diagnosis Assistant');
  await p.getByPlaceholder(/fever and headache/).fill('fever and headache for 3 days');
  await p.getByRole('radio', { name: /Speak/ }).last().click();
  await p.getByText(/Speech service ok/).first().waitFor({ timeout: 15000 });
  const mic = p.locator('[data-testid="ai-mic-button"]').last();
  await mic.click(); await p.waitForTimeout(12000); await mic.click();
  const spinner = p.locator('.cds--inline-loading__text', { hasText: /Transcribing/ });
  await spinner.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await spinner.first().waitFor({ state: 'hidden', timeout: 180000 });
  const text = (await p.locator('textarea:visible').last().inputValue()).trim();
  if (!/[ሀ-፿]/.test(text)) throw new Error(`no Amharic text in transcript: "${text.slice(0, 120)}"`);
  return text.slice(0, 140);
});

await step('AI: Diagnosis Assistant gives a differential', async () => {
  await p.getByRole('button', { name: /Suggest differential/ }).click();
  const note = await aiResult(p.getByRole('button', { name: /Suggest again/ }), 200000);
  const body = await p.locator('body').innerText();
  if (!/differential diagnosis/i.test(body)) throw new Error('no DIFFERENTIAL DIAGNOSIS section');
  return /guideline references/i.test(body) ? 'differential with guideline references' + note : 'differential (no guideline section seen)' + note;
});

await browser.close();
const summary = { when: new Date().toISOString(), emr: EMR, passed: results.filter((r) => r.status === 'pass').length, total: results.length, aiConsoleErrors: aiErrors, results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.total} passed. AI console errors: ${aiErrors.length}. Report and screenshots: ${OUT}`);
process.exit(summary.passed === summary.total ? 0 : 1);
