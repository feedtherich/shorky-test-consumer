#!/usr/bin/env node
// shorky-test-consumer: scripts/verify-preflight-gate.js
//
// Live E2E verification of shorky-cloud's pre-flight budget/subscription
// gate (POST /api/v1/preflight — see shorky-cloud's
// src/app/api/v1/preflight/route.ts, and shorky's runPreflightCheck() in
// src/cli/preflight.ts, which this script's request/response handling
// deliberately mirrors).
//
// This is a direct, fast, dependency-free check against the REAL
// shorky-cloud endpoint — no OpenAI calls, no PR side effects — used to
// confirm the exact HTTP contract the Shorky CLI relies on before it
// starts any LLM repair loop:
//   - 200 OK                 -> gate passes, LLM loop would proceed.
//   - 402 Payment Required   -> inactive/past_due/canceled subscription;
//                                CLI aborts and fails the CI job.
//   - 429 Too Many Requests  -> monthly token budget exceeded; CLI aborts
//                                and fails the CI job.
//   - anything else (network error, timeout, 5xx, invalid key) -> CLI
//     fails OPEN and allows the run to continue; this script also reports
//     that as a non-blocking "OPEN" outcome rather than a hard failure,
//     UNLESS the caller explicitly expected a hard-block (see
//     --expect below), in which case failing open when a block was
//     expected is itself reported as a verification failure.
//
// Usage:
//   node scripts/verify-preflight-gate.js --expect=<pass|402|429>
//
// Required environment variables:
//   SHORKY_CLOUD_URL  - base URL or full /api/v1/telemetry URL of the
//                        target shorky-cloud instance (same env var the
//                        Shorky CLI/action reads).
//   SHORKY_API_KEY    - the x-shorky-api-key for the fixture project to
//                        test against (see README.md / CLINE.md for the
//                        three QA fixture projects this is designed for).
//
// Exit codes:
//   0 - the live gate behaved exactly as expected for --expect.
//   1 - the live gate did NOT behave as expected (verification failure).
//   2 - misconfiguration (missing env vars / bad --expect value).

const VALID_EXPECTATIONS = ['pass', '402', '429'];

function parseArgs(argv) {
  const expectArg = argv.find((arg) => arg.startsWith('--expect='));
  const expect = expectArg ? expectArg.split('=')[1] : undefined;
  return { expect };
}

/**
 * Resolves the /api/v1/preflight URL from a base/telemetry SHORKY_CLOUD_URL
 * value, mirroring shorky's src/config/shorkyCloud.ts::getShorkyCloudPreflightUrl().
 */
function resolvePreflightUrl(rawCloudUrl) {
  const trimmed = rawCloudUrl.trim().replace(/\/+$/, '');
  const base = trimmed.replace(/\/api\/v1\/telemetry\/?$/, '');
  return `${base}/api/v1/preflight`;
}

async function runPreflightCheck(preflightUrl, apiKey) {
  try {
    const response = await fetch(preflightUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shorky-api-key': apiKey,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 402 || response.status === 429) {
      return { outcome: String(response.status), status: response.status, body: data };
    }

    if (response.ok) {
      return { outcome: 'pass', status: response.status, body: data };
    }

    // Any other non-2xx (401, 500, ...) - the real CLI fails OPEN here.
    return { outcome: 'open', status: response.status, body: data };
  } catch (error) {
    // Network error / timeout / DNS failure - the real CLI fails OPEN here.
    return { outcome: 'open', status: undefined, body: { error: error?.message || String(error) } };
  }
}

async function main() {
  const { expect } = parseArgs(process.argv.slice(2));

  if (!expect || !VALID_EXPECTATIONS.includes(expect)) {
    console.error(
      `❌ [Preflight Verify] Missing or invalid --expect flag. Usage: node scripts/verify-preflight-gate.js --expect=<${VALID_EXPECTATIONS.join('|')}>`,
    );
    process.exit(2);
  }

  const rawCloudUrl = process.env.SHORKY_CLOUD_URL;
  const apiKey = process.env.SHORKY_API_KEY;

  if (!rawCloudUrl) {
    console.error('❌ [Preflight Verify] SHORKY_CLOUD_URL environment variable is not set.');
    process.exit(2);
  }
  if (!apiKey) {
    console.error('❌ [Preflight Verify] SHORKY_API_KEY environment variable is not set.');
    process.exit(2);
  }

  const preflightUrl = resolvePreflightUrl(rawCloudUrl);
  console.log(`🚦 [Preflight Verify] Calling ${preflightUrl} (expecting: "${expect}")...`);

  const result = await runPreflightCheck(preflightUrl, apiKey);

  console.log(`📥 [Preflight Verify] Live outcome: "${result.outcome}"` + (result.status ? ` (HTTP ${result.status})` : ' (no HTTP response — network/timeout)'));
  console.log(`📥 [Preflight Verify] Response body: ${JSON.stringify(result.body)}`);

  const matched = result.outcome === expect;

  if (matched) {
    console.log(`✅ [Preflight Verify] PASS — live shorky-cloud gate returned "${result.outcome}" as expected for scenario "${expect}".`);
    process.exit(0);
  }

  console.error(
    `❌ [Preflight Verify] FAIL — expected outcome "${expect}" but the live shorky-cloud gate returned "${result.outcome}". ` +
      'This means either the fixture project in shorky-cloud is not configured as documented, or a real regression exists in the /api/v1/preflight contract.',
  );
  process.exit(1);
}

main();
