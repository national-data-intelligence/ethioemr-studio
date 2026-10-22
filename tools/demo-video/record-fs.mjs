// Step 2 for the Form Studio video guide (about 3.5 min): records the real Form Studio, scene by scene, following
// docs/platform/DEMO-RUNBOOK.md Part A. Edits stay in this browser: nothing is saved to the EMR or exported to content/.
// Output: build/raw-fs.webm and build/marks-fs.json, then `node build.mjs fs` makes out/form-studio-guide.mp4.
import { startRecording, blackCard, openFormStudioFromMenu, SPA, EXCEL_EXAMPLE, sleep, APP_MENU_SEL } from './rec-lib.mjs';

const r = await startRecording({ cut: 'fs' });
const { p, beat, go, glide, type, scrollTo, closePopup, finish } = r;
const dialog = (heading) => p.getByRole('dialog').filter({ has: p.getByRole('heading', { name: heading }) });
const smoothTop = () => p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).then(() => sleep(900));
const SHOWN_WHEN_BLEEDING = 'Shown only when "Vaginal Bleeding" is "Yes".';

try {
  // ---- Title ----
  await p.setContent(blackCard('Video guide for form builders', 'Form Studio', [
    'Edit a form: sections, questions and rules in plain words',
    'Check every concept on the server before export',
    'Start a new form from an Excel template',
    'Search the concept dictionary']));
  await beat('t1');

  // ---- Open it from the app menu ----
  await go(SPA + '/home', async () => { await p.locator(APP_MENU_SEL).waitFor({ timeout: 60000 }); await sleep(2500); });
  await beat('o1', () => openFormStudioFromMenu(r));

  // ---- Start page ----
  await beat('s1', async () => {
    await glide(p.getByText(/create a new form/i).first(), { click: false }); await sleep(900);
    for (const name of [/from scratch/i, /from a bahmni export/i, /from an excel template/i]) {
      await glide(p.getByRole('link', { name }), { click: false }); await sleep(1100);
    }
  });
  await beat('s2', async () => {
    await glide(p.getByText(/of 300 items/).first(), { click: false }); await sleep(1500);
    await type(p.getByPlaceholder(/search this list/i), 'gynecology', 70);
    await sleep(800);
  });

  // ---- Edit an existing form ----
  await beat('e1', async () => {
    const row = p.getByTestId('forms-table').locator('tbody tr', { hasText: 'Emergency Triage Form - Gynecology' });
    await glide(row.getByRole('button', { name: /edit schema/i }));
    await p.getByTestId('preview-page-0').waitFor({ timeout: 90000 });
    await closePopup();
  });
  await beat('e2', async () => {
    for (const view of [/preview & edit/i, /^rules$/i, /schema editor/i]) {
      await glide(p.getByRole('tab', { name: view }), { click: false }); await sleep(600);
    }
    await sleep(500);
    await glide(p.getByRole('tab', { name: /^preview$/i }), { click: false, dy: 3 }); await sleep(1200);
    await glide(p.getByText(/^check$/i).first(), { click: false }); await sleep(600);
    await glide(p.getByRole('button', { name: /download content files/i }), { click: false });
  });
  // Rename a section (Triage Assessment > Patient Information)
  const page1 = p.getByTestId('preview-page-1');
  const sectionHeading = page1.getByRole('heading', { level: 5 }).first();
  await beat('n1', async () => {
    await scrollTo(page1, 180); await sleep(400);
    await glide(page1.getByRole('button', { name: /^edit section$/i }).first());
    const edit = dialog(/edit section/i);
    await edit.waitFor();
    await type(edit.getByRole('textbox', { name: /enter a section title/i }), 'Patient details', 70);
  });
  await beat('n2', async () => {
    const edit = dialog(/edit section/i);
    await glide(edit.getByRole('button', { name: /^save$/i }));
    await edit.waitFor({ state: 'hidden' });
    await glide(sectionHeading, { click: false }); await sleep(900);
    // the same name in the form's JSON
    await glide(p.getByRole('tab', { name: /schema editor/i }));
    await p.waitForFunction(() => window.ace && document.getElementById('schemaEditor'));
    await p.evaluate(() => { const ed = window.ace.edit('schemaEditor'); ed.find('Patient details'); ed.centerSelection?.(); });
    await sleep(1800);
    await glide(p.getByRole('tab', { name: /preview & edit/i }));
    await page1.waitFor();
  });
  // Add a question
  await beat('q1', async () => {
    await scrollTo(page1, 180);
    await glide(page1.getByRole('button', { name: /^add question$/i }).first());
    const q = dialog(/create a new question/i);
    await q.waitFor();
    await type(q.getByRole('textbox', { name: /^label/i }), 'Pulse on arrival', 55);
    await type(q.getByRole('textbox', { name: /question id/i }), 'pulseOnArrival', 45);
    const qt = q.getByRole('combobox', { name: /question type/i });
    await glide(qt, { click: false }); await qt.selectOption('obs'); await sleep(400);
    const rt = q.getByRole('combobox', { name: /rendering type/i });
    await glide(rt, { click: false }); await rt.selectOption('number'); await sleep(400);
    await type(q.getByRole('searchbox').first(), 'pulse', 90);
  });
  await beat('q2', async () => {
    const q = dialog(/create a new question/i);
    const results = q.getByTestId('ranked-concepts').first();
    await results.waitFor({ timeout: 60000 }); await sleep(600);
    await glide(results.locator('li:not([aria-disabled="true"])').first()); await sleep(700);
    await glide(q.getByRole('button', { name: /^save$/i }));
    await q.waitFor({ state: 'hidden' });
    const added = p.getByTestId('preview-question-pulseOnArrival');
    await scrollTo(added, 300); await glide(added, { click: false, dx: 0.3 });
  });

  // ---- Rules in plain words ----
  const pv = p.getByTestId('preview-question-pv');
  await beat('r1', async () => {
    await scrollTo(pv, 260); await sleep(500);
    await glide(pv, { click: false, dx: 0.2 }); await sleep(1500);
    await glide(pv.getByRole('button', { name: /^rules: when it shows/i }));
  });
  const rules = p.getByRole('dialog').filter({ has: p.getByRole('heading', { name: 'Rules for "PV"' }) });
  await beat('r2', async () => {
    await rules.waitFor();
    await glide(rules.getByText(/^only when…$/i)); await sleep(300);
    const basedOn = rules.getByRole('combobox', { name: /^based on$/i });
    await glide(basedOn, { click: false }); await basedOn.selectOption({ label: 'Vaginal Bleeding' }); await sleep(500);
    await glide(rules.getByText(/^yes$/i)); await sleep(300);
    await glide(rules.getByRole('button', { name: /^save rules$/i }));
    await rules.waitFor({ state: 'hidden' });
  });
  await beat('r3', async () => {
    await glide(pv.getByText(SHOWN_WHEN_BLEEDING), { click: false, dx: 0.1 });
  });
  await beat('r4', async () => {
    const preview = p.getByRole('tabpanel').filter({ has: p.getByText(/^vaginal bleeding$/i) });
    const bleeding = preview.getByRole('group', { name: /vaginal bleeding/i });
    await scrollTo(bleeding, 330); await sleep(300);
    if (await preview.getByText(/^PV$/).count()) throw new Error('PV visible before the rule is met');
    await glide(bleeding, { click: false, dy: 1.6 }); await sleep(500);
    await glide(bleeding.getByText(/^yes$/i));
    const pvShown = preview.getByText(/^PV$/);
    await pvShown.waitFor();
    await glide(pvShown, { click: false });
  });

  // ---- Check concepts on the server ----
  await beat('c1', async () => {
    await smoothTop();
    await glide(p.getByRole('button', { name: /check concepts on the server/i }));
  });
  await beat('c2', async () => {
    await p.getByText(/^concepts checked$/i).first().waitFor({ timeout: 120000 });
    await glide(p.getByText(/^0 errors$/i).first(), { click: false }); await sleep(1600);
    const dl = p.getByRole('button', { name: /download content files/i });
    if (await dl.isDisabled()) throw new Error('download still disabled after a clean Check');
    await glide(dl, { click: false });
  });

  // ---- New form from the Excel template ----
  await go(SPA + '/form-studio', () => p.getByTestId('forms-table').locator('tbody tr').first().waitFor({ timeout: 60000 }));
  await beat('x1', async () => {
    await glide(p.getByRole('link', { name: /from an excel template/i }));
    await p.getByText(/drag the .* here or click to choose it/i).first().waitFor();
    await closePopup();
    await glide(p.getByRole('link', { name: /download the empty template/i }), { click: false }); await sleep(900);
    await glide(p.getByRole('link', { name: /download a filled example/i }), { click: false }); await sleep(1200);
    await glide(p.getByText(/drag the .* here or click to choose it/i).first(), { click: false }); await sleep(600);
    await p.locator('input[type="file"]').setInputFiles(EXCEL_EXAMPLE);
  });
  await beat('x2', async () => {
    await p.getByRole('heading', { name: /what came out/i }).waitFor({ timeout: 150000 });
    await glide(p.getByRole('heading', { name: /what came out/i }), { click: false }); await sleep(700);
    for (const label of [/^pages$/i, /^sections$/i, /^questions$/i]) {
      await glide(p.locator('span', { hasText: label }).first(), { click: false }); await sleep(900);
    }
  });
  await beat('x3', async () => {
    await glide(p.getByRole('button', { name: /open in the editor/i }));
    await p.getByTestId('preview-page-0').waitFor({ timeout: 90000 }); await closePopup();
    await glide(p.getByRole('button', { name: /check concepts on the server/i }));
    await p.getByText(/must fix before export/i).first().waitFor({ timeout: 120000 });
    await glide(p.getByText(/^\d+ errors$/i).first(), { click: false });
  });
  await beat('x4', async () => {
    await glide(p.getByText(/must fix before export/i).first()); await sleep(900);
    await glide(p.getByText(/a concept still has to be picked/i).first(), { click: false, dx: 0.3 }); await sleep(1500);
    await glide(p.getByRole('button', { name: /create new concepts/i }), { click: false }); await sleep(1500);
    await glide(p.getByText(/fix the check errors first/i).first(), { click: false });
  });

  // ---- Concept dictionary ----
  await go(SPA + '/form-studio', () => p.getByTestId('forms-table').locator('tbody tr').first().waitFor({ timeout: 60000 }));
  const READ = /concepts, read from this EMR.s database on/i;
  await beat('d1', async () => {
    await glide(p.getByRole('button', { name: /open the concept dictionary/i }));
    await p.getByText(READ).waitFor({ timeout: 60000 }); await closePopup();
    await glide(p.getByText(READ), { click: false, dx: 0.2 });
  });
  await beat('d2', async () => {
    await type(p.getByPlaceholder(/search by name, synonym or uuid/i), 'weight (kg)', 80);
    const first = p.locator('tbody tr').first();
    for (let i = 0; i < 60 && !/weight \(kg\)/i.test(await first.innerText().catch(() => '')); i++) await sleep(250);
    await sleep(500);
    for (const n of [1, 2, 4, 5]) { await glide(first.locator('td').nth(n), { click: false, dx: 0.3 }); await sleep(800); }
  });
  await beat('d3', async () => {
    await glide(p.locator('tbody tr').first().getByRole('button').first());
    const used = p.getByRole('heading', { name: 'Used in forms', exact: true });
    await used.waitFor({ timeout: 60000 }); await sleep(700);
    await scrollTo(used, 250); await glide(used, { click: false });
  });

  // ---- Close ----
  await p.setContent(blackCard('Form Studio', 'Build forms, then check them', [
    'Edit pages, sections and questions in the preview',
    'Rules written as plain sentences',
    'Check every concept on the server before export']));
  await beat('end');
  await sleep(800);
} finally {
  await finish();
}
