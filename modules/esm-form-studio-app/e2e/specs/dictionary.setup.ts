import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../core';

/**
 * The dictionary copy the tests use. Form Studio itself reads every concept from this EMR's database
 * (about 25 minutes), exactly as a form builder's browser does; the browser's storage, with the copy in it, is then
 * saved and given to every test. It is read again when it is more than 7 days old or missing.
 */
const STATE = path.resolve(__dirname, '../../../../work/e2e/dictionary-state.json');
const MAX_AGE_DAYS = 7;

test('the whole dictionary, read once from the database and kept for the tests', async ({ page }) => {
  const age = fs.existsSync(STATE) ? (Date.now() - fs.statSync(STATE).mtimeMs) / 86_400_000 : Infinity;
  if (age < MAX_AGE_DAYS) {
    test.info().annotations.push({ type: 'kept', description: `copy is ${age.toFixed(1)} days old` });
    return;
  }
  await page.goto('form-studio/dictionary');
  // a complete read ends with "<n> of <total> concepts, read from this EMR's database on <date>"
  await expect(page.getByText(/concepts, read from this EMR's database on/i)).toBeVisible({ timeout: 55 * 60 * 1000 });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  await page.context().storageState({ path: STATE, indexedDB: true });
});
