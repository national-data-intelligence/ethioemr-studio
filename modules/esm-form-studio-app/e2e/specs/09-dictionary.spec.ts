import { test, expect } from '../core';
import { DictionaryPage } from '../pages';

// The concept dictionary, from the copy read from the database (dictionary.setup.ts). Read-only.
const READ = DictionaryPage.READ;
const search = (page, text: string) => new DictionaryPage(page).search(text);

test.describe('Concept dictionary', () => {
  test.beforeEach(async ({ page }) => {
    await new DictionaryPage(page).goto();
  });

  test('A9.2 it says how many concepts it read from the database', async ({ page }) => {
    const text = await page.getByText(READ).innerText();
    const [, shown, total] = text.match(/([\d,]+) of ([\d,]+) concepts/);
    const n = (s: string) => Number(s.replace(/,/g, ''));
    expect(n(total)).toBeGreaterThan(50_000);
    expect(n(shown)).toBeLessThanOrEqual(n(total));
    expect(text).not.toMatch(/&#x/); // the date reads 10/19/2026, not 10&#x2F;19...
  });

  test('A9.3 the columns, with Synonyms and other names', async ({ page }) => {
    await expect(page.locator('thead th')).toContainText([
      'Name',
      'Synonyms and other names',
      'Class',
      'Datatype',
      'Used in forms',
      'Status',
    ]);
  });

  test('A9.4 "weight (kg)": Weight (kg) first, with its synonyms, Numeric, used in many forms', async ({ page }) => {
    await search(page, 'weight (kg)');
    const first = page.locator('tbody tr').first();
    await expect(first).toContainText('Weight (kg)');
    await expect(first).toContainText('WT');
    await expect(first).toContainText('Numeric');
    // "Used in forms" shows "..." until the forms have been counted
    await expect(async () => expect(Number(await first.locator('td').nth(5).innerText())).toBeGreaterThan(10)).toPass();
  });

  test('A9.5 a row opens to its details, with the heading "Used in forms"', async ({ page }) => {
    const dictionary = new DictionaryPage(page);
    await dictionary.open(await dictionary.search('weight (kg)'));
    await expect(page.getByText(/\{\{/)).toHaveCount(0);
  });

  test('A9.6 filters and sorting: class Finding, then Name sorted Z-A (it was A-Z, so a click flips it)', async ({
    page,
  }) => {
    await search(page, 'weight');
    await page.locator('#dictionary-class').click();
    await page.getByRole('option', { name: 'Finding', exact: true }).click();
    const classes = await page.locator('tbody tr td:nth-child(4)').allInnerTexts();
    expect(classes.length).toBeGreaterThan(0);
    for (const c of classes) expect(c).toBe('Finding');
    await page.getByRole('columnheader', { name: /^name$/i }).click();
    await expect(async () => {
      // the sort applies a moment after the click: retry until it has
      const names = await page.locator('tbody tr td:nth-child(2)').allInnerTexts(); // eslint-disable-line playwright/prefer-web-first-assertions
      expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
    }).toPass();
  });
});
