# Shorky Test Consumer

A minimal Node.js + TypeScript + Playwright project used to validate
[Shorky](https://github.com/whoff77/shorky)'s AI-powered auto-healing
GitHub Action end-to-end, consumed as a published marketplace action
(see `.github/workflows/test.yml` for the current version pin).

## The Shorky Ecosystem

Shorky is designed as a three-part ecosystem, separating the core open-source engine from the optional, monetized governance and observability layer.

1. **`shorky` (The Core Engine):** This repository. Shipped as a local CLI and a composite GitHub Action. It processes failed Playwright JSON reports, orchestrates the LLM code-fixes, overwrites local files, and handles GitHub PR creation. 
2. **`shorky-cloud` (The SaaS):** The hosted telemetry and governance dashboard. It provides a per-project API key to track run history, self-healing trace timelines, and LLM token spend. For paying "Pro" tier users, it enforces a monthly token budget guardrail to prevent runaway LLM costs in CI.
3. **`shorky-test-consumer` (The Proving Ground):** A live sample repository configured with intentionally broken specs to validate the end-to-end GitHub Action batching loop and Cloud governance gates.

## What this project does

1. Runs the Playwright suite in `tests/shorky-validation/` against a public
   demo site (`the-internet.herokuapp.com`).
2. Six spec files exercise different categories Shorky needs to handle,
   **intentionally** bundled into a single run so all failures land in one
   batch report and one consolidated pull request:
   - `broken-login-flow.spec.ts` — **DOM interaction failure**: targets
     stale locators (`#user-name` / `#pass-word`) that don't exist on the
     login page; the real ids are `#username` / `#password`.
   - `dynamic-form-elements.spec.ts` — **semantic action-contract errors**:
     calls `.fill()` on a native `<select>` (dropdown page) and on a
     checkbox (checkboxes page) instead of the correct `.selectOption()` /
     `.check()` actions.
   - `custom-dropdown-interaction.spec.ts` — **custom (non-native) dropdown
     interaction mismatch**: builds a bare-bones button/list "combobox"
     widget in-page (no `<select>`/`<option>` elements at all) and calls
     `.fill()` on its trigger `<button>` instead of clicking the trigger and
     then the desired `<li role="option">` item — a distinct interaction
     contract from the native `<select>` case above.
   - `canonical-value-mismatch.spec.ts` — **colloquial string vs. canonical
     selection value mismatch**: uses the *correct* `.selectOption()`
     action contract against an in-page native `<select>` country picker,
     but supplies a colloquial abbreviation (`"USA"`) that matches neither
     the option's canonical `value` (`"US"`) nor its full visible label
     (`"United States"`), producing a genuine "no matching option" timeout.
   - `visual-regression-check.spec.ts` — **visual regression failure**:
     captures a screenshot of the dropdown page and compares it against a
     committed baseline
     (`tests/shorky-validation/visual-regression-check.spec.ts-snapshots/dropdown-page-baseline.png`),
     but first injects an intentional visual discrepancy (a red banner and
     a recolored control) via `page.evaluate`, so the pixel comparison
     reliably fails with a real image diff. This is the suite's only
     visual-regression spec — additional pixel-diff specs are intentionally
     avoided to keep the suite lightweight and immune to cross-environment
     rendering flakes.
   - `clean-happy-path.spec.ts` — a **fully passing negative control**:
     correct locators and action contracts throughout, ensuring baseline
     assertions remain untouched and never trigger a false healing fix or
     PR participation.
3. When one or more specs fail, `.github/workflows/test.yml` invokes the
   published `whoff77/shorky` GitHub Action (pinned version in that file), which:

   - Parses the Playwright JSON report (`test-results/report.json`) to find
     failed tests and their `trace.zip` / screenshot / visual-diff
     attachments.
   - For DOM/locator and semantic action-contract failures
     (`broken-login-flow.spec.ts`, `dynamic-form-elements.spec.ts`,
     `custom-dropdown-interaction.spec.ts`, `canonical-value-mismatch.spec.ts`):
     sends the failure context to an LLM (via `OPENAI_API_KEY`) to generate
     a corrected spec, overwriting the original spec file in-place so the
     healing branch's CI run passes.
   - For visual regression failures (`visual-regression-check.spec.ts`): **bypasses
     LLM code generation entirely** ("Visual Diff Handoff" mode) since a
     genuine pixel discrepancy can never be fixed by rewriting selectors —
     instead, the expected/actual/diff PNG paths are packaged directly into
     the PR description under a **[Visual Review Required]** section for a
     human to review and either accept the new UI or fix the regression.
   - Commits all healed fixes from the run onto a single shared branch
     (`shorky/auto-heal-fixes`) and opens **one consolidated pull request**
     covering every failure — code fixes and visual-review flags alike —
     rather than a separate PR per failing test. Re-running the workflow
     updates the existing open PR instead of opening a duplicate.

## Prerequisites

* Node.js v18+
* **GitHub Repository Settings (for Auto-Healing PRs):** Navigate to your repository **Settings > Actions > General > Workflow permissions** and ensure **"Allow GitHub Actions to create and approve pull requests"** is checked.
* A GitHub repository with the following secrets configured under
  **Settings > Secrets and variables > Actions**:
  * `OPENAI_API_KEY` — an OpenAI API key used by Shorky to generate the fix.
  * `GITHUB_TOKEN` is provided automatically by GitHub Actions and does not
    need to be added manually (referenced as `${{ secrets.GITHUB_TOKEN }}`
    in the workflow).
* The workflow must grant `contents: write` and `pull-requests: write`
  permissions (see the `permissions:` block in
  [`.github/workflows/test.yml`](.github/workflows/test.yml)) — Shorky needs
  these to push the healing branch and open the pull request via the
  GitHub REST API using `GITHUB_TOKEN`. Without them, the branch/PR creation
  step will fail with a 403.

## Local setup

```bash
npm install
npx playwright install --with-deps chromium
npm test
```

Running `npm test` locally will fail on purpose (see above) — that's
expected. This project exists to exercise the CI healing flow, not to pass
locally.

## CI Workflow

See [`.github/workflows/test.yml`](.github/workflows/test.yml):

1. Checks out the repo and installs dependencies + Chromium.
2. Validates that required Shorky environment variables (`GITHUB_REPOSITORY`,
   `GITHUB_TOKEN`) are present, and warns (non-fatally) if `SHORKY_CLOUD_API_KEY`
   is missing. `SHORKY_CLOUD_URL` is no longer required or checked — Shorky
   defaults to the hosted production instance unless explicitly overridden.
3. Runs `npx playwright test tests/shorky-validation --project="Google Chrome"`
   with `continue-on-error: true`, writing `test-results/report.json`, so
   every intentionally-broken spec runs to completion and all failures
   accumulate into one batch report instead of the job stopping at the
   first failure.
4. If any spec failed, runs the pinned `whoff77/shorky` action with `openai-api-key`,
   `shorky-cloud-api-key`, and `github-token` inputs against that single
   report to trigger the consolidated auto-healing pull request, then
   surfaces the true pass/fail status of the run.
5. Always uploads the Playwright HTML report and raw `test-results/`
   (traces, screenshots, diffs) as build artifacts.

## Pre-Flight Gate Verification (shorky-cloud budget/subscription gate)

In addition to the auto-healing validation suite above, this repo includes a
lightweight, dependency-free script and GitHub Actions workflow that verify
`shorky-cloud`'s **pre-flight budget/subscription gate**
(`POST /api/v1/preflight`) live — the exact check the Shorky CLI performs
before it starts any LLM repair loop (see `shorky`'s `src/cli/preflight.ts`).

Run it manually via `workflow_dispatch` on
[`.github/workflows/preflight-gate-verification.yml`](.github/workflows/preflight-gate-verification.yml),
which exercises three scenarios against three dedicated fixture projects in
`shorky-cloud`:

| Scenario | Required secret | Expected result |
|---|---|---|
| Active, well-funded project | `SHORKY_API_KEY_ACTIVE` | `200 OK` — gate passes |
| Subscription `past_due`/`canceled` | `SHORKY_API_KEY_PAST_DUE` | `402 Payment Required` |
| Monthly token budget exceeded | `SHORKY_API_KEY_OVER_BUDGET` | `429 Too Many Requests` |

Also runnable locally:

```bash
SHORKY_API_KEY=<your-fixture-project-api-key> \
npm run verify:preflight-gate -- --expect=pass   # or --expect=402 / --expect=429

# SHORKY_CLOUD_URL is an OPTIONAL override, only needed to point the script
# at a local/self-hosted/staging shorky-cloud deployment instead of
# production (e.g. SHORKY_CLOUD_URL=http://localhost:3000).
```

**Setup required in `shorky-cloud`:** the three fixture `projects` rows
referenced above (and their API keys, which must be copied into this
repo's GitHub secrets) are seeded via `shorky-cloud`'s
`scripts/seed.ts` (`npm run db:seed`) — see that repo's documentation for
the exact seeded values. See `CLINE.md`'s "Pre-Flight Gate Verification"
section here for the full contract.

## Project structure

```
shorky-test-consumer/
├── .github/
│   └── workflows/
│       ├── test.yml                              # CI: run Playwright + Shorky auto-healer
│       └── preflight-gate-verification.yml       # CI: live shorky-cloud /api/v1/preflight gate check
├── scripts/
│   └── verify-preflight-gate.js                  # Live pre-flight gate verification script
├── tests/
│   └── shorky-validation/
│       ├── broken-login-flow.spec.ts             # DOM interaction failure (stale locators)
│       ├── dynamic-form-elements.spec.ts         # Semantic action-contract errors (select/checkbox)
│       ├── custom-dropdown-interaction.spec.ts   # Custom (non-native) dropdown widget interaction mismatch
│       ├── canonical-value-mismatch.spec.ts      # Colloquial vs. canonical selection value mismatch
│       ├── visual-regression-check.spec.ts       # Visual regression failure (screenshot diff)
│       ├── clean-happy-path.spec.ts              # Fully passing negative control
│       └── visual-regression-check.spec.ts-snapshots/
│           └── dropdown-page-baseline.png        # Committed clean baseline snapshot
├── playwright.config.ts      # Playwright configuration (trace: retain-on-failure)
├── tsconfig.json
└── package.json
```