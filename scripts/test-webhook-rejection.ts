/**
 * Webhook signature rejection smoke test.
 *
 * Verifies that webhook endpoints reject requests with bad/missing
 * signatures when the corresponding secrets are configured.
 *
 * Run: WEBHOOK_SECRET=test GITHUB_WEBHOOK_SECRET=test tsx scripts/test-webhook-rejection.ts
 */

import { createHmac } from 'crypto';

const MC_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:4000';
const MC_TOKEN = process.env.MC_API_TOKEN;

const headers: Record<string, string> = { 'Content-Type': 'application/json' };
if (MC_TOKEN) headers['Authorization'] = `Bearer ${MC_TOKEN}`;

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function testAgentCompletionWebhook() {
  console.log('\n── Agent-completion webhook ──');
  const payload = JSON.stringify({ task_id: '00000000-0000-0000-0000-000000000000', summary: 'test' });

  // 1. No signature → should be rejected if WEBHOOK_SECRET is set
  const noSig = await fetch(`${MC_URL}/api/webhooks/agent-completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  assert(noSig.status === 401, `Missing signature returns 401 (got ${noSig.status})`);

  // 2. Bad signature → should be rejected
  const badSig = await fetch(`${MC_URL}/api/webhooks/agent-completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'badhex' },
    body: payload,
  });
  assert(badSig.status === 401, `Bad signature returns 401 (got ${badSig.status})`);

  // 3. Valid signature → should get through (may return 404 for fake task_id, which is fine)
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const validSig = createHmac('sha256', secret).update(payload).digest('hex');
    const goodSig = await fetch(`${MC_URL}/api/webhooks/agent-completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': validSig },
      body: payload,
    });
    assert(goodSig.status !== 401, `Valid signature is not rejected (got ${goodSig.status})`);
  } else {
    console.log('  ⊘ Skipping valid-signature test — WEBHOOK_SECRET not set');
  }
}

async function testGitHubWebhook() {
  console.log('\n── GitHub webhook ──');
  const payload = JSON.stringify({ action: 'ping' });

  // 1. No signature → should be rejected if GITHUB_WEBHOOK_SECRET is set
  const noSig = await fetch(`${MC_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-github-event': 'ping' },
    body: payload,
  });
  assert(noSig.status === 401, `Missing signature returns 401 (got ${noSig.status})`);

  // 2. Bad signature
  const badSig = await fetch(`${MC_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-github-event': 'ping',
      'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
    },
    body: payload,
  });
  assert(badSig.status === 401, `Bad signature returns 401 (got ${badSig.status})`);

  // 3. Valid signature
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const validSig = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    const goodSig = await fetch(`${MC_URL}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'ping',
        'x-hub-signature-256': validSig,
      },
      body: payload,
    });
    assert(goodSig.status !== 401, `Valid signature is not rejected (got ${goodSig.status})`);
  } else {
    console.log('  ⊘ Skipping valid-signature test — GITHUB_WEBHOOK_SECRET not set');
  }
}

async function main() {
  console.log('Webhook Signature Rejection Tests');
  console.log(`Target: ${MC_URL}`);

  if (!process.env.WEBHOOK_SECRET && !process.env.GITHUB_WEBHOOK_SECRET) {
    console.error('\n⚠ Neither WEBHOOK_SECRET nor GITHUB_WEBHOOK_SECRET set.');
    console.error('  Set them to test rejection behavior, e.g.:');
    console.error('  WEBHOOK_SECRET=test GITHUB_WEBHOOK_SECRET=test tsx scripts/test-webhook-rejection.ts');
    process.exit(1);
  }

  if (process.env.WEBHOOK_SECRET) {
    await testAgentCompletionWebhook();
  } else {
    console.log('\n── Agent-completion webhook ── (skipped, WEBHOOK_SECRET not set)');
  }

  if (process.env.GITHUB_WEBHOOK_SECRET) {
    await testGitHubWebhook();
  } else {
    console.log('\n── GitHub webhook ── (skipped, GITHUB_WEBHOOK_SECRET not set)');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
