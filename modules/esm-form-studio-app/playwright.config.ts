import { devices, type PlaywrightTestConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

// This computer only: other servers hold other people's work.
const base = process.env.E2E_BASE_URL ?? '';
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(base + '/')) {
  throw new Error(`E2E_BASE_URL must be on this computer (localhost); got "${base}". Refusing to run.`);
}

// See https://playwright.dev/docs/test-configuration.
const config: PlaywrightTestConfig = {
  testDir: './e2e/specs',
  timeout: 3 * 60 * 1000,
  expect: {
    timeout: 40 * 1000,
  },
  fullyParallel: false,
  workers: 1, // one browser at a time: the laptop's memory
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [['junit', { outputFile: 'results.xml' }], ['html', { outputFolder: '../../work/e2e-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: '../../work/e2e-report', open: 'never' }]],
  outputDir: '../../work/e2e-results',
  globalSetup: require.resolve('./e2e/core/global-setup'),
  use: {
    baseURL: `${process.env.E2E_BASE_URL}/spa/`,
    storageState: 'e2e/storageState.json',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    acceptDownloads: true, // into Playwright's own temporary folder, never Downloads
  },
  projects: [
    {
      // the whole dictionary read once by the app itself and kept (work/e2e/dictionary-state.json)
      name: 'dictionary-copy',
      testMatch: /dictionary\.setup\.ts/,
      timeout: 60 * 60 * 1000,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'chromium',
      testIgnore: /\.setup\.ts/,
      dependencies: ['dictionary-copy'],
      use: {
        ...devices['Desktop Chrome'],
        // the Google Chrome already on this computer: no browser download needed
        channel: 'chrome',
      },
    },
  ],
};

export default config;
