// Render the platform manuals to PDF with headless Chrome (styles in print.css).
//   node docs/platform/src/build-pdfs.mjs            # both
//   node docs/platform/src/build-pdfs.mjs guide      # only the platform guide
//   node docs/platform/src/build-pdfs.mjs manual     # only the user manual
// Uses the Playwright copy in modules/esm-form-studio-app (installed there for its e2e tests) and the installed
// Google Chrome (channel "chrome"), so nothing is downloaded. Roboto is read from docs/platform/src/fonts (no network needed).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const require = createRequire(join(repo, 'modules', 'esm-form-studio-app', 'package.json'));
const { chromium } = require('@playwright/test');

// logo-header.png: the Palladium wordmark, trimmed of its white box (its edge printed as a faint line).
const logo = 'data:image/png;base64,' +
  readFileSync(join(here, 'logo-header.png')).toString('base64');
const place = 'Addis Ababa, 22 October 2026';

const docs = {
  guide: { src: 'platform-guide.html', out: 'EthioEMR-Platform-Guide.pdf', running: 'EthioEMR Platform Guide' },
  manual: { src: 'user-manual.html', out: 'EthioEMR-User-Manual.pdf', running: 'EthioEMR User Manual' },
};

// Chrome draws these outside the page body; they need their own inline styles and font sizes.
const header = (running) => `
<div style="width:100%; padding:0 16mm; display:flex; justify-content:space-between; align-items:flex-end;
            font-family:'Segoe UI',Arial,sans-serif; font-size:7.5pt; color:#6B7280;">
  <img src="${logo}" style="height:7mm; margin-bottom:0.5mm;">
  <span style="padding-bottom:1mm;">${running}</span>
</div>`;
const footer = (running) => `
<div style="width:100%; padding:0 16mm; font-family:'Segoe UI',Arial,sans-serif; font-size:7pt; color:#495057;">
  <div style="border-top:0.5pt solid #C9CDD2; padding-top:2.5mm; display:flex; justify-content:space-between;">
    <span>Palladium&nbsp;&nbsp;|&nbsp;&nbsp;${running}&nbsp;&nbsp;|&nbsp;&nbsp;${place}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
</div>`;

const which = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [key, d] of Object.entries(docs)) {
    if (which.length && !which.includes(key)) continue;
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(here, d.src)).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const roboto = await page.evaluate(() => document.fonts.check('9pt Roboto'));
    const out = join(repo, 'docs', 'platform', d.out);
    await page.pdf({
      path: out,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: header(d.running),
      footerTemplate: footer(d.running),
      margin: { top: '24mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
    console.log(`${d.out}: written (Roboto loaded: ${roboto})`);
    await page.close();
  }
} finally {
  await browser.close();
}
