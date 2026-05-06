import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const dbPath = path.join(os.tmpdir(), `mission-control-qc-approval-${Date.now()}-${Math.random()}.db`);
process.env.DATABASE_PATH = dbPath;

let POST: typeof import('./[id]/qc/route').POST | undefined;
let GET_TASK: typeof import('./[id]/route').GET | undefined;
let taskRouteDynamic: typeof import('./[id]/route').dynamic | undefined;
let run: typeof import('@/lib/db').run | undefined;
let queryOne: typeof import('@/lib/db').queryOne | undefined;
let closeDb: typeof import('@/lib/db').closeDb | undefined;

async function ensureHarness() {
  if (POST && GET_TASK && taskRouteDynamic && run && queryOne && closeDb) {
    return;
  }

  const [qcRouteModule, taskRouteModule, db] = await Promise.all([
    import('./[id]/qc/route'),
    import('./[id]/route'),
    import('@/lib/db')
  ]);

  POST = qcRouteModule.POST;
  GET_TASK = taskRouteModule.GET;
  taskRouteDynamic = taskRouteModule.dynamic;
  run = db.run;
  queryOne = db.queryOne;
  closeDb = db.closeDb;
}

const workspaceId = 'default';
const agentId = '11111111-1111-4111-8111-111111111111';

async function resetDb() {
  await ensureHarness();
  run!('DELETE FROM task_activities');
  run!('DELETE FROM task_deliverables');
  run!('DELETE FROM openclaw_sessions');
  run!('DELETE FROM events');
  run!('DELETE FROM tasks');
  run!('DELETE FROM agents');
  run!('DELETE FROM workspaces');

  run!('INSERT INTO workspaces (id, name, slug, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
    workspaceId,
    'Default Workspace',
    'default',
    '📁',
    '2026-04-30T17:00:00.000Z',
    '2026-04-30T17:00:00.000Z'
  ]);
}

function insertAgent() {
  run!(
    `INSERT INTO agents (id, name, role, avatar_emoji, status, is_master, workspace_id, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agentId, 'Builder', 'engineer', '🛠️', 'working', 0, workspaceId, 'local', '2026-04-30T17:00:00.000Z', '2026-04-30T17:00:00.000Z']
  );
}

function insertTask(taskId: string, overrides: Record<string, unknown> = {}) {
  const task = {
    id: taskId,
    title: `Task ${taskId}`,
    description: 'QC approval regression test',
    status: 'review',
    priority: 'normal',
    qc_status: 'pending',
    qc_failures: '[]',
    assigned_agent_id: agentId,
    created_by_agent_id: null,
    workspace_id: workspaceId,
    business_id: 'default',
    result: 'Implemented the feature and captured the final output.',
    result_captured_at: null,
    verification_output: 'Build passed. Manual verification confirmed the approval path, follow-up readback, and saved artifacts.',
    verified_at: null,
    output_url: 'https://example.com/tasks/output',
    created_at: '2026-04-30T17:00:00.000Z',
    updated_at: '2026-04-30T17:00:00.000Z',
    ...overrides
  };

  run!(
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
  run!(
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
  run!(
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

async function approveTask(taskId: string) {
  await ensureHarness();

  const request = new NextRequest(`http://localhost/api/tasks/${taskId}/qc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      decision: 'APPROVED',
      reasoning: 'Regression approval after checking the completion metadata stamp.'
    })
  });

  return POST!(request, { params: Promise.resolve({ id: taskId }) });
}

async function readTask(taskId: string) {
  await ensureHarness();

  const request = new NextRequest(`http://localhost/api/tasks/${taskId}`, {
    method: 'GET'
  });

  return GET_TASK!(request, { params: Promise.resolve({ id: taskId }) });
}

after(async () => {
  await ensureHarness();
  closeDb!();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
});

test('single-task route is forced dynamic so approval readbacks cannot serve stale completion metadata', async () => {
  await ensureHarness();
  assert.equal(taskRouteDynamic, 'force-dynamic');
});

test('QC approval immediately stamps coherent completion metadata for a review task', async () => {
  await resetDb();
  insertAgent();
  insertTask('task-qc-review');
  insertSession('task-qc-review');
  insertDeliverable('task-qc-review');

  const response = await approveTask('task-qc-review');
  const json = await response.json();
  const saved = queryOne!<{ status: string; qc_status: string; qc_failures: string; verified_at: string | null; result_captured_at: string | null }>(
    'SELECT status, qc_status, qc_failures, verified_at, result_captured_at FROM tasks WHERE id = ?',
    ['task-qc-review']
  );

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.action, 'completed');
  assert.equal(saved?.status, 'done');
  assert.equal(saved?.qc_status, 'passed');
  assert.equal(saved?.qc_failures, '[]');
  assert.ok(saved?.verified_at);
  assert.ok(saved?.result_captured_at);
});

test('QC approval readback stays coherent through the single-task GET route after the exact partial-stamp case', async () => {
  await resetDb();
  insertAgent();
  insertTask('task-qc-readback', {
    status: 'done',
    qc_status: 'pending',
    verified_at: null
  });
  insertSession('task-qc-readback');
  insertDeliverable('task-qc-readback');

  const approvalResponse = await approveTask('task-qc-readback');
  const approvalJson = await approvalResponse.json();
  const readbackResponse = await readTask('task-qc-readback');
  const readbackJson = await readbackResponse.json();

  assert.equal(approvalResponse.status, 200);
  assert.equal(approvalJson.success, true);
  assert.equal(approvalJson.action, 'completed');
  assert.equal(readbackResponse.status, 200);
  assert.equal(readbackJson.status, 'done');
  assert.equal(readbackJson.qc_status, 'passed');
  assert.equal(readbackJson.qc_failures, '[]');
  assert.ok(readbackJson.verified_at);
  assert.ok(readbackJson.result_captured_at);
});

test('QC approval repairs the exact partial-stamp case instead of leaving pending qc metadata behind', async () => {
  await resetDb();
  insertAgent();
  insertTask('task-qc-partial-stamp', {
    status: 'done',
    qc_status: 'pending',
    verified_at: null
  });
  insertSession('task-qc-partial-stamp');
  insertDeliverable('task-qc-partial-stamp');

  const response = await approveTask('task-qc-partial-stamp');
  const json = await response.json();
  const saved = queryOne!<{ status: string; qc_status: string; qc_failures: string; verified_at: string | null; result_captured_at: string | null }>(
    'SELECT status, qc_status, qc_failures, verified_at, result_captured_at FROM tasks WHERE id = ?',
    ['task-qc-partial-stamp']
  );

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.action, 'completed');
  assert.equal(saved?.status, 'done');
  assert.equal(saved?.qc_status, 'passed');
  assert.equal(saved?.qc_failures, '[]');
  assert.ok(saved?.verified_at);
  assert.ok(saved?.result_captured_at);
});
