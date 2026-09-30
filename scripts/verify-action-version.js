#!/usr/bin/env node
// shorky-test-consumer: scripts/verify-action-version.js
//
// Prevents version drift between the `shorky` engine's published releases
// and the hardcoded `uses: whoff77/shorky@vX.Y.Z` pin consumed by this
// repo's CI workflow (`.github/workflows/test.yml`). Fetches the latest
// published release tag from the `shorky` repo on GitHub and compares it
// against the pin currently checked into the workflow file, failing the
// job immediately (before any tests run) if they've drifted apart.
//
// This is a direct, dependency-free check (native `fetch`, no npm
// packages) — mirrors the style of `scripts/verify-preflight-gate.js` in
// this same repo.
//
// Usage:
//   node scripts/verify-action-version.js
//
// Exit codes:
//   0 - the workflow's action pin matches the latest published shorky release.
//   1 - the pin is stale (or the workflow file / pin line couldn't be found)
//       and needs to be bumped.
//   2 - misconfiguration / network or API failure prevented verification.

const fs = require('fs');
const path = require('path');

const SHORKY_REPO = 'whoff77/shorky';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${SHORKY_REPO}/releases/latest`;
// NOTE: CLINE.md refers to this repo's CI pipeline as "shorky-heal.yml", but
// the actual workflow file living at .github/workflows/ (and containing the
// real `uses: whoff77/shorky@vX.Y.Z` pin) is named `test.yml`. Point at the
// real file so this check verifies the pin that actually governs CI.
const WORKFLOW_PATH = path.join(__dirname, '..', '.github', 'workflows', 'test.yml');

// The `uses: whoff77/shorky@vX.Y.Z` line inside the workflow file. Anchored
// to the start of a (trimmed) line so it only matches an actual YAML step
// key, never a mention inside a `#`-comment elsewhere in the file.
const USES_PIN_REGEX = /^uses:\s*whoff77\/shorky@(v[\w.\-]+)/;

async function fetchLatestReleaseTag() {
  let response;
  try {
    response = await fetch(LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'shorky-test-consumer-verify-action-version',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(`❌ [Verify Pin] Network error calling ${LATEST_RELEASE_URL}: ${error?.message || error}`);
    process.exit(2);
  }

  if (!response.ok) {
    console.error(
      `❌ [Verify Pin] GitHub API returned HTTP ${response.status} for ${LATEST_RELEASE_URL}. ` +
        'Could not resolve the latest shorky release.',
    );
    process.exit(2);
  }

  const data = await response.json().catch(() => null);
  const tagName = data && typeof data.tag_name === 'string' ? data.tag_name : undefined;

  if (!tagName) {
    console.error('❌ [Verify Pin] Latest release response did not include a usable "tag_name".');
    process.exit(2);
  }

  return tagName;
}

function readPinnedVersion() {
  let contents;
  try {
    contents = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  } catch (error) {
    console.error(`❌ [Verify Pin] Could not read workflow file at ${WORKFLOW_PATH}: ${error?.message || error}`);
    process.exit(2);
  }

  // Match against each trimmed line individually (rather than the whole
  // file with a multiline regex) so an indented YAML `uses:` step key is
  // matched, while any mention inside a `#`-prefixed comment line is not.
  let matchedVersion;
  for (const line of contents.split('\n')) {
    const match = line.trim().match(USES_PIN_REGEX);
    if (match) {
      matchedVersion = match[1];
      break;
    }
  }

  if (!matchedVersion) {
    console.error(
      `❌ [Verify Pin] Could not find a "uses: whoff77/shorky@vX.Y.Z" line in ${WORKFLOW_PATH}.`,
    );
    process.exit(2);
  }

  return matchedVersion;
}

async function main() {
  console.log(`🔎 [Verify Pin] Fetching latest release for ${SHORKY_REPO}...`);
  const latestTag = await fetchLatestReleaseTag();
  console.log(`📥 [Verify Pin] Latest published shorky release: ${latestTag}`);

  const pinnedVersion = readPinnedVersion();
  console.log(`📌 [Verify Pin] Current pin in ${path.relative(process.cwd(), WORKFLOW_PATH)}: ${pinnedVersion}`);

  if (pinnedVersion !== latestTag) {
    console.error(
      `❌ [Verify Pin] Version drift detected! The GitHub Action pin (${pinnedVersion}) does not match ` +
        `the latest published shorky release (${latestTag}). ` +
        `Bump the "uses: whoff77/shorky@${pinnedVersion}" line in ${path.relative(process.cwd(), WORKFLOW_PATH)} ` +
        `to "uses: whoff77/shorky@${latestTag}" (and update CLINE.md/README.md references) before merging.`,
    );
    process.exit(1);
  }

  console.log(`✅ [Verify Pin] PASS — action pin (${pinnedVersion}) matches the latest shorky release.`);
  process.exit(0);
}

main();
