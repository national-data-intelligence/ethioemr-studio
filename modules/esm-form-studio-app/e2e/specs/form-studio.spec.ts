import { test, expect } from '../core';
import { FormStudioPage } from '../pages';

// Smoke test: the harness logs in, opens Form Studio, and the "from scratch" start opens its window.
test('Form Studio opens, and From scratch asks for the basics', async ({ page }) => {
  const studio = new FormStudioPage(page);
  await studio.goto();

  await expect(studio.fromScratch).toBeVisible();
  await expect(studio.fromBahmni).toBeVisible();
  await expect(studio.fromExcel).toBeVisible();

  await studio.fromScratch.click();
  await expect(page).toHaveURL(/\/form-studio\/new/);
  await expect(page.getByRole('dialog').getByText(/new form: the basics/i)).toBeVisible();
});
