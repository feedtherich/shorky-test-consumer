# CLINE.md — shorky-test-consumer

## Ecosystem Overview (Multi-Repo)
This repository is part of the 3-repo Shorky ecosystem.
* **`shorky` (The Engine):** The CLI and composite GitHub Action. Parses Playwright traces and uses an LLM to permanently rewrite broken `.spec.ts` files in place ("fail-and-rewrite"). *Rule: No consumer tests or UI in this repo.*
* **`shorky-cloud` (The SaaS):** The Next.js dashboard, telemetry webhook ingestor, and API governance layer (Stripe, NextAuth, Neon Postgres). *Rule: Does not run tests or fix code; only stores and displays telemetry.*
* **`shorky-test-consumer` (The Proving Ground):** The target project containing actual Playwright tests and the CI pipeline (`shorky-heal.yml`) that triggers the Action. *Rule: Used purely to validate the end-to-end healing loop.*

## Project Overview

`shorky-test-consumer` is a **minimal sample Playwright + TypeScript project** used to validate the [`shorky`](https://github.com/whoff77/shorky) AI-powered auto-healing GitHub Action end-to-end, consuming it as a published marketplace action (currently pinned to `whoff77/shorky@v1.3.14` in `.github/workflows/test.yml` — always check that file for the exact live pin, since it's bumped independently of this doc). It runs a single Playwright suite (`tests/shorky-validation/`) against a public demo site (`the-internet.herokuapp.com`) with **six spec files**, each exercising a different category Shorky must be able to handle:

- `tests/shorky-validation/broken-login-flow.spec.ts` — DOM interaction failure (stale locators `#user-name` / `#pass-word`; the real ids are `#username` / `#password`).
- `tests/shorky-validation/dynamic-form-elements.spec.ts` — semantic action-contract errors (`.fill()` on a `<select>`/checkbox instead of `.selectOption()` / `.check()`) to verify the LLM diagnostics correct the *action*, not just the selector.
- `tests/shorky-validation/custom-dropdown-interaction.spec.ts` — custom (non-native) dropdown widget interaction mismatch: builds an in-page button/list "combobox" (no `<select>`/`<option>` elements) and calls `.fill()` on its trigger button instead of clicking the trigger then the option item.
- `tests/shorky-validation/canonical-value-mismatch.spec.ts` — colloquial string vs. canonical selection value mismatch: uses the correct `.selectOption()` action against an in-page native `<select>` but supplies `"USA"`, which matches neither the option's `value` (`"US"`) nor its label (`"United States"`).
- `tests/shorky-validation/visual-regression-check.spec.ts` — visual regression failure (injects a deliberate visual discrepancy via `page.evaluate` before comparing against a committed baseline snapshot on the dropdown page). This remains the suite's only visual-regression spec by design — no additional pixel-diff specs are added, to keep the suite lightweight and immune to cross-environment rendering flakes.
- `tests/shorky-validation/clean-happy-path.spec.ts` — a fully passing negative-control spec that must never trigger a healing fix or false PR participation.

When the suite fails in CI, `.github/workflows/test.yml` runs the suite with `continue-on-error: true` (so every intentionally-broken spec runs to completion and all failures accumulate into a single Playwright JSON report), then invokes the published Shorky action, which parses the report, resolves failed specs/traces, and either LLM-generates a code fix (DOM/semantic failures) or packages a "Visual Review Required" section into a PR (visual regression). All fixes land on a single shared branch (`shorky/auto-heal-fixes`) via one consolidated pull request, sharing one `suiteRunId`.

The suite runs with **multiple parallel Playwright workers** (`workers` in `playwright.config.ts` is no longer pinned to `1` on CI). `global-setup.ts` (wired up via `globalSetup` in `playwright.config.ts`) runs once, in the single parent process, *before* Playwright forks any worker — it mints (or reuses) one `SHORKY_RUN_ID` UUID, sets it on `process.env` (inherited by every forked worker process), writes it to `test-results/.shorky-run-id`, and — when running inside GitHub Actions — appends it to `$GITHUB_ENV` so later workflow steps see it too. This guarantees every worker's failures, and the subsequent `whoff77/shorky` action step (which runs `fixTrace.ts` as a separate process after Playwright has exited), resolve to the exact same shared run identifier — see `resolveSuiteRunId()` in the `shorky` repo's `src/cli/fixTrace.ts` — so a multi-worker run still produces one batch report and one consolidated PR/telemetry dispatch, never one per worker.

This repo exists purely to exercise the CI healing flow — **`npm test` is expected to fail locally on purpose.**

## Verification Checklist (run before finishing ANY task)

This repo has no build step and `npm test` failing locally is the *expected/correct* result for the intentionally-broken specs — don't mistake either of those facts for "nothing to verify":

1. **`npx tsc --noEmit`** — there's no `typecheck`/`build` script in `package.json` (`tsconfig.json` is editor/type-checking support only, `noEmit: true`), but running `tsc` directly still catches syntax/type errors in `global-setup.ts`, `playwright.config.ts`, or any spec you touch, before it ever reaches CI.
2. **`npx playwright test <changed-spec> --project="Google Chrome"`** — run only the spec(s) you actually changed, and confirm the *failure mode* matches what that spec's category is supposed to exercise (e.g. `broken-login-flow.spec.ts` should fail on the stale locator, not on an unrelated syntax/timeout error you accidentally introduced). Don't run the full `npm test` suite as your "did it work" signal — it's supposed to fail, and a full-suite failure doesn't tell you whether *your* change is what's failing.
3. **`tests/shorky-validation/clean-happy-path.spec.ts` must still pass** — this is the negative control; if it starts failing, something you changed (config, `global-setup.ts`, a shared fixture) broke the suite generally rather than exercising one spec's intended failure category.
4. If you bumped the `whoff77/shorky@vX.Y.Z` pin in `.github/workflows/test.yml`, grep this repo for the old version string (`grep -rn 'v1\\.' CLINE.md README.md .github/`) to make sure no stale reference to it survives elsewhere — this exact class of drift (a hardcoded version number going stale in 3+ places) has happened before in this ecosystem.

## Core Development Rules

- **Self-Documenting Changes:** Before finishing ANY task that adds/removes a spec file, bumps the `whoff77/shorky@vX.Y.Z` action pin, changes `playwright.config.ts`/`global-setup.ts`, or otherwise changes behavior described below, you MUST update this `CLINE.md` (and `README.md`, where it duplicates the same facts) to match — both adding what's new AND deleting/correcting whatever it said before that is now stale, wrong, or extraneous (e.g. a hardcoded version number that's since been bumped). A stale or contradictory `CLINE.md` costs more tokens on every future task than no doc at all (the agent has to re-discover the truth from source first), so treat pruning outdated content as equally mandatory as adding new content. Skip only genuinely trivial changes (typo fixes, formatting, comments) that don't change any behavior this file documents.
- **Check the local README:** The `README.md` in this repository acts as the architectural source of truth. Before and after making any changes, ensure your logic does not conflict with the established business goals or ecosystem boundaries defined there. If your changes alter the architecture, update the local `README.md` and explicitly prompt the human developer to update the other repositories in the ecosystem to maintain cohesion.
- **Maintain tests:** Create or modify unit tests as features are added/changed. Remove obsolete tests. Also maintain relevent end-to-end data and functionality to `shorky-test-consumer`.

## Tech Stack & Core Tools

- **Language/Runtime:** TypeScript, Node.js
- **Test/Automation Engine:** Playwright (`@playwright/test`)
- **Target under test:** public demo site `https://the-internet.herokuapp.com` (configured as `baseURL`)
- **CI integration under test:** `whoff77/shorky` GitHub Action (composite action from the sibling `shorky` repo; see `.github/workflows/test.yml` for the current version pin)
- **Optional telemetry integration:** `shorky-cloud` (via `SHORKY_CLOUD_URL` / `SHORKY_CLOUD_API_KEY`)
- No build step, database, or backend — this is a pure Playwright test fixture project.

## Key Commands

```bash
# Install dependencies
npm install

# Install Playwright's Chromium browser
npx playwright install --with-deps chromium

# Run the suite (expected to fail locally — that's intentional)
npm test               # -> playwright test
npm run test:headed    # -> playwright test --headed

# Run a single spec / project directly
npx playwright test tests/shorky-validation/broken-login-flow.spec.ts --project="Google Chrome"

# Verify shorky-cloud's live /api/v1/preflight gate for one scenario
# (requires SHORKY_CLOUD_URL + SHORKY_API_KEY — see "Pre-Flight Gate
# Verification" below)
SHORKY_CLOUD_URL=... SHORKY_API_KEY=... npm run verify:preflight-gate -- --expect=pass
```

There is no lint, typecheck, or build script defined in `package.json`; `tsconfig.json` is used for editor/type-checking support only (`noEmit: true`).

### CI-only environment variables (see `.github/workflows/test.yml`)
- `SHORKY_CLOUD_URL` / `SHORKY_CLOUD_API_KEY` — optional telemetry/webhook target passed through to the Shorky action.
- `OPENAI_API_KEY` — used by the Shorky action to generate LLM-based fixes.
- `GITHUB_TOKEN` — used by the Shorky action to push the healing branch and open the PR (requires `contents: write` + `pull-requests: write` permissions, already set in the workflow).

## Pre-Flight Gate Verification

`scripts/verify-preflight-gate.js` and `.github/workflows/preflight-gate-verification.yml` provide a **live, dependency-free E2E check** of shorky-cloud's `/api/v1/preflight` budget/subscription gate — the same endpoint `shorky`'s CLI (`runPreflightCheck()` in `src/cli/preflight.ts`) calls before starting any LLM repair loop. This is intentionally a *direct endpoint check*, not a full run of the `whoff77/shorky` composite action, so it costs no OpenAI tokens and never opens a PR.

- **Script (`scripts/verify-preflight-gate.js`):** a plain Node.js (CommonJS, zero new dependencies) script that POSTs to `<SHORKY_CLOUD_URL base>/api/v1/preflight` with the `x-shorky-api-key: $SHORKY_API_KEY` header, mirroring `shorky`'s pre-flight request/response contract exactly (402/429 = hard block, anything else = fail-open). Takes a required `--expect=<pass|402|429>` flag and exits `0` only if the live response matches; exits `1` on a mismatch (verification failure) and `2` on misconfiguration (missing env vars/flag).
- **Workflow (`.github/workflows/preflight-gate-verification.yml`):** `workflow_dispatch`-only (not run on every push, since it's a targeted integration check of `shorky-cloud`, not this repo's own suite). Runs a 3-entry matrix, each scenario pointing at its own dedicated GitHub Actions secret:

  | Matrix scenario | Secret name | Expected outcome |
  |---|---|---|
  | `active` | `SHORKY_API_KEY_ACTIVE` | `pass` (HTTP 200) |
  | `past_due` | `SHORKY_API_KEY_PAST_DUE` | `402` |
  | `over_budget` | `SHORKY_API_KEY_OVER_BUDGET` | `429` |

- **Required `shorky-cloud` fixture data:** each secret above must hold the `apiKey` of a distinct `projects` row in `shorky-cloud`'s database, configured as follows (already seeded via `shorky-cloud`'s `scripts/seed.ts` against its dev DB as of this writing — see that repo's `CLINE.md` for the exact seeded key values, which should be copied into this repo's secrets):
  - **Active/well-funded project:** `subscriptionStatus: 'active'`, `tokensUsedThisMonth` comfortably below `monthlyTokenLimit`.
  - **Past-due project:** `subscriptionStatus: 'past_due'` (or `'canceled'`) — any token counters.
  - **Over-budget project:** `subscriptionStatus: 'active'`, `tokensUsedThisMonth >= monthlyTokenLimit`.
- **`SHORKY_CLOUD_URL`:** same env var convention as `.github/workflows/test.yml` — a repository/organization variable (`vars.SHORKY_CLOUD_URL`) defaulting to the hosted `https://shorky-cloud.vercel.app/api/v1/telemetry`; override it (e.g. to a staging/dev shorky-cloud deployment) via repo Settings > Secrets and variables > Actions > Variables.

## Architecture & Conventions

- **`tests/shorky-validation/broken-login-flow.spec.ts` / `dynamic-form-elements.spec.ts` / `custom-dropdown-interaction.spec.ts` / `canonical-value-mismatch.spec.ts`** — deliberately broken DOM-locator / semantic action-contract specs. When "fixing" these, the point is to observe/validate Shorky's auto-heal PR, not to hand-fix them directly unless testing a regression in Shorky itself.
  - `custom-dropdown-interaction.spec.ts` builds its own in-page button/list "combobox" widget via `page.evaluate` (no dependency on external page markup), then calls `.fill()` on the trigger `<button>` instead of clicking the trigger and the desired `<li role="option">` item — a distinct interaction contract from the native `<select>` case in `dynamic-form-elements.spec.ts`.
  - `canonical-value-mismatch.spec.ts` builds an in-page native `<select>` country picker via `page.evaluate` and uses the *correct* `.selectOption()` action but supplies a colloquial value (`"USA"`) that matches neither the canonical `value` (`"US"`) nor the label (`"United States"`) — the fix is a corrected argument value, not a new selector or action method.
- **`tests/shorky-validation/visual-regression-check.spec.ts`** — captures a screenshot of the dropdown page after intentionally corrupting the UI, comparing against `tests/shorky-validation/visual-regression-check.spec.ts-snapshots/dropdown-page-baseline.png`. Playwright's `snapshotPathTemplate` in `playwright.config.ts` deliberately omits the OS-specific suffix so the macOS-captured baseline is still compared pixel-for-pixel against Linux CI runs (keeps it a genuine pixel-diff failure, not a "missing snapshot").
- **`tests/shorky-validation/clean-happy-path.spec.ts`** — negative control; must never be touched by the auto-healer or contribute to the batch report.
- **`playwright.config.ts`** — single browser project (`Google Chrome`), `trace: 'retain-on-failure'` and `screenshot: 'only-on-failure'` so Shorky's fixer always has a trace.zip + screenshot to work from; JSON reporter writes to `test-results/report.json` (the path the Shorky action expects via `report-path`). `workers` runs multiple parallel workers (including on CI); `globalSetup` points at `global-setup.ts`, which must always run before workers spawn so `SHORKY_RUN_ID` is established up front.
- **`global-setup.ts`** — mints/reuses the shared `SHORKY_RUN_ID` before Playwright spawns workers and persists it (env var inheritance + `test-results/.shorky-run-id` file + `$GITHUB_ENV` on CI) so multi-worker runs and the downstream Shorky CLI step all share one run identifier.
- **`.github/workflows/test.yml`** — runs on push/PR to `main`; installs deps + Chromium, validates required env vars, runs `tests/shorky-validation` with `continue-on-error: true` so all failures batch into one report, invokes the pinned `whoff77/shorky@vX.Y.Z` action against that report when any spec failed, then always uploads the HTML report and raw `test-results/` (traces, screenshots, diffs) as build artifacts.
- **When updating the consumed Shorky action version:** bump the `uses: whoff77/shorky@vX.Y.Z` pin in `.github/workflows/test.yml` and mention the version in `README.md`.
- **Repository Settings requirement:** GitHub Actions must be allowed to create and approve pull requests (Settings > Actions > General > Workflow permissions) for the auto-heal PR step to succeed.
