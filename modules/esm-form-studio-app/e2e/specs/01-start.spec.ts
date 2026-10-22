import { test, expect } from '../core';
import { FormStudioPage } from '../pages';

// The start page. Read-only: nothing is saved.
test.describe('Start page', () => {
  test.beforeEach(async ({ page }) => {
    await new FormStudioPage(page).goto();
  });

  test('A1.1 shows the three ways to create a new form', async ({ page }) => {
    const studio = new FormStudioPage(page);
    await expect(page.getByText(/create a new form/i).first()).toBeVisible();
    for (const card of [studio.fromScratch, studio.fromBahmni, studio.fromExcel]) await expect(card).toBeVisible();
  });

  test('A1.2 the forms table lists forms, and the search narrows it to matching names', async ({ page }) => {
    const table = page.getByTestId('forms-table');
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();
    await new FormStudioPage(page).formsSearch.fill('triage');
    await expect(async () => {
      const names = await table.locator('tbody tr td:first-child').allInnerTexts();
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(name.toLowerCase()).toContain('triage');
    }).toPass();
    expect(await rows.count()).toBeLessThanOrEqual(before);
  });

  test('A1.3 "Filter by" offers Active, All, Published, Unpublished, Retired', async ({ page }) => {
    await page.locator('#formStatusFilter').click();
    const options = page.locator('#formStatusFilter').getByRole('option');
    await expect(options).toHaveText(['Active', 'All', 'Published', 'Unpublished', 'Retired']);
  });

  test('A1.4 "Edit schema" opens that form in the editor', async ({ page }) => {
    await new FormStudioPage(page).formsSearch.fill('Emergency Triage Form - Gynecology');
    const row = page.getByTestId('forms-table').locator('tbody tr', { hasText: 'Emergency Triage Form - Gynecology' });
    await row.getByRole('button', { name: /edit schema/i }).click();
    await expect(page).toHaveURL(/\/form-studio\/edit\/[0-9a-f-]{36}/);
  });

  test('A1.5 "Open the concept dictionary" goes to the dictionary', async ({ page }) => {
    await new FormStudioPage(page).dictionaryButton.click();
    await expect(page).toHaveURL(/\/form-studio\/dictionary/);
    await expect(page.getByText(/concept dictionary/i).first()).toBeVisible();
  });
});
