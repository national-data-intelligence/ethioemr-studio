import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';

/** "From a Bahmni export" and "From an Excel template": upload, convert, review. Nothing is saved. */
export class IntakePage {
  static readonly CENTRAL_TRIAGE_ZIP = path.resolve(
    __dirname,
    '../fixtures/Central Triage Form.zip',
  );
  static readonly CENTRAL_TRIAGE_UUID = 'ff723d59-0650-4b84-858d-c1045b690683'; // the shipped form it rebuilds
  static readonly EXCEL_EXAMPLE = path.resolve(
    __dirname,
    '../../src/intake/excel/assets/Example_Cardiac_History_Sheet.xlsx',
  );

  constructor(readonly page: Page) {}

  async goto(source: 'bahmni' | 'excel') {
    await this.page.goto(`form-studio/new/${source}`);
    await this.page
      .getByText(/drag the .* here or click to choose it/i)
      .first()
      .waitFor();
  }

  /** Give the file to the upload box, as dropping it would. */
  async upload(file: string) {
    if (!fs.existsSync(file)) throw new Error(`Test file not found: ${file}`);
    await this.page.locator('input[type="file"]').setInputFiles(file);
  }

  /** The review screen, once matching has finished (matching a big form against the server takes a while). */
  async waitForReview() {
    await this.page.getByRole('heading', { name: /what came out/i }).waitFor({ timeout: 150_000 });
  }

  /** A number in "What came out", by its label (Pages, Sections, Questions, ...). */
  async number(label: RegExp): Promise<number> {
    const box: Locator = this.page.locator('span', { hasText: label }).locator('..');
    return Number(await box.locator('span').first().innerText());
  }
}
