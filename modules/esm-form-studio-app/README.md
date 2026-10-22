# esm-form-studio-app (@palladium-ethiopia/esm-form-studio-app)

Form Studio is an O3 frontend app for building, checking and exporting AMPATH forms on EthioEMR test instances.
It uses only the existing OpenMRS REST API, writes nothing to the server, and leaves the Form Builder untouched.

The app was built from `openmrs-esm-template-app` (TypeScript, React, Carbon). It lives in this repo until it moves
to its own repository and is published to npm; then it joins the distro with one line in
`distro/frontend/spa-assemble-config.json`, like the other `@palladium-ethiopia/*` apps.

## Build and run it in the platform

From the repo root, with the stack running (`.\platform.ps1 up`):

```powershell
.\scripts\build-form-studio.ps1          # production build into dist/ (installs dependencies the first time)
.\scripts\build-form-studio.ps1 -Check   # same, after the unit tests, type check and lint
.\platform.ps1 overlay                   # copy dist/ into work/spa-overlay and restart the gateway
```

Then open http://localhost:18200/openmrs/spa, log in, and choose Form Studio in the grid menu at the top right.
After a code change, build and run the overlay again, then refresh the browser.

The tile appears only for users with the privilege `o3: View Form Builder Dashboard` (`src/routes.json`).

## Checks

From `modules/esm-form-studio-app`:

```powershell
node .yarn/releases/yarn-4.10.3.cjs install      # once
node .yarn/releases/yarn-4.10.3.cjs test         # unit tests (vitest)
node .yarn/releases/yarn-4.10.3.cjs typescript   # type check
node .yarn/releases/yarn-4.10.3.cjs lint         # eslint, no warnings allowed
node .yarn/releases/yarn-4.10.3.cjs build        # production build
```

Some unit tests need data that is not in this repo (the shipped forms, Bahmni exports, a live server) and are
skipped without it.

The end-to-end tests drive a real browser against the local platform. Copy `example.env` to `.env` (git ignores
it), put in the local test password, and run `node node_modules/@playwright/test/cli.js test`. See
`e2e/README.md`. `.\platform.ps1 demo-check full` runs the unit and end-to-end tests too.

The app shell is pinned to `10.0.1-pre.5263`, the same as `APP_SHELL_VERSION` in `distro/frontend/Dockerfile`.
The template's newer 11.x shell crashes EthioEMR apps (React error #130), so keep the two in lockstep.

## Layout

```
src/
  index.ts             what the module exports to the app shell
  routes.json          the form-studio page and its two grid-menu tiles
  config-schema.ts     settings; the defaults hold the project rules
  root.component.tsx   router: /  /new  /new/bahmni  /new/excel  /edit/:uuid  /dictionary
  start/               start page: new form, the dictionary, or a form to edit
  intake/              Bahmni export and Excel template: upload, convert, match concepts, review
  editor/              Form Studio's panel and editable preview inside the editor
  builder/             copy of the O3 Form Builder 3.5.1 editor (MPL-2.0); see builder/README.md
  check/               the Check: problems found before export
  concepts/            concept search rules for the question dialog
  logic/               show and hide rules in plain words
  export/              export as content files, and proposals for new concepts
  test-save/           test save of a form on a server
  dictionary/          the concept dictionary page
  form-model/          form types, the standard template, identity rules, the bundled form schema
  links/               the grid-menu tiles
  api/                 REST calls
translations/          en.json, am.json
e2e/                   Playwright end-to-end tests
```

## How it works

- The editor at `/form-studio/new` and `/form-studio/edit/<uuid>` is the Form Builder's own editor page. Form
  Studio's panel replaces Save and Publish: it shows the form's identity, blocks the download when a shipped
  form's name, uuid or encounter type has changed, runs the Check, and exports.
- From scratch asks for the form's basics, then fills the standard template
  (`src/form-model/standard-form-template.json`). A new form's uuid is a uuid5 of its name, so a rebuilt form keeps
  its uuid.
- The Bahmni and Excel intakes share one shape (`src/intake/intake-types.ts`). Concepts are matched against the
  server's dictionary, and the result opens in the editor. The Excel template's columns are defined in
  `src/intake/excel/template-spec.json`.
- The concept dictionary searches first: listing every concept through REST takes about 3 s per 100, while a
  search takes 0.2 to 1.3 s. Filters, sorting and paging run in the browser.
- The OpenMRS form schema is bundled (`src/form-model/form.schema.json`) because the distro's security policy
  stops the browser from fetching json.openmrs.org.

## Before the move to its own repository

1. Restore the Husky git hooks. They were removed while the app lives inside this repo.
2. Remove `"private": true` from package.json. Until then it prevents an accidental publish.
