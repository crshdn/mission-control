import test from 'node:test';
import assert from 'node:assert/strict';
import { run, queryOne } from './db';
import {
  hasStageEvidence,
  taskCanBeDone,
  ensureFixerExists,
  getFailureCountInStage,
} from './task-governance';

function seedWorkspace(id: string) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, `Workspace ${id}`, `workspace-${id}`]
  );
}

function seedTask(id: string, workspace = 'default') {
  seedWorkspace(workspace);
  run(
    `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, created_at, updated_at)
     VALUES (?, 'T', 'review', 'normal', ?, 'default', datetime('now'), datetime('now'))`,
    [id, workspace]
  );
}

test('evidence gate requires deliverable + activity', () => {
  const taskId = crypto.randomUUID();
  seedTask(taskId);

  assert.equal(hasStageEvidence(taskId), false);

  run(
    `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'file', 'index.html', datetime('now'))`,
    [taskId]
  );
  assert.equal(hasStageEvidence(taskId), false);

  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'completed', 'did thing', datetime('now'))`,
    [taskId]
  );

  assert.equal(hasStageEvidence(taskId), true);
});

test('task cannot be done when status_reason indicates failure', () => {
  const taskId = crypto.randomUUID();
  seedTask(taskId);

  run(`UPDATE tasks SET status_reason = 'Validation failed: CSS broken' WHERE id = ?`, [taskId]);
  run(
    `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'file', 'index.html', datetime('now'))`,
    [taskId]
  );
  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'completed', 'did thing', datetime('now'))`,
    [taskId]
  );

  assert.equal(taskCanBeDone(taskId), false);
});

test('ensureFixerExists creates fixer when missing', () => {
  const workspaceId = `workspace-${crypto.randomUUID()}`;
  seedWorkspace(workspaceId);

  const fixer = ensureFixerExists(workspaceId);
  assert.equal(fixer.created, true);

  const stored = queryOne<{ id: string; role: string }>('SELECT id, role FROM agents WHERE id = ?', [fixer.id]);
  assert.ok(stored);
  assert.equal(stored?.role, 'fixer');
});

test('failure counter reads status_changed failure events', () => {
  const taskId = crypto.randomUUID();
  seedTask(taskId);

  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'status_changed', 'Stage failed: verification → in_progress (reason: x)', datetime('now'))`,
    [taskId]
  );
  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (lower(hex(randomblob(16))), ?, 'status_changed', 'Stage failed: verification → in_progress (reason: y)', datetime('now'))`,
    [taskId]
  );

  assert.equal(getFailureCountInStage(taskId, 'verification'), 2);
});
