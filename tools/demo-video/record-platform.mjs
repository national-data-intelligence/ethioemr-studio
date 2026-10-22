// Step 2 for the platform demo (about 2.5 min): one platform, three parts. A short Form Studio segment (open, edit,
// rule sentence, Check), then the AI assistant: Help & Search with sources, Speak in Amharic (the virtual microphone
// plays services/asr-service/test-audio/consult-am.wav), and the Diagnosis Assistant's cited differential.
// Selectors: tools/demo-check/ui-check.mjs and modules/esm-form-studio-app/e2e. Nothing is saved to the chart or to content/.
// Output: build/raw-platform.webm and build/marks-platform.json, then `node build.mjs platform`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { startRecording, blackCard, openFormStudioFromMenu, SPA, BASE, BUILD, ROOT, sleep, APP_MENU_SEL } from './rec-lib.mjs';

const PATIENT = JSON.parse(fs.readFileSync(path.join(BUILD, 'demo.json'), 'utf8')).patient; // Almaz Bekele (synthetic)
const AUTH = 'Basic ' + Buffer.from('admin:Admin123').toString('base64');
// The consultation the virtual microphone "hears" (build.mjs mixes the same file into the video), padded with silence.
const CONSULT_SRC = process.env.CONSULT_WAV || path.resolve(ROOT, '../../services/asr-service/test-audio/consult-am.wav');
const CONSULT_WAV = path.join(BUILD, 'consult-padded.wav');
execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', CONSULT_SRC, '-af', 'adelay=800:all=1,apad=pad_dur=1.5',
  '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', CONSULT_WAV]);
const CONSULT_SECONDS = (fs.statSync(CONSULT_WAV).size - 44) / 32000;

// Preconditions: triage vitals on the demo patient, speech service up.
const enc = await (await fetch(`${BASE}/ws/rest/v1/encounter?patient=${PATIENT}&v=custom:(encounterType:(display))&limit=100`, { headers: { Authorization: AUTH } })).json();
if (!enc.results.some((e) => e.encounterType.display === 'Triage')) throw new Error('No triage vitals: run node setup-demo-data.mjs --with-vitals');
const asr = await fetch('http://localhost:8767/health').then((r) => r.json()).catch(() => null);
if (!asr) throw new Error('speech service is not running on localhost:8767');
console.log(`patient ok; speech service: ${asr.model}`);

const r = await startRecording({
  cut: 'platform', asrLanguage: 'am',
  launchArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${CONSULT_WAV}`],
});
const { p, marks, now, beat, go, ff, cutOut, tag, untag, glide, type, scrollTo, closePopup, wheel, finish } = r;
const heading = (t) => new RegExp(`^\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
async function point(text) {
  const el = p.getByText(heading(text)).first();
  if (!(await el.count())) return console.log(`   (no "${text}" in this answer)`);
  await el.scrollIntoViewIfNeeded(); await glide(el, { click: false });
}
async function wheelOverPanel(dy, steps = 6) {
  const b = await p.locator('button[aria-label="Close assistant (Alt+A)"]').boundingBox();
  await wheel(dy, steps, { x: b.x - 150, y: b.y + 300 });
}
// Wait for an AI answer inside a fast-forward. If the AI service hiccups ("network error" or "not reachable"), the
// failed attempt is cut from the video and Retry is pressed, as a presenter would; the retry is fast-forwarded again.
const AI_ERROR = /AI service not reachable|network error/i;
async function aiWait(label, success, timeout) {
  for (let attempt = 1; ; attempt++) {
    const n = marks.ff.length;
    const outcome = await ff(label, () => Promise.race([
      success.waitFor({ timeout }).then(() => 'ok'),
      p.getByText(AI_ERROR).first().waitFor({ timeout }).then(() => 'error'),
    ]).catch(() => 'timeout'));
    if (outcome === 'ok') return;
    if (attempt === 3 || !(await p.getByRole('button', { name: 'Retry' }).count())) throw new Error(`AI answer failed: ${outcome}`);
    console.log(`   AI ${outcome} on attempt ${attempt}: cutting it and pressing Retry`);
    const failed = marks.ff.splice(n, 1)[0]; // turn the failed fast-forward into a jump cut
    marks.cuts.push({ t0: failed.t0, t1: now() });
    await cutOut(async () => { await p.getByRole('button', { name: 'Retry' }).first().click(); await sleep(500); });
  }
}

try {
  // ---- Title ----
  await p.setContent(blackCard('Platform demo', 'EthioEMR', [
    'The team&#39;s EMR, built on OpenMRS',
    'Form Studio: build and check clinical forms',
    'AI assistant: cited answers, Amharic speech, a cited differential']));
  await beat('t1');

  // ---- Form Studio, short ----
  await go(SPA + '/home', async () => { await p.locator(APP_MENU_SEL).waitFor({ timeout: 60000 }); await sleep(2500); });
  await beat('f1', async () => {
    await openFormStudioFromMenu(r);
    await glide(p.getByText(/of 300 items/).first(), { click: false });
  });
  await beat('f2', async () => {
    await type(p.getByPlaceholder(/search this list/i), 'gynecology', 45);
    const row = p.getByTestId('forms-table').locator('tbody tr', { hasText: 'Emergency Triage Form - Gynecology' });
    await glide(row.getByRole('button', { name: /edit schema/i }));
    await p.getByTestId('preview-page-0').waitFor({ timeout: 90000 }); await closePopup();
    await glide(p.getByRole('tab', { name: /preview & edit/i }), { click: false }); await sleep(600);
    await glide(p.getByRole('tab', { name: /^preview$/i }), { click: false, dy: 3 });
  });
  const pv = p.getByTestId('preview-question-pv');
  const rules = p.getByRole('dialog').filter({ has: p.getByRole('heading', { name: 'Rules for "PV"' }) });
  await beat('f3', async () => {
    await scrollTo(pv, 260);
    await glide(pv.getByRole('button', { name: /^rules: when it shows/i }));
    await rules.waitFor();
    await glide(rules.getByText(/^only when…$/i));
    const basedOn = rules.getByRole('combobox', { name: /^based on$/i });
    await glide(basedOn, { click: false }); await basedOn.selectOption({ label: 'Vaginal Bleeding' }); await sleep(300);
    await glide(rules.getByText(/^yes$/i));
    await glide(rules.getByRole('button', { name: /^save rules$/i }));
    await rules.waitFor({ state: 'hidden' });
    await glide(pv.getByText('Shown only when "Vaginal Bleeding" is "Yes".'), { click: false, dx: 0.1 });
  });
  await beat('f4', async () => {
    const preview = p.getByRole('tabpanel').filter({ has: p.getByText(/^vaginal bleeding$/i) });
    const bleeding = preview.getByRole('group', { name: /vaginal bleeding/i });
    await scrollTo(bleeding, 330);
    await glide(bleeding.getByText(/^yes$/i));
    const pvShown = preview.getByText(/^PV$/);
    await pvShown.waitFor(); await glide(pvShown, { click: false });
  });
  await beat('f5', async () => {
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(900);
    await glide(p.getByRole('button', { name: /check concepts on the server/i }));
    await p.getByText(/^concepts checked$/i).first().waitFor({ timeout: 120000 });
    await glide(p.getByText(/^0 errors$/i).first(), { click: false }); await sleep(1000);
    await glide(p.getByRole('button', { name: /download content files/i }), { click: false });
  });

  // ---- How the assistant answers (flat RAG card) ----
  await p.goto('file:///' + path.join(ROOT, 'rag.html').replace(/\\/g, '/').replace(/ /g, '%20'));
  await beat('rag', async () => {
    for (const n of [1, 2, 3]) { await p.evaluate((n) => window.step(n), n); await sleep(2600); }
  });

  // ---- Help & Search ----
  await go(SPA + '/home/patient-scoreboard', () => p.locator('button[aria-label="Open assistant (Alt+A)"]').waitFor({ timeout: 60000 }));
  await beat('h1', async () => {
    await glide(p.locator('button[aria-label="Open assistant (Alt+A)"]')); await sleep(400);
    await glide(p.getByRole('button', { name: /Help & Search/ })); await sleep(400);
    await p.getByText(/Loading forms/).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
    const q = p.getByPlaceholder(/Search forms, fields/);
    await type(q, 'danger signs of severe malaria', 40);
    if (!(await q.inputValue()).includes('malaria')) throw new Error('search text did not land in the box');
    await sleep(500);
    await glide(p.getByRole('button', { name: /Ask: answer from these results/ }));
  });
  await aiWait('Retrieving passages and writing the answer', p.getByText('Sources:').first(), 150000);
  await beat('h2', async () => {
    await wheelOverPanel(-200, 3); await sleep(1200);
    await glide(p.getByText('Sources:').first(), { click: false }); await sleep(400); await wheelOverPanel(120, 3);
  });

  // ---- Speak the consultation, then Diagnosis ----
  await p.locator('button[aria-label="Close assistant (Alt+A)"]').click({ timeout: 3000 }).catch(() => {});
  await go(`${SPA}/patient/${PATIENT}/chart/Patient%20Summary`, async () => {
    await p.getByText('Active Visit').first().waitFor({ timeout: 90000 }); await sleep(1500);
  });
  await beat('s1', async () => {
    const fab = p.locator('button[aria-label="Open assistant (Alt+A)"]');
    if (await fab.count()) await glide(fab);
    await sleep(400);
    await glide(p.getByRole('button', { name: /Diagnosis Assistant/ })); await sleep(600);
    await type(p.getByPlaceholder(/fever and headache/), 'fever and headache for 3 days', 35);
    await glide(p.getByRole('radio', { name: /Speak/ }).last()); await sleep(500);
    await p.getByText(/Speech service ok/).first().waitFor({ timeout: 15000 });
  });
  // The consultation itself: no narration; the viewer hears what the microphone gets.
  const mic = p.locator('[data-testid="ai-mic-button"]').last();
  await glide(mic);
  marks.sfx.push({ t: now(), file: CONSULT_WAV, seconds: CONSULT_SECONDS });
  console.log(`[${now().toFixed(1)}s] consultation audio (${CONSULT_SECONDS.toFixed(1)}s)`);
  await tag('<span>Consultation in Amharic</span><b>recording</b>');
  await sleep(CONSULT_SECONDS * 1000 + 300);
  await untag();
  await mic.click(); // Stop
  await ff('Local speech model at work', async () => {
    const spinner = p.locator('.cds--inline-loading__text', { hasText: /Transcribing/ });
    await spinner.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await spinner.first().waitFor({ state: 'hidden', timeout: 180000 });
  });
  await beat('s2', async () => {
    const box = p.locator('textarea:visible').last();
    marks.transcript = await box.inputValue();
    console.log('transcript:', JSON.stringify(marks.transcript));
    if (!/[ሀ-፿]/.test(marks.transcript)) throw new Error('no Amharic text in the transcript');
    await glide(box, { click: false }); await sleep(1500);
    await glide(p.getByText(/s of audio/).first(), { click: false }).catch(() => {});
  });
  await beat('s3', async () => {
    await glide(p.getByText(/Records to send/).first(), { click: false }).catch(() => {}); await sleep(700);
    await glide(p.getByRole('button', { name: /Suggest differential/ }));
  });
  await aiWait('Retrieving guidelines and reading the chart', p.getByRole('button', { name: /Suggest again/ }), 200000);
  await beat('d1', async () => {
    await point('DIFFERENTIAL DIAGNOSIS'); await sleep(900); await wheelOverPanel(220, 6);
  });
  await beat('d2', async () => {
    await point('GUIDELINE REFERENCES'); await sleep(1300);
    await point('Suggestions only: nothing is written to the chart.');
  });

  // ---- Close ----
  await p.setContent(blackCard('EthioEMR', 'One platform', [
    'The team&#39;s EMR',
    'Form Studio: forms with plain-word rules and a concept Check',
    'AI assistant: answers that cite Ethiopian and WHO guidelines']));
  await beat('end');
  await sleep(800);
} finally {
  await finish();
}
