import { type Page } from '@playwright/test';
import { test, expect } from '../core';
import { FormStudioPage } from '../pages';

// A new form from scratch. The draft lives in this test's browser only; nothing is saved to the server.
const PROJECT_TYPES = 28; // src/config-schema.ts PROJECT_ENCOUNTER_TYPES, all on the local EMR (2026-10-20)
const NOT_A_PROJECT_TYPE = 'ADR Assessment Tool'; // on the server, not on the project list

const openBasics = async (page: Page) => {
  const studio = new FormStudioPage(page);
  await studio.goto();
  await studio.fromScratch.click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /new form: the basics/i }) });
  await dialog.waitFor();
  return dialog;
};

const encounterOptions = async (page: Page) => {
  const box = page.getByRole('combobox', { name: /encounter type/i });
  await expect(box).not.toHaveAttribute('placeholder', /loading/i);
  await box.click();
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options.first()).toBeVisible();
  return options;
};

test.describe('New form from scratch', () => {
  test('A2.1 the window asks for name, description (with a word count), encounter type, version and a read-only uuid', async ({
    page,
  }) => {
    const dialog = await openBasics(page);
    await expect(dialog.getByLabel(/form name/i)).toBeVisible();
    await expect(dialog.getByText(/0 words \(aim for 18-40\)/i)).toBeVisible();
    await dialog.getByLabel(/^description$/i).fill('Records the first assessment of a patient');
    await expect(dialog.getByText(/7 words \(aim for 18-40\)/i)).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /encounter type/i })).toBeVisible();
    await expect(dialog.getByLabel(/^version$/i)).toHaveValue(/\S/);
    const uuid = dialog.getByLabel(/uuid/i);
    await expect(uuid).toHaveAttribute('readonly', '');
    await expect(uuid).toHaveValue('');
    await dialog.getByLabel(/form name/i).fill('E2E scratch form');
    await expect(uuid).toHaveValue(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('A2.2 only the 28 project encounter types are offered', async ({ page }) => {
    await openBasics(page);
    const options = await encounterOptions(page);
    await expect(options).toHaveCount(PROJECT_TYPES);
    const names = await options.allInnerTexts();
    for (const wanted of ['Consultation', 'Triage', 'Vitals']) expect(names).toContain(wanted);
    expect(names).not.toContain(NOT_A_PROJECT_TYPE);
  });

  test('A2.3 the name of a form that already exists is refused', async ({ page }) => {
    const dialog = await openBasics(page);
    await dialog.getByLabel(/form name/i).fill('Cardiac History Sheet');
    await (await encounterOptions(page)).filter({ hasText: /^Consultation$/ }).click();
    await expect(dialog.getByText(/a form with this name already exists/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /create form/i })).toBeDisabled();
  });

  test('A2.4 Create opens the editor with Visit Details first and the starter page', async ({ page }) => {
    const dialog = await openBasics(page);
    await dialog.getByLabel(/form name/i).fill('E2E scratch form');
    await dialog.getByLabel(/^description$/i).fill('A form made by the end-to-end test; it is never saved.');
    await (await encounterOptions(page)).filter({ hasText: /^Consultation$/ }).click();
    await dialog.getByRole('button', { name: /create form/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 3, name: 'E2E scratch form' })).toBeVisible();
    await expect(page.getByTestId('preview-page-0').getByRole('heading', { level: 4 })).toHaveText('Visit Details');
    await expect(page.getByTestId('preview-page-1').getByRole('heading', { level: 4 })).toHaveText(
      'Vital Signs & Assessment',
    );
  });

  test('A2.5 Skip leaves the editor empty, ready for a pasted JSON in the Schema editor', async ({ page }) => {
    const dialog = await openBasics(page);
    await dialog.getByRole('button', { name: /skip: i will paste a json/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/nothing to preview yet/i)).toBeVisible();
    await page.getByRole('tab', { name: /schema editor/i }).click();
    await expect(page.getByRole('button', { name: /load sample schema/i })).toBeVisible();
  });
});
