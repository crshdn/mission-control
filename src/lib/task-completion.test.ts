import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDoneOverrideLog, getApprovedCompletionStamp, getDoneTransitionIssues } from './task-completion';

const validTask = {
  status: 'review',
  assigned_agent_id: 'agent-123',
  result: 'Built the feature and verified the main flow.',
  verification_output: 'Build passed. Manual verification confirmed the completion flow works end to end.',
  output_url: 'https://example.com/output',
  qc_status: 'passed',
  qc_failures: '[]'
} as const;

test('blocks done when qc_status is still pending', () => {
  const issues = getDoneTransitionIssues({ ...validTask, qc_status: 'pending' });

  assert.deepEqual(issues, [
    'done requires qc_status=passed or qc_status=skipped, not pending'
  ]);
});

test('blocks done when assignee traceability is missing', () => {
  const issues = getDoneTransitionIssues({ ...validTask, assigned_agent_id: null });

  assert.deepEqual(issues, [
    'done requires assignee traceability via assigned_agent_id'
  ]);
});

test('blocks done when qc failures still exist even after a pass', () => {
  const issues = getDoneTransitionIssues({ ...validTask, qc_failures: JSON.stringify(['Console error on load']) });

  assert.deepEqual(issues, [
    'done cannot proceed while qc_failures are still recorded'
  ]);
});

test('blocks done when verification evidence is missing', () => {
  const issues = getDoneTransitionIssues({
    ...validTask,
    verification_output: '',
    result: ''
  });

  assert.deepEqual(issues, [
    'done requires completion evidence in result or verification_output',
    'done requires verification_output describing how completion was verified'
  ]);
});

test('blocks done when there is no output or session traceability', () => {
  const issues = getDoneTransitionIssues({
    ...validTask,
    output_url: null
  }, {}, {
    deliverableCount: 0,
    sessionCount: 0
  });

  assert.deepEqual(issues, [
    'done requires output traceability via output_url or at least one logged deliverable',
    'done requires task session traceability via openclaw_sessions'
  ]);
});

test('allows coherent done metadata', () => {
  const issues = getDoneTransitionIssues(validTask, {}, {
    deliverableCount: 1,
    sessionCount: 1
  });

  assert.deepEqual(issues, []);
});

test('manual override log includes failed checks and reason', () => {
  const message = formatDoneOverrideLog([
    'done requires assignee traceability via assigned_agent_id',
    'done requires qc_status=passed or qc_status=skipped, not pending'
  ], 'Historic recovery after external import');

  assert.match(message, /MANUAL OVERRIDE/);
  assert.match(message, /assignee traceability/);
  assert.match(message, /qc_status=passed or qc_status=skipped, not pending/);
  assert.match(message, /Historic recovery after external import/);
});


test('approved completion stamp backfills result capture time for previously uncaptured evidence', () => {
  const stamp = getApprovedCompletionStamp('2026-04-30T18:01:55.638Z', {
    result: 'Implemented the feature and captured the final output.',
    result_captured_at: null
  });

  assert.equal(stamp.result_captured_at, '2026-04-30T18:01:55.638Z');
  assert.equal(stamp.qc_status, 'passed');
  assert.equal(stamp.verified_at, '2026-04-30T18:01:55.638Z');
});

test('approved completion stamp preserves existing result capture timestamps', () => {
  const stamp = getApprovedCompletionStamp('2026-04-30T18:01:55.638Z', {
    result: 'Implemented the feature and captured the final output.',
    result_captured_at: '2026-04-30T17:59:00.000Z'
  });

  assert.equal(stamp.result_captured_at, undefined);
});
