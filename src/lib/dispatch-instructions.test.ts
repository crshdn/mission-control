import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCallbackAuthPreflight,
  buildMissionControlCurlCommand,
  buildTaskCompletionInstructions,
} from './dispatch-instructions';

test('buildCallbackAuthPreflight mentions the temporary auth file when auth is enabled', () => {
  const output = buildCallbackAuthPreflight(true);

  assert.match(output, /MC_API_TOKEN/);
  assert.match(output, /\.env\.mc-token-temp/);
  assert.match(output, /source \.\/\.env\.mc-token-temp/);
  assert.match(output, /if \[ -z "\$\{MC_API_TOKEN:-\}" \]/);
});

test('buildMissionControlCurlCommand never embeds the raw token value', () => {
  const originalToken = process.env.MC_API_TOKEN;
  process.env.MC_API_TOKEN = 'super-secret-token';

  try {
    const command = buildMissionControlCurlCommand({
      authEnabled: true,
      method: 'PATCH',
      url: 'http://localhost:4000/api/tasks/task-123',
      body: '{"status":"review"}',
    });

    assert.doesNotMatch(command, /super-secret-token/);
    assert.match(command, /Authorization: Bearer \$MC_API_TOKEN/);
  } finally {
    process.env.MC_API_TOKEN = originalToken;
  }
});

test('builder instructions use env-based auth and mention temp secret files as a source', () => {
  const output = buildTaskCompletionInstructions({
    role: 'builder',
    authEnabled: true,
    missionControlUrl: 'http://localhost:4000',
    taskId: 'task-123',
    nextStatus: 'review',
    outputPath: '/tmp/example/index.html',
  });

  assert.match(output, /MC_API_TOKEN/);
  assert.match(output, /deliverables/);
  assert.match(output, /\/tmp\/example\/index\.html/);
  assert.match(output, /\.env\.mc-token-temp/);
  assert.match(output, /source \.\//);
});

test('tester and verifier instructions emit role-specific success and failure callbacks', () => {
  const tester = buildTaskCompletionInstructions({
    role: 'tester',
    authEnabled: true,
    missionControlUrl: 'http://localhost:4000',
    taskId: 'task-123',
    nextStatus: 'verification',
  });
  const verifier = buildTaskCompletionInstructions({
    role: 'verifier',
    authEnabled: true,
    missionControlUrl: 'http://localhost:4000',
    taskId: 'task-123',
    nextStatus: 'done',
  });

  assert.match(tester, /TEST_PASS/);
  assert.match(tester, /\/api\/tasks\/task-123\/fail/);
  assert.match(verifier, /VERIFY_PASS/);
  assert.match(verifier, /\/api\/tasks\/task-123\/fail/);
  assert.match(tester, /\.env\.mc-token-temp/);
  assert.match(verifier, /\.env\.mc-token-temp/);
});
