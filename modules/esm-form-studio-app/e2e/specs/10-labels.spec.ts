import { type Page } from '@playwright/test';
import { test, expect } from '../core';
import { DictionaryPage, EditorPage } from '../pages';

// Every screen: no text placeholder left unfilled ("{{count}}"), no escaped characters ("&#x2F;"), no "......".
const clean = async (page: Page) => {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\{\{\s*\w+\s*\}\}/);
  expect(text).not.toMatch(/&#x[0-9a-f]+;|&amp;|&quot;/i);
  expect(text).not.toMatch(/\.{4,}/);
};

test.describe('Labels on every screen read properly', () => {
  test('start page', async ({ page }) => {
    await page.goto('form-studio');
    await page.getByTestId('forms-table').locator('tbody tr').first().waitFor();
    await clean(page);
  });

  test('editor: Preview & edit and Rules', async ({ page }) => {
    await new EditorPage(page).goto(EditorPage.ED_TRIAGE_GYN);
    await clean(page);
    await page
      .getByText(/^rules$/i)
      .first()
      .click();
    await clean(page);
  });

  test('the question dialog', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto(EditorPage.ED_TRIAGE_GYN);
    await editor.editQuestion('address');
    await clean(page);
  });

  test('the dictionary and a concept row', async ({ page }) => {
    const dictionary = new DictionaryPage(page);
    await dictionary.goto();
    await dictionary.open(await dictionary.search('pulse'));
    await clean(page);
  });
});
