# Contributing

This repo follows the team distro's conventions (`palladium-group/ethiopiaemr-distro-referenceapplication`).

## Branches and PRs
- `main` is the integration branch. Never commit to it directly; changes arrive through pull requests.
- Branch from `main` with a prefix: `feat/`, `fix/`, `chore/`, `docs/` (for example `feat/form-studio-overlay`, `chore/bump-distro-9147129`). One topic per branch and per PR.
- PRs are merged with a merge commit ("Merge pull request #N from ..."), as in the distro repo.

## Commits
Conventional Commits, as used on the distro's main: `feat: ...`, `fix(gateway): ...`, `chore: pin distro to sha-9147129`, `docs: ...`. Imperative, present tense, about what changes and why.

## What lives where
- `distro/` and `content/` are copies of other teams' repos. Don't edit them here. Fix things upstream, then refresh the copy (`distro/`: `git archive` of the new main commit, and update `PLATFORM_IMAGE_TAG` to `sha-<commit>`).
- Secrets (`.env`, keys) never go into git. Add new settings to `.env.example` with an empty or safe value.
- Database dumps and build output are git-ignored (`database/initial-db/`, `work/`).
- Modules: Form Studio's source lives in `modules/esm-form-studio-app` (build with `scripts/build-form-studio.ps1`; its `dist/` is git-ignored). The AI assistant has no source here: its built bundle is kept in `modules/esm-ai-assistant-app/dist` until Bini publishes it. `modules/<name>/module.json` says where each build comes from.

## Before opening a PR
- `.\platform.ps1 config` must succeed (the merged compose file is valid).
- If you touched the overlay or a module: `.\platform.ps1 overlay`, then open http://localhost:18200/openmrs/spa and check the browser console is free of errors.
- If you touched `services/asr-service`: `python test-merge.py` still shows "(no swaps)" on `test-audio/consult-am.wav`.
- For anything new a reviewer should be able to see, say in the PR where to look (URL, file or command).
