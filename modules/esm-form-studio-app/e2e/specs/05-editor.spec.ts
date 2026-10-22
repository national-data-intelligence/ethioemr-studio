import { type Locator, type Page } from '@playwright/test';
import { test, expect } from '../core';
import { EditorPage } from '../pages';

// The editor, on a copy of ED Triage GYN in this test's browser. Nothing is saved to the server.
const FORM_NAME = 'Emergency Triage Form - Gynecology';

/** The Schema editor's JSON (an Ace editor); changing it is what pasting into it does. */
const schemaJson = (page: Page) =>
  page.evaluate(() => (window as unknown as { ace: any }).ace.edit('schemaEditor').getValue() as string);
const setSchemaJson = async (page: Page, change: (json: string) => string) => {
  const json = change(await schemaJson(page));
  await page.evaluate((value) => (window as unknown as { ace: any }).ace.edit('schemaEditor').setValue(value, 1), json);
  await page.getByRole('button', { name: /render changes/i }).click();
};
const showView = (page: Page, view: RegExp) => page.getByRole('tab', { name: view }).click();
const dialog = (page: Page, heading: RegExp): Locator =>
  page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: heading }) });

/** Pick the first concept the ranked search allows. */
const pickConcept = async (scope: Locator, text: string) => {
  const box = scope.getByRole('searchbox').first();
  await box.fill(text);
  const results = scope.getByTestId('ranked-concepts').first();
  await results.waitFor({ timeout: 60_000 });
  await results.locator('li:not([aria-disabled="true"])').first().click();
};

test.describe('The editor', () => {
  test.beforeEach(async ({ page }) => {
    await new EditorPage(page).goto(EditorPage.ED_TRIAGE_GYN);
  });

  test('A5.1 left: Preview & edit / Rules / Schema editor; right: the engine preview and the panel', async ({
    page,
  }) => {
    for (const view of [/preview & edit/i, /^rules$/i, /schema editor/i])
      await expect(page.getByRole('tab', { name: view })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^preview$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /download content files/i })).toBeVisible();
  });

  test('A5.2 the panel shows the identity, locked', async ({ page }) => {
    await expect(page.getByText(/^identity locked$/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`^${EditorPage.ED_TRIAGE_GYN} · `))).toBeVisible();
  });

  test('A5.3 pencils and bins everywhere, the four Add buttons, and readable field names', async ({ page }) => {
    const firstPage = page.getByTestId('preview-page-0');
    for (const name of [/^edit page$/i, /^delete page$/i, /^edit section$/i, /^delete section$/i])
      await expect(firstPage.getByRole('button', { name }).first()).toBeVisible();
    const question = firstPage.locator('[data-testid^="preview-question-"]').first();
    for (const name of [/^edit question$/i, /^delete question$/i])
      await expect(question.getByRole('button', { name })).toBeVisible();
    for (const name of [/^add page$/i, /^add section$/i, /^add question$/i, /^add repeating group$/i])
      await expect(page.getByRole('button', { name }).first()).toBeVisible();
    await expect(firstPage.getByText(/visit date/i).first()).toBeVisible();
    await expect(firstPage.getByText(/provider/i).first()).toBeVisible();
  });

  test('A5.3 adding a page, a section and a question puts each in the form', async ({ page }) => {
    await page.getByRole('button', { name: /^add page$/i }).click();
    const newPage = dialog(page, /create a new page/i);
    await newPage.getByRole('textbox').fill('E2E page');
    await newPage.getByRole('button', { name: /^save$/i }).click();
    const added = page.locator('[data-testid^="preview-page-"]').last();
    await expect(added.getByRole('heading', { level: 4 })).toHaveText('E2E page');

    await added.getByRole('button', { name: /^add section$/i }).click();
    const newSection = dialog(page, /create a new section/i);
    await newSection.getByRole('textbox', { name: /enter a section title/i }).fill('E2E section');
    await newSection.getByRole('button', { name: /^save$/i }).click();
    await expect(added.getByRole('heading', { level: 5 })).toHaveText('E2E section');

    await added.getByRole('button', { name: /^add question$/i }).click();
    const newQuestion = dialog(page, /create a new question/i);
    await newQuestion.getByRole('textbox', { name: /^label/i }).fill('E2E pulse');
    await newQuestion.getByRole('textbox', { name: /question id/i }).fill('e2ePulse');
    await newQuestion.getByRole('combobox', { name: /question type/i }).selectOption('obs');
    await newQuestion.getByRole('combobox', { name: /rendering type/i }).selectOption('number');
    await pickConcept(newQuestion, 'pulse');
    await newQuestion.getByRole('button', { name: /^save$/i }).click();
    await expect(newQuestion).toBeHidden();
    await expect(page.getByTestId('preview-question-e2ePulse')).toContainText('E2E pulse');
    expect(await schemaJson(page)).toContain('"id": "e2ePulse"');
  });

  test('A5.4 a renamed section shows the new name in the preview and in the JSON', async ({ page }) => {
    const section = page.getByTestId('preview-page-1');
    const before = await section.getByRole('heading', { level: 5 }).first().innerText();
    await section
      .getByRole('button', { name: /^edit section$/i })
      .first()
      .click();
    const edit = dialog(page, /edit section/i);
    const title = edit.getByRole('textbox', { name: /enter a section title/i });
    await expect(title).toHaveValue(before);
    await title.fill('E2E renamed section');
    await edit.getByRole('button', { name: /^save$/i }).click();
    await expect(section.getByRole('heading', { level: 5 }).first()).toHaveText('E2E renamed section');
    const json = await schemaJson(page);
    expect(json).toContain('"label": "E2E renamed section"');
    expect(json).not.toContain(`"label": "${before}"`);
  });

  test('A5.5 a repeating group with a question in it', async ({ page }) => {
    await page
      .getByTestId('preview-page-1')
      .getByRole('button', { name: /^add repeating group$/i })
      .first()
      .click();
    const group = dialog(page, /create a new question/i);
    await expect(group.getByRole('combobox', { name: /rendering type/i })).toHaveValue('repeating');
    await group.getByRole('textbox', { name: /^label/i }).fill('E2E vitals group');
    await group.getByRole('textbox', { name: /question id/i }).fill('e2eVitalsGroup');
    await pickConcept(group, 'vital signs');
    await group.getByRole('button', { name: /add a grouped question/i }).click();
    const child = group.getByRole('listitem').first();
    await child.getByRole('combobox').first().selectOption('obs');
    await child.getByRole('combobox').nth(1).selectOption('number');
    await child
      .getByPlaceholder(/type of anaesthesia/i)
      .first()
      .fill('E2E grouped pulse');
    await child
      .getByPlaceholder(/enter a unique id/i)
      .first()
      .fill('e2eGroupedPulse');
    await pickConcept(child, 'pulse');
    await group.getByRole('button', { name: /^save$/i }).click();
    await expect(group).toBeHidden();

    const added = page.getByTestId('preview-question-e2eVitalsGroup');
    await expect(added).toContainText('E2E vitals group');
    await expect(added.getByText(/^repeating group$/i)).toBeVisible();
    await expect(added.getByTestId('preview-question-e2eGroupedPulse')).toContainText('E2E grouped pulse');
    await expect(added.getByRole('button', { name: /add a question to this group/i })).toBeVisible();
  });

  test('A5.6 changing the form name in the JSON flags the identity and blocks the download; changing it back clears it', async ({
    page,
  }) => {
    await showView(page, /schema editor/i);
    await setSchemaJson(page, (json) => json.replace(`"name": "${FORM_NAME}"`, `"name": "${FORM_NAME} edited"`));
    await expect(page.getByText(/^identity: must fix\.$/i).first()).toBeVisible();
    await expect(page.getByText(/^fix the identity first\.$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /download content files/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /form json only/i })).toBeDisabled();

    await setSchemaJson(page, (json) => json.replace(`"name": "${FORM_NAME} edited"`, `"name": "${FORM_NAME}"`));
    await expect(page.getByText(/^identity: must fix\.$/i)).toHaveCount(0);
    await expect(page.getByText(/^fix the identity first\.$/i)).toHaveCount(0);
  });
});
