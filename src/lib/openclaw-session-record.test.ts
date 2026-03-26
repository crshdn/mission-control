import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(os.tmpdir(), `openclaw-session-record-${process.pid}-${Date.now()}.db`);

const { closeDb, run } = require('./db');
const { resolveOpenClawSessionRecord } = require('./openclaw-session-record');

test.after(() => {
  closeDb();
  fs.rmSync(process.env.DATABASE_PATH!, { force: true });
});

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

function seedSession(input: {
  id: string;
  agentId: string;
  taskId: string | null;
  openclawSessionId: string;
  status: 'active' | 'ended';
  createdAt: string;
  updatedAt?: string;
  endedAt?: string | null;
}) {
  run(
    `INSERT INTO openclaw_sessions
       (id, agent_id, task_id, openclaw_session_id, channel, status, session_type, ended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'mission-control', ?, 'persistent', ?, ?, ?)`,
    [
      input.id,
      input.agentId,
      input.taskId,
      input.openclawSessionId,
      input.status,
      input.endedAt || null,
      input.createdAt,
      input.updatedAt || input.createdAt,
    ],
  );
}

test('resolveOpenClawSessionRecord prefers an exact database id match', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId);
  seedTask(taskId, workspaceId, agentId);
  seedSession({
    id: sessionId,
    agentId,
    taskId,
    openclawSessionId: 'mission-control-tester',
    status: 'ended',
    createdAt: '2026-03-25T12:35:17Z',
    endedAt: '2026-03-25T12:36:17Z',
  });

  const resolved = resolveOpenClawSessionRecord(sessionId);

  assert.equal(resolved?.id, sessionId);
});

test('resolveOpenClawSessionRecord prefers the active row for a reused session key', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const oldTaskId = crypto.randomUUID();
  const newTaskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId);
  seedTask(oldTaskId, workspaceId, agentId);
  seedTask(newTaskId, workspaceId, agentId);
  seedSession({
    id: crypto.randomUUID(),
    agentId,
    taskId: oldTaskId,
    openclawSessionId: 'mission-control-tester',
    status: 'ended',
    createdAt: '2026-03-26T02:56:19Z',
    endedAt: '2026-03-26T02:56:19Z',
  });
  seedSession({
    id: crypto.randomUUID(),
    agentId,
    taskId: newTaskId,
    openclawSessionId: 'mission-control-tester',
    status: 'active',
    createdAt: '2026-03-26T02:48:22Z',
  });

  const resolved = resolveOpenClawSessionRecord('mission-control-tester');

  assert.equal(resolved?.status, 'active');
  assert.equal(resolved?.task_id, newTaskId);
});

test('resolveOpenClawSessionRecord falls back to the newest historical row when no active row exists', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const olderTaskId = crypto.randomUUID();
  const newerTaskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId);
  seedTask(olderTaskId, workspaceId, agentId);
  seedTask(newerTaskId, workspaceId, agentId);
  seedSession({
    id: crypto.randomUUID(),
    agentId,
    taskId: olderTaskId,
    openclawSessionId: 'mission-control-reviewer',
    status: 'ended',
    createdAt: '2026-03-25T10:00:00Z',
    endedAt: '2026-03-25T10:05:00Z',
  });
  seedSession({
    id: crypto.randomUUID(),
    agentId,
    taskId: newerTaskId,
    openclawSessionId: 'mission-control-reviewer',
    status: 'ended',
    createdAt: '2026-03-25T11:00:00Z',
    endedAt: '2026-03-25T11:05:00Z',
  });

  const resolved = resolveOpenClawSessionRecord('mission-control-reviewer');

  assert.equal(resolved?.status, 'ended');
  assert.equal(resolved?.task_id, newerTaskId);
});
