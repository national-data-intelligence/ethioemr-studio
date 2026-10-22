import { test, expect } from '../core';
import { IntakePage } from '../pages';

// Convert a Bahmni export. The converted form stays in this test's browser; nothing is saved to the server.
test.describe('New form from a Bahmni export', () => {
  test.beforeEach(async ({ page }) => {
    const intake = new IntakePage(page);
    await intake.goto('bahmni');
    await intake.upload(IntakePage.CENTRAL_TRIAGE_ZIP);
  });

  test('A3.1 matching concepts shows a counter while it works', async ({ page }) => {
    await expect(page.getByText(/matching concepts on this server/i)).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ questions/i)).toBeVisible();
    await new IntakePage(page).waitForReview();
  });

  test('A3.2 "What came out" shows the counts and the groups of notes', async ({ page }) => {
    const intake = new IntakePage(page);
    await intake.waitForReview();
    expect(await intake.number(/^pages$/i)).toBeGreaterThan(0);
    expect(await intake.number(/^sections$/i)).toBeGreaterThan(0);
    expect(await intake.number(/^questions$/i)).toBe(51); // the browser converter and the Python converter both give 51
    const matched = await intake.number(/^concepts matched$/i);
    const toPick = await intake.number(/^concepts to pick$/i);
    expect(matched).toBeGreaterThan(0);
    expect(toPick).toBeGreaterThan(0);
    await expect(page.getByText(/needs a decision in the editor/i)).toBeVisible();
    await expect(page.getByText(/^not built \(from emr\)$/i)).toBeVisible();
  });

  test('A3.3 it rebuilds the shipped "Central Triage Form" and keeps its uuid', async ({ page }) => {
    await new IntakePage(page).waitForReview();
    await expect(page.getByText(/rebuilds "central triage form"/i)).toBeVisible();
    await expect(page.getByText(`uuid: ${IntakePage.CENTRAL_TRIAGE_UUID}`)).toBeVisible();
    await expect(page.getByLabel(/form name/i)).toHaveValue('Central Triage Form');
    await expect(page.getByLabel(/form name/i)).toHaveAttribute('readonly', '');
  });

  test('A3.4 "Open in the editor" shows the form with a red "Concept not mapped" tag on each concept to pick', async ({
    page,
  }) => {
    const intake = new IntakePage(page);
    await intake.waitForReview();
    const toPick = await intake.number(/^concepts to pick$/i);
    await page.getByRole('button', { name: /open in the editor/i }).click();
    await expect(page).toHaveURL(/\/form-studio\/new$/);
    await expect(page.getByRole('heading', { level: 3, name: 'Central Triage Form' })).toBeVisible();
    const tags = page.getByText(/^concept not mapped$/i);
    await expect(tags.first()).toBeVisible();
    expect(await tags.count()).toBeLessThanOrEqual(toPick); // answers to pick are counted too, but have no tag
  });
});
