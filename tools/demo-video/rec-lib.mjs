// Shared recording helpers for the Form Studio guide (record-fs.mjs) and the platform demo (record-platform.mjs).
// A "beat" is one narration line plus the clicks
// made during it; page loads become jump cuts; long waits become fast-forwards with a real-time counter.
// Each cut writes its own build/raw-<cut>.webm and build/marks-<cut>.json, which build.mjs <cut> turns into the MP4.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const BUILD = path.join(ROOT, 'build');
export const BASE = process.env.EMR_URL || 'http://localhost:18200/openmrs';
export const SPA = BASE + '/spa';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The concept dictionary copy Form Studio's tests already read from the database (about 25 minutes the first time).
// Loading it into the recording browser makes the dictionary open in seconds, as it does for a returning user.
const DICTIONARY = path.resolve(ROOT, '../../work/e2e/dictionary-state.json');

// ---------- In-page helpers: a visible cursor with click ripple; hide the EMR's red pop-up ----------
const INIT = () => {
  const style = document.createElement('style');
  style.textContent = `
    #demo-cursor{position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;margin:-3px 0 0 -3px}
    .demo-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
      border:3px solid #f5a623;animation:demo-rip .55s ease-out forwards}
    @keyframes demo-rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
    #demo-ff,#demo-tag{position:fixed;z-index:2147483647;top:70px;left:50%;transform:translateX(-50%);background:#111c;color:#fff;
      font:600 22px/1.2 "IBM Plex Sans",Arial,sans-serif;padding:12px 22px;border-radius:30px;display:flex;gap:12px;align-items:center}
    #demo-ff b{color:#f5a623} #demo-tag b{color:#4cd39b}`;
  const mount = () => {
    if (document.getElementById('demo-cursor')) return;
    document.head.appendChild(style);
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.left = (window.__cx ?? -100) + 'px'; c.style.top = (window.__cy ?? -100) + 'px';
    document.body.appendChild(c);
  };
  document.addEventListener('mousemove', (e) => {
    window.__cx = e.clientX; window.__cy = e.clientY; mount();
    const c = document.getElementById('demo-cursor'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px';
  }, true);
  document.addEventListener('mousedown', (e) => {
    const r = document.createElement('div'); r.className = 'demo-ripple';
    r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700);
  }, true);
  // The red "unresolved backend dependencies" pop-up: a CSS rule hides that kind of error toast from its first frame
  // (the poll alone left it visible for up to 300 ms), and the 300 ms poll hides it by its text. Never clicked from here.
  const hide = document.createElement('style');
  hide.textContent = '.omrs-toasts-container .cds--actionable-notification--toast{display:none!important}';
  const addHide = () => (document.head || document.documentElement).appendChild(hide);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addHide); else addHide();
  setInterval(() => {
    document.querySelectorAll('[class*=notification], [class*=toast]').forEach((n) => {
      if ((n.textContent || '').length < 400 && /unresolved backend dependencies/i.test(n.textContent)) n.style.setProperty('display', 'none', 'important');
    });
  }, 300);
};

// ---------- Cards: flat colours, no gradients ----------
const logo = (f, type) => `data:${type};base64,${fs.readFileSync(path.join(ROOT, 'assets', f)).toString('base64')}`;
const LOGOS = { palladium: logo('palladium-logo.svg', 'image/svg+xml'), tena: logo('tenaehr-logo-horizontal.png', 'image/png'), openmrs: logo('logo-512.png', 'image/png') };
// Opening and closing card: black, with the Palladium, TenaEHR and OpenMRS logos.
export const blackCard = (kicker, title, lines, foot = 'Synthetic test data only') => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;background:#000;
    font-family:"IBM Plex Sans","Segoe UI",Arial,sans-serif;color:#fff}
  .w{padding:0 110px;margin-top:-170px}.k{font-size:22px;letter-spacing:.2em;text-transform:uppercase;color:#f5a623;font-weight:600}
  h1{font-size:72px;margin:16px 0 30px;line-height:1.05;letter-spacing:-.01em}ul{list-style:none;padding:0;margin:0}
  li{font-size:28px;line-height:1.45;margin:10px 0;padding-left:36px;position:relative;color:#d6d6d6}
  li:before{content:"";position:absolute;left:0;top:15px;width:14px;height:14px;border-radius:3px;background:#f5a623}
  .logos{position:absolute;left:110px;right:110px;bottom:150px;display:flex;align-items:center;gap:56px;
    padding-top:30px;border-top:1px solid #ffffff26}
  .pal{height:62px}.chip{background:#fff;border-radius:12px;padding:8px 16px;display:flex}.chip img{height:58px}
  .omrs{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:600;letter-spacing:.01em}.omrs img{height:58px}
  .f{margin-left:auto;font-size:17px;color:#8a8a8a;text-align:right;line-height:1.5}</style></head><body><div class="w">
  <div class="k">${kicker}</div><h1>${title}</h1><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>
  <div class="logos"><img class="pal" src="${LOGOS.palladium}"><span class="chip"><img src="${LOGOS.tena}"></span>
  <span class="omrs"><img src="${LOGOS.openmrs}">OpenMRS</span>
  <div class="f">${foot}</div></div></body></html>`;

/**
 * Start a recording. Returns the page and the beat/cut/ff helpers.
 * opts: { cut: 'fs' | 'platform', launchArgs: [], asrLanguage }
 */
export async function startRecording({ cut, launchArgs = [], asrLanguage }) {
  const durations = JSON.parse(fs.readFileSync(path.join(BUILD, `audio-${cut}`, 'durations.json'), 'utf8'));
  setTimeout(() => { console.log('WATCHDOG: took over 20 min, aborting'); process.exit(2); }, 20 * 60 * 1000).unref();
  const browser = await chromium.launch({ args: launchArgs });

  // Log in once, outside the recording (choosing Main Pharmacy if the EMR asks), and reuse the session cookie.
  const loginCtx = await browser.newContext();
  const lp = await loginCtx.newPage();
  await lp.goto(SPA + '/login');
  await lp.fill('#username', 'admin'); await lp.click('button:has-text("Continue")');
  await lp.fill('#password', 'Admin123'); await lp.click('button[type=submit]');
  await lp.waitForURL(/home|location/, { timeout: 60000 });
  if (/location/.test(lp.url())) { await lp.getByText('Main Pharmacy').click(); await lp.getByRole('button', { name: /Confirm/ }).click(); await lp.waitForURL(/home/); }
  const login = await loginCtx.storageState(); await loginCtx.close();
  const dict = fs.existsSync(DICTIONARY) ? JSON.parse(fs.readFileSync(DICTIONARY, 'utf8')) : null;
  if (!dict) console.log('note: no saved dictionary copy; the dictionary scene will read it from the database (slow)');

  const vidDir = path.join(BUILD, `video-tmp-${cut}`);
  fs.rmSync(vidDir, { recursive: true, force: true });
  const ctx = await browser.newContext({
    storageState: { cookies: login.cookies, origins: dict?.origins ?? login.origins },
    ignoreHTTPSErrors: true, permissions: ['microphone'],
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: vidDir, size: { width: 1600, height: 900 } }, // build.mjs scales this to 1920x1080
  });
  await ctx.addInitScript(INIT);
  if (asrLanguage) {
    await ctx.addInitScript((lang) => {
      try { localStorage.setItem('openmrs:temporaryConfig', JSON.stringify({ '@palladium-ethiopia/esm-ai-assistant-app': { asrLanguage: lang } })); } catch { /* blank pages */ }
    }, asrLanguage);
  }
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept().catch(() => {})); // "Leave site?" on leaving an edited form
  const T0 = Date.now();
  p.setDefaultTimeout(30000);
  const now = () => (Date.now() - T0) / 1000;
  const marks = { beats: [], ff: [], cuts: [], sfx: [] };
  const skipped = () => [...marks.ff, ...marks.cuts].reduce((s, f) => s + (f.t1 - f.t0), 0);

  // One narration line + its on-screen actions; lasts at least as long as the voice clip.
  async function beat(id, actions = async () => {}) {
    if (!(id in durations)) throw new Error(`no voice clip for beat ${id}`);
    const t0 = now(); const skippedBefore = skipped();
    console.log(`[${t0.toFixed(1)}s] beat ${id}`);
    marks.beats.push({ id, t: t0 });
    await actions();
    const spoken = durations[id] + 0.5;
    const elapsed = now() - t0 - (skipped() - skippedBefore);
    if (elapsed < spoken) await sleep((spoken - elapsed) * 1000);
  }
  // Jump cut: page loading that build.mjs removes.
  async function cutOut(actions) { const t0 = now(); await actions(); marks.cuts.push({ t0, t1: now() }); }
  // Fast-forward with a visible "real time" counter.
  async function ff(label, actions) {
    console.log(`[${now().toFixed(1)}s] fast-forward: ${label}`);
    await p.evaluate((label) => {
      const d = document.createElement('div'); d.id = 'demo-ff'; const s = Date.now();
      d.innerHTML = `<span>Fast-forward:</span><span>${label}</span><b>0 s real time</b>`; document.body.appendChild(d);
      window.__fft = setInterval(() => { d.querySelector('b').textContent = Math.round((Date.now() - s) / 1000) + ' s real time'; }, 1000);
    }, label);
    const t0 = now();
    const hb = setInterval(() => console.log(`   ...still waiting (${(now() - t0).toFixed(0)}s)`), 15000);
    let result;
    try { result = await actions(); } finally { clearInterval(hb); }
    if (result !== 'error') await sleep(400);
    marks.ff.push({ t0, t1: now(), label });
    await p.evaluate(() => { clearInterval(window.__fft); document.getElementById('demo-ff')?.remove(); });
    return result;
  }
  const tag = (html) => p.evaluate((html) => { const d = document.createElement('div'); d.id = 'demo-tag'; d.innerHTML = html; document.body.appendChild(d); }, html);
  const untag = () => p.evaluate(() => document.getElementById('demo-tag')?.remove());

  // Close the red pop-up through its own close button (works even while the poll keeps it hidden).
  const closePopup = async () => {
    await sleep(300);
    await p.evaluate(() => document.querySelectorAll('button[aria-label="close notification"]').forEach((b) => b.click())).catch(() => {});
  };
  // Navigate inside a jump cut, then close the pop-up.
  const go = async (url, ready) => cutOut(async () => { await p.goto(url, { waitUntil: 'load' }); await ready(); await sleep(1200); await closePopup(); });

  // Human-like pointer.
  async function glide(loc, { click = true, dx = 0.5, dy = 0.5 } = {}) {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) throw new Error('glide: element has no box');
    await p.mouse.move(b.x + b.width * dx, b.y + b.height * dy, { steps: 24 });
    await sleep(220);
    if (click) { await p.mouse.down(); await sleep(60); await p.mouse.up(); await sleep(300); }
  }
  async function glideXY(x, y, click = true) {
    await p.mouse.move(x, y, { steps: 24 }); await sleep(220);
    if (click) { await p.mouse.down(); await sleep(60); await p.mouse.up(); await sleep(300); }
  }
  const type = async (loc, text, delay = 45) => {
    await glide(loc); await closePopup(); await loc.focus(); await loc.fill('');
    await loc.pressSequentially(text, { delay });
    if ((await loc.inputValue()) !== text) { await loc.fill(text); } // the pop-up can steal keys; never leave a half-typed box
  };
  async function wheel(dy, steps = 6, at) {
    if (at) await p.mouse.move(at.x, at.y, { steps: 12 });
    for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy / steps); await sleep(90); }
  }
  // Scroll an element smoothly to a given height in the viewport (keeps the motion visible, unlike a jump).
  async function scrollTo(loc, top = 200) {
    for (let i = 0; i < 30; i++) {
      const b = await loc.boundingBox(); if (!b) break;
      const d = b.y - top; if (Math.abs(d) < 40) break;
      await p.mouse.wheel(0, Math.max(-400, Math.min(400, d))); await sleep(110);
    }
  }

  async function finish() {
    marks.end = now();
    fs.writeFileSync(path.join(BUILD, `marks-${cut}.json`), JSON.stringify(marks, null, 1));
    await ctx.close();
    const vids = fs.readdirSync(vidDir).filter((f) => f.endsWith('.webm'));
    if (vids.length) fs.copyFileSync(path.join(vidDir, vids[0]), path.join(BUILD, `raw-${cut}.webm`));
    await browser.close();
    console.log(`recorded ${marks.end.toFixed(1)}s, ${marks.beats.length} beats, ${marks.ff.length} fast-forwards, ${marks.cuts.length} cuts`);
  }
  return { p, marks, now, beat, cutOut, ff, tag, untag, closePopup, go, glide, glideXY, type, wheel, scrollTo, finish };
}

// Form Studio steps used by both videos (selectors from modules/esm-form-studio-app/e2e, 43/43 passing).
export const ED_TRIAGE_GYN = '2ef99967-e65f-54f0-9fe3-eb0ef88d7f92'; // "Emergency Triage Form - Gynecology"
export const EXCEL_EXAMPLE = path.resolve(ROOT, '../../modules/esm-form-studio-app/src/intake/excel/assets/Example_Cardiac_History_Sheet.xlsx');

export const APP_MENU_SEL = 'button[aria-label="TenaEHRModules"]'; // the grid icon, top right
let APP_MENU;
/** Open the app menu (grid icon, top right) and pick Form Studio through the module search. */
export async function openFormStudioFromMenu(r) {
  APP_MENU = r.p.locator(APP_MENU_SEL);
  const { p, glide, type, closePopup } = r;
  await closePopup();
  await glide(APP_MENU);
  const search = p.getByPlaceholder(/search for a module/i);
  await search.waitFor({ timeout: 10000 });
  await sleep(500);
  await type(search, 'form studio', 45);
  await sleep(500);
  await glide(p.getByText('Form Studio', { exact: true }).first());
  await r.cutOut(async () => { // the forms table loading is cut, not shown
    await p.getByRole('heading', { name: /^form studio$/i }).waitFor({ timeout: 60000 });
    await p.getByTestId('forms-table').locator('tbody tr').first().waitFor({ timeout: 60000 });
    await sleep(600); await closePopup();
  });
}
