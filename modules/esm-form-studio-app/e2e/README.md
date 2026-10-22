# Form Studio end-to-end UI tests

Playwright drives a real browser through Form Studio the way a form builder would, one spec file per feature
group.

## Rules built into the setup
- This computer only. `playwright.config.ts` refuses to run unless `E2E_BASE_URL` is on localhost. Other servers
  hold other people's work.
- One browser at a time, to spare the laptop's memory.
- No server changes. Form Studio only reads; drafts stay in the browser.
- The login lives in `.env`, next to `package.json`, which git ignores. Copy `example.env` to `.env` once and put
  the local test password in it.

## What the harness does for every test (`core/`)
- `global-setup.ts` logs in once through the API, sets the session location, and fails with a plain message if the
  EMR isn't answering or the login is wrong.
- `test.ts` gives every test a page that accepts "Leave site?" dialogs, and closes the EMR's red pop-up "Some
  modules have unresolved backend dependencies" whenever it appears (while open, it holds the keyboard).
- Import `test` and `expect` from `../core`, not from `@playwright/test`.

Before the tests, `specs/dictionary.setup.ts` lets the app read the whole concept dictionary (about 25 minutes)
and keeps the browser storage in `work/e2e/` at the repo root. The copy is read again once it is 7 days old.

## Run
```
cd modules\esm-form-studio-app
node node_modules\@playwright\test\cli.js test                 the suite
node node_modules\@playwright\test\cli.js test --headed        watch it in a browser window
node node_modules\@playwright\test\cli.js show-report ..\..\work\e2e-report   the last report (screenshots, video, trace on failure)
```

## Layout
```
e2e/core       login and the harness every test uses
e2e/fixtures   an API request context, logged in, and the sample Bahmni export
e2e/pages      page helpers, finding elements by their visible labels (as a user would)
e2e/specs      the tests, one file per feature group
```
