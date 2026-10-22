# EthioEMR platform

The team's EthioEMR (OpenMRS 3, TenaEHR) exactly as on GitHub `main`, plus the pieces built on top of it that are not in the published images yet:

- **Form Studio** (`@palladium-ethiopia/esm-form-studio-app`): build, check and export clinical forms in the browser. Its source is in `modules/esm-form-studio-app`.
- **AI assistant** (`@palladium-ethiopia/esm-ai-assistant-app`): Help & Search, Form Filler, Diagnosis Assistant and Speak. `modules/esm-ai-assistant-app/dist` is the AI team's build, kept here until they publish it.
- **Speech service** (`services/asr-service`): local Amharic and English speech-to-text for the Speak button.

`distro/` is an unchanged copy of GitHub `main` of [`palladium-group/ethiopiaemr-distro-referenceapplication`](https://github.com/palladium-group/ethiopiaemr-distro-referenceapplication) at `9147129`, and `content/` is an unchanged snapshot of the team's Initializer content (`ethiopiaemr-openmrs-content`). Everything platform-specific lives in `docker-compose.platform.yml`, the gateway template and `modules/`.

| | |
|---|---|
| App | http://localhost:18200/openmrs/spa (user `admin`, password `Admin123`) |
| MySQL | `localhost:3320` (user `openmrs`, password `openmrs`) |
| App shell | 10.0.1-pre.5263 (pinned by the team), Form Builder 3.5.1, 54 team apps plus the 2 overlay modules |
| Images | `meronmen/ethiopiaemr-frontend` and `meronmen/ethiopiaemr-backend` at `sha-9147129`, `mysql:8.0.45`, gateway built from `distro/gateway` |

## Quick start (Windows, PowerShell)

```powershell
copy .env.example .env                  # then set AI_SERVICE_API_KEY (ask the AI service owner)
.\platform.ps1 up                       # start the stack
.\scripts\build-form-studio.ps1         # production build of Form Studio
.\platform.ps1 overlay                  # add Form Studio and the AI assistant to the app, then refresh the browser
services\asr-service\start-asr.ps1      # optional: the speech service for Speak, in its own window
.\platform.ps1 demo-check               # checks every service and walks through each demo feature in a browser
```

Form Studio's build is git-ignored, so run the build and `overlay` once after the first start, and again after any change to a module. `platform.ps1` also has `status`, `logs [service]`, `stop` (keeps data), `down`, `config`, `content-pass` and `snapshot`.

A first start on an empty database needs the base database dump from the team; `scripts/get-initial-db.ps1` puts it in `database/initial-db/`. That first start imports the database, builds the search index over about 81,000 concepts and loads all content, which takes about an hour and a half, followed by `.\platform.ps1 content-pass`. A normal restart takes about 3.5 minutes. After a full first start, run `.\platform.ps1 snapshot` once (about 900 MB, git-ignored) and give `database/snapshots/` to teammates: on an empty install `up` restores it in about 6 minutes.

After the content pass, about 19 content files still leave some rows unsaved (for example `queue.csv` 18 of 18, `radiology_category_members_concept_set.csv` 101 of 232). A separate install on the same images and content shows the identical list, so it comes from the content snapshot, not from this repo. List them with `docker logs ethioemr-platform-backend-1 2>&1 | Select-String 'was processed and [0-9]+ out of'`.

Ports 18200 and 3320 were chosen so the platform can run next to other local EMR stacks (18080, 18090, 18100).

## How it fits together

```
browser -> gateway :18200 (distro/gateway image + gateway/platform.conf.template)
             /openmrs/spa/importmap.json, routes.registry.json -> work/spa-overlay/ (team list + our modules)
             /openmrs/spa/overlay/<module>/                   -> work/spa-overlay/modules/ (Form Studio, AI assistant)
             /openmrs/spa/ai-assistant.config.json            -> built from .env (the key is never in git)
             /openmrs/spa/*                                   -> frontend (team image)
             /openmrs/*                                       -> backend (team image) -> db (MySQL 8.0.45)
                                                                 backend reads content/ (Initializer content)
```

| Path | What it is | Owner |
|---|---|---|
| `distro/` | team distro, unchanged (refresh with a `git archive` of a newer main and update `PLATFORM_IMAGE_TAG`) | distro team |
| `content/` | Initializer content snapshot; changes go to `ethiopiaemr-openmrs-content` by PR | content team |
| `docker-compose.platform.yml`, `gateway/`, `platform.ps1`, `scripts/`, `tools/build-spa-overlay.py` | platform overlay | this repo |
| `modules/` | Form Studio source, the AI assistant build, and a `module.json` per module saying where its build is | this repo; AI assistant build from the AI team |
| `services/asr-service/` | local speech-to-text | this repo |
| `tools/demo-check/` | browser part of `.\platform.ps1 demo-check` | this repo |
| `tools/demo-video/` | scripts that record the demo videos | this repo |
| `docs/platform/` | guide, user manual, demo runbook, architecture diagram, slide deck | this repo |

## Adding another frontend module

1. Build it (production).
2. Add `modules/<name>/module.json` with `package`, `dist` and `entry` (copy one of the two existing ones).
3. Run `.\platform.ps1 overlay`.

The team's long-term route is to publish the module to npm and add one line to `distro/frontend/spa-assemble-config.json` in the distro repo. After that the overlay is no longer needed for it.

## Docs and videos

- [Platform guide (PDF)](docs/platform/EthioEMR-Platform-Guide.pdf): how the platform is built, run, tested and changed.
- [User manual (PDF)](docs/platform/EthioEMR-User-Manual.pdf): Form Studio and the AI assistant, for form builders and clinicians.
- [Demo runbook](docs/platform/DEMO-RUNBOOK.md): preparing and running a live demo.
- [Architecture diagram](docs/platform/architecture.png) (source: `architecture.drawio`) and the [slide deck](docs/platform/EthioEMR-Platform.pptx) ([PDF](docs/platform/EthioEMR-Platform.pdf)).
- [Platform demo video](tools/demo-video/out/ethioemr-platform-demo.mp4) (2:28) and [Form Studio guide video](tools/demo-video/out/form-studio-guide.mp4) (3:31); see `tools/demo-video/README.md` to rebuild them.
- `services/asr-service/README.md`: the speech service.
- `CONTRIBUTING.md`: branches, commits and PRs.

Synthetic test data only. Never enter real patient information.
