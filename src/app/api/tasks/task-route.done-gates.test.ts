import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const dbPath = path.join(os.tmpdir(), `mission-control-done-gates-${Date.now()}-${Math.random()}.db`);
process.env.DATABASE_PATH = dbPath;

let PATCH: typeof import('./[id]/route').PATCH;
let run: typeof import('@/lib/db').run;
let queryOne: typeof import('@/lib/db').queryOne;
let closeDb: typeof import('@/lib/db').closeDb;

const workspaceId = 'default';
const agentId = '11111111-1111-4111-8111-111111111111';

async function loadModules() {
  if (!PATCH) {
    const [routeModule, db] = await Promise.all([
      import('./[id]/route'),
      import('@/lib/db')
    ]);

    PATCH = routeModule.PATCH;
    run = db.run;
    queryOne = db.queryOne;
    closeDb = db.closeDb;
  }
}

async function resetDb() {
  await loadModules();

  run(`CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_triggered_at TEXT,
    failure_count INTEGER DEFAULT 0
  )`);

  run('DELETE FROM webhooks');
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
    '2026-04-30T17:00:00.000Z',
    '2026-04-30T17:00:00.000Z'
  ]);
}

function insertAgent() {
  run(
    `INSERT INTO agents (id, name, role, avatar_emoji, status, is_master, workspace_id, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agentId, 'Builder', 'engineer', '🛠️', 'standby', 0, workspaceId, 'local', '2026-04-30T17:00:00.000Z', '2026-04-30T17:00:00.000Z']
  );
}

function insertTask(taskId: string, overrides: Record<string, unknown> = {}) {
  const task = {
    id: taskId,
    title: `Task ${taskId}`,
    description: 'Completion gate regression test',
    status: 'review',
    priority: 'normal',
    qc_status: 'passed',
    qc_failures: '[]',
    assigned_agent_id: agentId,
    created_by_agent_id: null,
    workspace_id: workspaceId,
    business_id: 'default',
    result: 'Implemented the feature and captured the final output.',
    result_captured_at: null,
    verification_output: 'Build passed. Manual verification confirmed the happy path, edge case handling, and saved artifacts.',
    verified_at: null,
    output_url: 'https://example.com/tasks/output',
    created_at: '2026-04-30T17:00:00.000Z',
    updated_at: '2026-04-30T17:00:00.000Z',
    ...overrides
  };

  run(
    `INSERT INTO tasks (
      id, title, description, status, priority, qc_status, qc_failures, assigned_agent_id,
      created_by_agent_id, workspace_id, business_id, result, result_captured_at,
      verification_output, verified_at, output_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.title,
      task.description,
      task.status,
      task.priority,
      task.qc_status,
      task.qc_failures,
      task.assigned_agent_id,
      task.created_by_agent_id,
      task.workspace_id,
      task.business_id,
      task.result,
      task.result_captured_at,
      task.verification_output,
      task.verified_at,
      task.output_url,
      task.created_at,
      task.updated_at
    ]
  );
}

function insertSession(taskId: string) {
  run(
    `INSERT INTO openclaw_sessions (
      id, agent_id, openclaw_session_id, channel, status, session_type, task_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `session-${taskId}`,
      agentId,
      `agent:builder:${taskId}`,
      'webchat',
      'completed',
      'subagent',
      taskId,
      '2026-04-30T17:10:00.000Z',
      '2026-04-30T17:20:00.000Z'
    ]
  );
}

function insertDeliverable(taskId: string) {
  run(
    `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      `deliverable-${taskId}`,
      taskId,
      'artifact',
      'Final implementation summary',
      null,
      'Captured final output',
      '2026-04-30T17:21:00.000Z'
    ]
  );
}

async function patchTask(taskId: string, body: Record<string, unknown>) {
  await loadModules();

  const request = new NextRequest(`http://localhost/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  return PATCH(request, { params: Promise.resolve({ id: taskId }) });
}

after(async () => {
  await loadModules();
  closeDb();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
});

test('PATCH rejects done when assignee and session traceability are missing', async () => {
  await resetDb();
  insertTask('task-missing-owner', { assigned_agent_id: null });

  const response = await patchTask('task-missing-owner', {
    status: 'done',
    skip_url_verification: true
  });
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.error, 'Cannot mark done with inconsistent completion metadata');
  assert.deepEqual(json.details, [
    'done requires assignee traceability via assigned_agent_id',
    'done requires task session traceability via openclaw_sessions'
  ]);
});

test('PATCH rejects done when qc is still pending', async () => {
  await resetDb();
  insertAgent();
  insertTask('task-qc-pending', { qc_status: 'pending' });
  insertSession('task-qc-pending');
  insertDeliverable('task-qc-pending');

  const response = await patchTask('task-qc-pending', {
    status: 'done',
    output_url: null,
    skip_url_verification: true
  });
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.error, 'Cannot mark done with inconsistent completion metadata');
  assert.deepEqual(json.details, [
    'done requires qc_status=passed or qc_status=skipped, not pending'
  ]);
});

test('PATCH accepts coherent done metadata without manual override', async () => {
  await resetDb();
  insertAgent();
  insertTask('task-valid-done', { output_url: null });
  insertSession('task-valid-done');
  insertDeliverable('task-valid-done');

  const response = await patchTask('task-valid-done', {
    status: 'done',
    output_url: null,
    skip_url_verification: true
  });
  const json = await response.json();
  const saved = queryOne<{ status: string; verified_at: string | null; result_captured_at: string | null }>(
    'SELECT status, verified_at, result_captured_at FROM tasks WHERE id = ?',
    ['task-valid-done']
  );

  assert.equal(response.status, 200);
  assert.equal(json.status, 'done');
  assert.equal(saved?.status, 'done');
  assert.ok(saved?.verified_at);
  assert.ok(saved?.result_captured_at);
});

test('PATCH manual_override preserves an audit activity for blocked done transitions', async () => {
  await resetDb();
  insertTask('task-manual-override', { assigned_agent_id: null, qc_status: 'pending' });

  const response = await patchTask('task-manual-override', {
    status: 'done',
    manual_override: true,
    override_reason: 'Historic import recovery with external evidence retained.',
    skip_url_verification: true
  });
  const json = await response.json();
  const activity = queryOne<{ message: string }>(
    'SELECT message FROM task_activities WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
    ['task-manual-override']
  );

  assert.equal(response.status, 200);
  assert.equal(json.status, 'done');
  assert.match(activity?.message || '', /MANUAL OVERRIDE/);
  assert.match(activity?.message || '', /assigned_agent_id/);
  assert.match(activity?.message || '', /qc_status=passed or qc_status=skipped, not pending/);
  assert.match(activity?.message || '', /Historic import recovery/);
});
