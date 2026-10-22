import fs from 'node:fs';
import path from 'node:path';
import { type APIRequestContext, type Page, test as base } from '@playwright/test';
import { api } from '../fixtures';

/**
 * Form Studio's test harness. Every test's page gets, before it starts:
 *  - "Leave site?" (beforeunload) and other browser dialogs accepted, so navigation never hangs;
 *  - the EMR's red pop-up "Some modules have unresolved backend dependencies" closed whenever it appears; while open
 *    it holds the keyboard. It belongs to the EMR, not Form Studio.
 *  - the browser's storage made of this run's fresh login (e2e/storageState.json) plus, once it exists, the saved
 *    dictionary copy (work/e2e/dictionary-state.json, made by dictionary.setup.ts), so no test waits 25 minutes.
 * Use `test` from this file, not from @playwright/test.
 */
const LOGIN = path.resolve(__dirname, '../storageState.json');
const DICTIONARY = path.resolve(__dirname, '../../../../work/e2e/dictionary-state.json');
const readJson = (file: string) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : undefined);
export interface CustomTestFixtures {
  loginAsAdmin: Page;
}

export interface CustomWorkerFixtures {
  api: APIRequestContext;
}

export const test = base.extend<CustomTestFixtures, CustomWorkerFixtures>({
  api: [api, { scope: 'worker' }],
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must name their dependencies; this one has none
  storageState: async ({}, use) => {
    const login = readJson(LOGIN) ?? { cookies: [], origins: [] };
    const dictionary = readJson(DICTIONARY);
    await use({ cookies: login.cookies, origins: dictionary?.origins ?? login.origins ?? [] });
  },
  page: async ({ page }, use) => {
    page.on('dialog', (dialog) => dialog.accept().catch(() => undefined));
    await page.addLocatorHandler(
      page.getByText(/some modules have unresolved backend dependencies/i),
      async (popup) => {
        const toast = popup.locator('xpath=ancestor::*[.//button][1]');
        await toast.getByRole('button', { name: /close/i }).first().click();
      },
      { noWaitAfter: true },
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
