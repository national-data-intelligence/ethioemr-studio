import type { Locator, Page } from '@playwright/test';

/** Form Studio's start page. Elements are found by their visible labels, as a user would. */
export class FormStudioPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly fromScratch: Locator;
  readonly fromBahmni: Locator;
  readonly fromExcel: Locator;
  readonly formsSearch: Locator;
  readonly dictionaryButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /^form studio$/i });
    this.fromScratch = page.getByRole('link', { name: /from scratch/i });
    this.fromBahmni = page.getByRole('link', { name: /from a bahmni export/i });
    this.fromExcel = page.getByRole('link', { name: /from an excel template/i });
    this.formsSearch = page.getByPlaceholder(/search this list/i);
    this.dictionaryButton = page.getByRole('button', { name: /open the concept dictionary/i });
  }

  async goto() {
    await this.page.goto('form-studio');
    await this.heading.waitFor();
  }
}
