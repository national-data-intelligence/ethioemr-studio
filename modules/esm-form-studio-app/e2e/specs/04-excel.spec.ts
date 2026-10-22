import fs from 'node:fs';
import { test, expect } from '../core';
import { IntakePage } from '../pages';

// The Excel template. Downloads go to Playwright's temporary folder and are deleted; the
// converted form stays in this test's browser; nothing is saved to the server.
test.describe('New form from the Excel template', () => {
  test('A4.1 both downloads give an .xlsx file', async ({ page }) => {
    await new IntakePage(page).goto('excel');
    for (const [link, name] of [
      [/download the empty template/i, 'Form_Studio_Template.xlsx'],
      [/download a filled example/i, 'Example_Cardiac_History_Sheet.xlsx'],
    ] as const) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: link }).click(),
      ]);
      expect(download.suggestedFilename()).toBe(name);
      const file = await download.path();
      const bytes = fs.readFileSync(file);
      expect(bytes.subarray(0, 2).toString()).toBe('PK'); // an .xlsx is a zip
      await download.delete();
    }
  });

  test('A4.2 the example gives 9 pages, 23 sections and 160 questions, on the same review screen', async ({ page }) => {
    const intake = new IntakePage(page);
    await intake.goto('excel');
    await intake.upload(IntakePage.EXCEL_EXAMPLE);
    await intake.waitForReview();
    expect(await intake.number(/^pages$/i)).toBe(9);
    expect(await intake.number(/^sections$/i)).toBe(23);
    expect(await intake.number(/^questions$/i)).toBe(160);
    await expect(page.getByRole('button', { name: /open in the editor/i })).toBeEnabled();
  });

  test('A4.3 the show-if rules from the sheet are in the Rules view', async ({ page }) => {
    const intake = new IntakePage(page);
    await intake.goto('excel');
    await intake.upload(IntakePage.EXCEL_EXAMPLE);
    await intake.waitForReview();
    await page.getByRole('button', { name: /open in the editor/i }).click();
    await expect(page).toHaveURL(/\/form-studio\/new$/);
    await page.getByTestId('preview-page-0').waitFor();
    await page.getByRole('tab', { name: /^rules$/i }).click();
    await expect(page.getByText(/^\d+ questions with rules$/)).toBeVisible();
    await expect(page.getByText(/^Shown only when /).first()).toBeVisible();
  });
});
