import { test, expect } from '../core';
import { EditorPage } from '../pages';

// The question dialog's concept search. Read-only: the dialog is closed without saving.
test.describe('Concept search in the question dialog', () => {
  test.beforeEach(async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto(EditorPage.ED_TRIAGE_GYN);
    await editor.editQuestion('address');
  });

  test('A7.1 "heart rate": Heart Rate comes first, marked with how many forms use it', async ({ page }) => {
    const results = await new EditorPage(page).searchConcept('heart rate');
    const first = results.locator('li').first();
    await expect(first).toContainText(/^Heart Rate/);
    await expect(first).toContainText(/used in \d+ forms?/);
  });

  test('A7.2 "na": the Drug-form NA is refused and comes last', async ({ page }) => {
    const results = await new EditorPage(page).searchConcept('na');
    const na = results.locator('li', { has: page.locator('span', { hasText: /^NA$/ }) });
    await expect(na).toHaveAttribute('aria-disabled', 'true');
    await expect(results.locator('li').last()).toHaveAttribute('aria-disabled', 'true');
  });

  test('A7.3 a CIEL concept is found from the dictionary copy: "weight (kg)"', async ({ page }) => {
    const results = await new EditorPage(page).searchConcept('weight (kg)');
    await expect(results.locator('li').first()).toContainText(/^Weight \(kg\)/);
  });
});
