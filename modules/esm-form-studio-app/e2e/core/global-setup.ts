import { request } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Logs in once through the API and keeps the signed-in state for every test (https://playwright.dev/docs/auth).
 * Fails loudly when the login or the session location doesn't work, so no test runs half signed in. The login comes
 * from .env (ignored by git); the server must be this computer (playwright.config.ts refuses anything else).
 */
async function globalSetup() {
  const base = process.env.E2E_BASE_URL;
  const user = process.env.E2E_USER_ADMIN_USERNAME;
  const password = process.env.E2E_USER_ADMIN_PASSWORD;
  if (!user || !password || password.startsWith('<')) {
    throw new Error('Put the local test login in modules/esm-form-studio-app/.env (see example.env).');
  }
  const context = await request.newContext();
  const token = Buffer.from(`${user}:${password}`).toString('base64');
  const login = await context.post(`${base}/ws/rest/v1/session`, {
    data: { sessionLocation: process.env.E2E_LOGIN_DEFAULT_LOCATION_UUID, locale: 'en' },
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${token}` },
  });
  const session = await (await context.get(`${base}/ws/rest/v1/session`)).json();
  if (!login.ok() || !session.authenticated) {
    throw new Error(`Login to ${base} failed (HTTP ${login.status()}). Is the local EthioEMR running?`);
  }
  if (!session.sessionLocation)
    throw new Error('Logged in, but no session location: check E2E_LOGIN_DEFAULT_LOCATION_UUID.');
  await context.storageState({ path: 'e2e/storageState.json' });
  await context.dispose();
}

export default globalSetup;
