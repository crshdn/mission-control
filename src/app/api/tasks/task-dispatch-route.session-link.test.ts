import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbPath = path.join(os.tmpdir(), `mission-control-dispatch-session-link-${Date.now()}-${Math.random()}.db`);
process.env.DATABASE_PATH = dbPath;

let ensureTaskSessionTraceability: typeof import('@/lib/task-session-traceability').ensureTaskSessionTraceability;
let run: typeof import('@/lib/db').run;
let queryAll: typeof import('@/lib/db').queryAll;
let closeDb: typeof import('@/lib/db').closeDb;

const workspaceId = 'default';
const agentId = 'agent-pam';
const now = '2026-04-30T22:45:00.000Z';

async function loadModules() {
  if (!ensureTaskSessionTraceability) {
    const [traceabilityModule, db] = await Promise.all([
      import('@/lib/task-session-traceability'),
      import('@/lib/db')
    ]);

    ensureTaskSessionTraceability = traceabilityModule.ensureTaskSessionTraceability;
    run = db.run;
    queryAll = db.queryAll;
    closeDb = db.closeDb;
  }
}

async function resetDb() {
  await loadModules();

  run('DELETE FROM task_activities');
  run('DELETE FROM task_deliverables');
  run('DELETE FROM openclaw_sessions');
  run('DELETE FROM events');
  run('DELETE FROM tasks');
  run('DELETE FROM agents');
  run('DELETE FROM workspaces');

  run('INSERT INTO workspaces (id, name, slug, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
    workspaceId,
    'Default Workspace',
    'default',
    '📁',
    now,
    now
  ]);

  run(
    `INSERT INTO agents (id, name, role, avatar_emoji, status, is_master, workspace_id, source, gateway_agent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agentId, 'Pam', 'operator', '🧭', 'standby', 0, workspaceId, 'local', 'pam', now, now]
  );

  for (const taskId of ['old-task', 'new-task']) {
    run(
      `INSERT INTO tasks (id, title, description, status, priority, workspace_id, business_id, assigned_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, `Task ${taskId}`, 'Dispatch traceability test', 'assigned', 'normal', workspaceId, 'default', agentId, now, now]
    );
  }
}

after(async () => {
  await loadModules();
  closeDb();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
});

test('ensureTaskSessionTraceability creates a task-linked row when reusing an active session', async () => {
  await resetDb();

  run(
    `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, session_type, task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['session-old', agentId, 'mission-control-pam', 'mission-control', 'active', 'subagent', 'old-task', now, now]
  );

  const session = ensureTaskSessionTraceability(
    {
      id: 'session-old',
      agent_id: agentId,
      openclaw_session_id: 'mission-control-pam',
      channel: 'mission-control',
      status: 'active',
      session_type: 'subagent',
      task_id: 'old-task',
      created_at: now,
      updated_at: now,
    },
    agentId,
    'new-task',
    '2026-04-30T22:46:00.000Z'
  );

  const rows = queryAll<{
    id: string;
    task_id: string | null;
    openclaw_session_id: string;
    status: string;
  }>(
    `SELECT id, task_id, openclaw_session_id, status
     FROM openclaw_sessions
     WHERE agent_id = ?
     ORDER BY created_at ASC, id ASC`,
    [agentId]
  );

  assert.equal(session.task_id, 'new-task');
  assert.deepEqual(rows, [
    {
      id: 'session-old',
      task_id: 'old-task',
      openclaw_session_id: 'mission-control-pam',
      status: 'active',
    },
    {
      id: session.id,
      task_id: 'new-task',
      openclaw_session_id: 'mission-control-pam',
      status: 'active',
    }
  ]);
});

test('ensureTaskSessionTraceability refreshes the existing row for the same task instead of duplicating it', async () => {
  await resetDb();

  run(
    `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, session_type, task_id, ended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['session-existing', agentId, 'mission-control-pam', 'mission-control', 'completed', 'subagent', 'new-task', '2026-04-30T22:40:00.000Z', now, now]
  );

  const session = ensureTaskSessionTraceability(
    {
      id: 'session-source',
      agent_id: agentId,
      openclaw_session_id: 'mission-control-pam',
      channel: 'mission-control',
      status: 'active',
      session_type: 'subagent',
      task_id: 'old-task',
      created_at: now,
      updated_at: now,
    },
    agentId,
    'new-task',
    '2026-04-30T22:47:00.000Z'
  );

  const rows = queryAll<{
    id: string;
    task_id: string | null;
    status: string;
    ended_at: string | null;
    updated_at: string;
  }>(
    `SELECT id, task_id, status, ended_at, updated_at
     FROM openclaw_sessions
     WHERE agent_id = ?
     ORDER BY created_at ASC, id ASC`,
    [agentId]
  );

  assert.equal(session.id, 'session-existing');
  assert.deepEqual(rows, [
    {
      id: 'session-existing',
      task_id: 'new-task',
      status: 'active',
      ended_at: null,
      updated_at: '2026-04-30T22:47:00.000Z',
    }
  ]);
});
