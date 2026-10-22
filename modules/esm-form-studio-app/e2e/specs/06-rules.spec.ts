import { type Locator, type Page } from '@playwright/test';
import { test, expect } from '../core';
import { EditorPage } from '../pages';

// Rules in plain words, on a copy of ED Triage GYN in this test's browser. Nothing is saved to the server.
const SHOWN_WHEN_BLEEDING = 'Shown only when "Vaginal Bleeding" is "Yes".';

const openRules = async (page: Page, questionId: string, label: string): Promise<Locator> => {
  await page
    .getByTestId(`preview-question-${questionId}`)
    .getByRole('button', { name: /^rules: when it shows/i })
    .click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: `Rules for "${label}"` }) });
  await dialog.waitFor();
  return dialog;
};

/** PV shown only when Vaginal Bleeding is Yes, made in the Rules window (A6.2). */
const showPvOnlyWhenBleeding = async (page: Page) => {
  const rules = await openRules(page, 'pv', 'PV');
  await rules.getByText(/^only when…$/i).click();
  await rules.getByRole('combobox', { name: /^based on$/i }).selectOption({ label: 'Vaginal Bleeding' });
  await rules.getByText(/^yes$/i).click();
  await rules.getByRole('button', { name: /^save rules$/i }).click();
  await expect(rules).toBeHidden();
};

test.describe('Rules in plain words', () => {
  test.beforeEach(async ({ page }) => {
    await new EditorPage(page).goto(EditorPage.ED_TRIAGE_GYN);
  });

  test('A6.1 the Rules window: a text question gets "when", a number question all four parts with help lines', async ({
    page,
  }) => {
    const rules = await openRules(page, 'pv', 'PV');
    await expect(rules.getByText(/^when should this question appear\?$/i)).toBeVisible();
    await expect(rules.getByText(/^warn if the value is unusual$/i)).toHaveCount(0); // PV is a text box
    await rules.getByRole('button', { name: /^cancel$/i }).click();
    // the title shows the label as typed: "PR (beats/min)", not "PR (beats&#x2F;min)"
    const numberRules = await openRules(page, 'pr', 'PR (beats/min)');
    await expect(numberRules.getByText(/^when should this question appear\?$/i)).toBeVisible();
    await expect(numberRules.getByText(/^fill in by itself$/i)).toBeVisible();
    await expect(numberRules.getByText(/the value is worked out from other answers/i)).toBeVisible();
    await expect(numberRules.getByText(/^warn if the value is unusual$/i)).toBeVisible();
    await expect(numberRules.getByText(/shows a yellow warning to double-check the value/i)).toBeVisible();
    await expect(numberRules.getByText(/^number format$/i)).toBeVisible();
    await expect(numberRules.getByText(/will not save a value with more decimals/i)).toBeVisible();
  });

  test('A6.2 "Only when… Vaginal Bleeding is Yes" writes its sentence under PV', async ({ page }) => {
    await showPvOnlyWhenBleeding(page);
    await expect(page.getByTestId('preview-question-pv')).toContainText(SHOWN_WHEN_BLEEDING);
  });

  test('A6.3 in the engine preview PV appears only after Vaginal Bleeding = Yes', async ({ page }) => {
    await showPvOnlyWhenBleeding(page);
    const preview = page.getByRole('tabpanel').filter({ has: page.getByText(/^vaginal bleeding$/i) });
    const bleeding = preview.getByRole('group', { name: /vaginal bleeding/i });
    await bleeding.scrollIntoViewIfNeeded();
    await expect(preview.getByText(/^PV$/)).toHaveCount(0);
    await bleeding.getByText(/^yes$/i).click();
    await expect(preview.getByText(/^PV$/)).toBeVisible();
    await bleeding.getByText(/^no$/i).click();
    await expect(preview.getByText(/^PV$/)).toHaveCount(0);
  });

  test("A6.4 the Rules view lists the form's rules as sentences, including the new one", async ({ page }) => {
    await showPvOnlyWhenBleeding(page);
    await page.getByRole('tab', { name: /^rules$/i }).click();
    await expect(page.getByText(/^\d+ questions with rules$/)).toBeVisible();
    await expect(page.getByText(SHOWN_WHEN_BLEEDING)).toBeVisible();
  });

  test('A6.5 warnings and whole numbers write their sentences under a number question', async ({ page }) => {
    const rules = await openRules(page, 'pr', 'PR (beats/min)');
    await rules.getByRole('spinbutton', { name: /^warn below$/i }).fill('50');
    await rules.getByRole('spinbutton', { name: /^warn above$/i }).fill('150');
    await rules.getByText(/^whole numbers only$/i).click();
    await rules.getByRole('button', { name: /^save rules$/i }).click();
    await expect(rules).toBeHidden();
    const pr = page.getByTestId('preview-question-pr');
    await expect(pr).toContainText('Warns (yellow, still saves) below 50 or above 150.');
    await expect(pr).toContainText('Whole numbers only.');
  });
});
