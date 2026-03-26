import test from 'node:test';
import assert from 'node:assert/strict';
import { queryOne, run } from './db';
import { ensureTaskSessionLink } from './dispatch-session';

function seedWorkspace(id: string) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, `Workspace ${id}`, `workspace-${id}`],
  );
}

function seedAgent(id: string, workspaceId: string) {
  run(
    `INSERT INTO agents (id, name, role, avatar_emoji, status, is_master, workspace_id, source, session_key_prefix, created_at, updated_at)
     VALUES (?, ?, 'builder', ':)', 'working', 0, ?, 'local', 'agent:coder:', datetime('now'), datetime('now'))`,
    [id, `Builder ${id.slice(0, 6)}`, workspaceId],
  );
}

function seedTask(id: string, workspaceId: string, agentId: string) {
  run(
    `INSERT INTO tasks (id, title, status, priority, assigned_agent_id, workspace_id, business_id, planning_complete, created_at, updated_at)
     VALUES (?, ?, 'in_progress', 'normal', ?, ?, 'default', 1, datetime('now'), datetime('now'))`,
    [id, `Task ${id.slice(0, 6)}`, agentId, workspaceId],
  );
}

test('ensureTaskSessionLink creates a new active session linked to the task', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId);
  seedTask(taskId, workspaceId, agentId);

  const result = ensureTaskSessionLink({
    agentId,
    agentName: 'Builder Agent',
    taskId,
    now: new Date().toISOString(),
  });

  assert.equal(result.created, true);
  assert.equal(result.relinked, false);
  assert.equal(result.session.task_id, taskId);
  assert.match(result.session.openclaw_session_id, /^mission-control-builder-agent$/);
});

test('ensureTaskSessionLink relinks an existing active session to the new task', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const oldTaskId = crypto.randomUUID();
  const newTaskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId);
  seedTask(oldTaskId, workspaceId, agentId);
  seedTask(newTaskId, workspaceId, agentId);
  run(
    `INSERT INTO openclaw_sessions (id, agent_id, task_id, openclaw_session_id, channel, status, created_at, updated_at)
     VALUES (?, ?, ?, 'mission-control-existing', 'mission-control', 'active', datetime('now'), datetime('now'))`,
    [crypto.randomUUID(), agentId, oldTaskId],
  );

  const result = ensureTaskSessionLink({
    agentId,
    agentName: 'Builder Agent',
    taskId: newTaskId,
    now: new Date().toISOString(),
  });

  assert.equal(result.created, false);
  assert.equal(result.relinked, true);
  assert.equal(result.session.task_id, newTaskId);

  const session = queryOne<{ task_id: string }>(
    `SELECT task_id FROM openclaw_sessions WHERE agent_id = ? AND status = 'active' LIMIT 1`,
    [agentId],
  );
  assert.equal(session?.task_id, newTaskId);
});

test('ensureTaskSessionLink reuses an already-linked active session', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId);
  seedTask(taskId, workspaceId, agentId);
  run(
    `INSERT INTO openclaw_sessions (id, agent_id, task_id, openclaw_session_id, channel, status, created_at, updated_at)
     VALUES (?, ?, ?, 'mission-control-existing', 'mission-control', 'active', datetime('now'), datetime('now'))`,
    [crypto.randomUUID(), agentId, taskId],
  );

  const result = ensureTaskSessionLink({
    agentId,
    agentName: 'Builder Agent',
    taskId,
    now: new Date().toISOString(),
  });

  assert.equal(result.created, false);
  assert.equal(result.relinked, false);

  const activeSessions = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM openclaw_sessions WHERE agent_id = ? AND status = 'active'`,
    [agentId],
  );
  assert.equal(activeSessions?.count, 1);
});
