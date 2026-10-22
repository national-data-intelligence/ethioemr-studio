import { expect, type Locator, type Page } from '@playwright/test';

/** The concept dictionary. */
export class DictionaryPage {
  static readonly READ = /concepts, read from this EMR.s database on/i;
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto('form-studio/dictionary');
    await expect(this.page.getByText(DictionaryPage.READ)).toBeVisible({ timeout: 60_000 });
  }

  /**
   * Search, and wait until the table shows the results: the page filters 0.4 s after typing stops, so clicking at
   * once could land on a row of the old list (this happened).
   */
  async search(text: string): Promise<Locator> {
    await this.page.getByPlaceholder(/search by name, synonym or uuid/i).fill(text);
    const first = this.page.locator('tbody tr').first();
    const word = text.split(/\s+/)[0].toLowerCase();
    await expect(async () => {
      const shown = await this.page.getByText(DictionaryPage.READ).innerText();
      expect(Number(shown.match(/^([\d,]+) of/)?.[1].replace(/,/g, ''))).toBeLessThan(10_000); // the search applied
      expect((await first.innerText()).toLowerCase()).toContain(word);
    }).toPass({ timeout: 30_000 });
    return first;
  }

  /** Open a row's details and wait for them. */
  async open(row: Locator) {
    await row.getByRole('button').first().click();
    await expect(this.page.getByRole('heading', { name: 'Used in forms', exact: true })).toBeVisible({
      timeout: 60_000,
    });
  }
}
