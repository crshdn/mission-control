import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRetainWorkspace } from './workspace-retention';

test('shouldRetainWorkspace keeps active tasks and done tasks with pending merges', () => {
  assert.equal(shouldRetainWorkspace({ status: 'assigned' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'in_progress' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'testing' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'review' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'verification' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'done', merge_status: 'pending' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'done', merge_status: 'pr_created' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'done', merge_status: 'conflict' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'done', merge_status: 'failed' }), true);
});

test('shouldRetainWorkspace cleans up only truly settled finished tasks', () => {
  assert.equal(shouldRetainWorkspace({ status: 'done', merge_status: 'failed' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'done', merge_status: 'conflict' }), true);
  assert.equal(shouldRetainWorkspace({ status: 'done', merge_status: 'merged' }), false);
  assert.equal(shouldRetainWorkspace({ status: 'done', merge_status: null }), false);
  assert.equal(shouldRetainWorkspace({ status: 'failed' }), false);
  assert.equal(shouldRetainWorkspace(null), false);
});