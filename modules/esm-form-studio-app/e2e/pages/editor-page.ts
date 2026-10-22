import type { Locator, Page } from '@playwright/test';

/** A form open in Form Studio's editor. */
export class EditorPage {
  static readonly ED_TRIAGE_GYN = '2ef99967-e65f-54f0-9fe3-eb0ef88d7f92'; // "Emergency Triage Form - Gynecology"
  constructor(readonly page: Page) {}

  async goto(formUuid: string) {
    await this.page.goto(`form-studio/edit/${formUuid}`);
    await this.page.getByTestId('preview-page-0').waitFor({ timeout: 90_000 });
  }

  question(id: string): Locator {
    return this.page.getByTestId(`preview-question-${id}`);
  }

  /** The question's pencil: the Form Builder's "Edit question" dialog. */
  async editQuestion(id: string) {
    await this.question(id)
      .getByRole('button', { name: /^edit question$/i })
      .click();
    await this.page
      .getByRole('dialog')
      .getByText(/edit question/i)
      .first()
      .waitFor();
  }

  /** Type into the dialog's concept search; returns the ranked result list. */
  async searchConcept(text: string): Promise<Locator> {
    const box = this.page.getByRole('dialog').getByRole('searchbox', { name: /search for a backing concept/i });
    await box.fill('');
    await box.fill(text);
    const results = this.page.getByTestId('ranked-concepts');
    await results.waitFor({ timeout: 60_000 });
    return results;
  }
}
