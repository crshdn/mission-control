import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const dbPath = path.join(os.tmpdir(), `mission-control-fk-guards-${Date.now()}-${Math.random()}.db`);
process.env.DATABASE_PATH = dbPath;

let createTask: typeof import('./route').POST;
let updateTask: typeof import('./[id]/route').PATCH;
let createActivity: typeof import('./[id]/activities/route').POST;
let createDeliverable: typeof import('./[id]/deliverables/route').POST;
let run: typeof import('@/lib/db').run;
let closeDb: typeof import('@/lib/db').closeDb;

const workspaceId = 'default';
const agentId = '11111111-1111-4111-8111-111111111111';
const missingAgentId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';

async function loadModules() {
  if (!createTask) {
    const [taskRoute, taskIdRoute, activityRoute, deliverableRoute, db] = await Promise.all([
      import('./route'),
      import('./[id]/route'),
      import('./[id]/activities/route'),
      import('./[id]/deliverables/route'),
      import('@/lib/db'),
    ]);

    createTask = taskRoute.POST;
    updateTask = taskIdRoute.PATCH;
    createActivity = activityRoute.POST;
    createDeliverable = deliverableRoute.POST;
    run = db.run;
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
    'folder',
    '2026-05-04T01:00:00.000Z',
    '2026-05-04T01:00:00.000Z',
  ]);

  run(
    `INSERT INTO agents (id, name, role, avatar_emoji, status, is_master, workspace_id, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agentId, 'Builder', 'engineer', 'tool', 'standby', 0, workspaceId, 'local', '2026-05-04T01:00:00.000Z', '2026-05-04T01:00:00.000Z']
  );

  run(
    `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [taskId, 'Existing task', 'Existing task for FK guard tests', 'inbox', 'normal', agentId, workspaceId, 'default', '2026-05-04T01:00:00.000Z', '2026-05-04T01:00:00.000Z']
  );
}

function jsonRequest(url: string, body: object): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchRequest(url: string, body: object): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

after(() => {
  closeDb?.();
  fs.rmSync(dbPath, { force: true });
});

test('task create rejects missing assigned_agent_id with structured 400', async () => {
  await resetDb();
  const response = await createTask(jsonRequest('http://localhost:4000/api/tasks', {
    title: 'Invalid assignee create',
    assigned_agent_id: missingAgentId,
    workspace_id: workspaceId,
    skip_brief_validation: true,
  }));

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'Invalid foreign key reference');
  assert.equal(body.field, 'assigned_agent_id');
  assert.equal(body.value, missingAgentId);
});

test('task update rejects missing assigned_agent_id with structured 400', async () => {
  await resetDb();
  const response = await updateTask(
    patchRequest(`http://localhost:4000/api/tasks/${taskId}`, { assigned_agent_id: missingAgentId }),
    { params: Promise.resolve({ id: taskId }) }
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'Invalid foreign key reference');
  assert.equal(body.field, 'assigned_agent_id');
  assert.equal(body.value, missingAgentId);
});

test('activity create rejects missing task and missing agent before insert', async () => {
  await resetDb();
  const missingTaskResponse = await createActivity(
    jsonRequest('http://localhost:4000/api/tasks/missing-task/activities', { activity_type: 'updated', message: 'No task' }),
    { params: { id: 'missing-task' } }
  );
  assert.equal(missingTaskResponse.status, 400);
  assert.equal((await missingTaskResponse.json()).field, 'task_id');

  const missingAgentResponse = await createActivity(
    jsonRequest(`http://localhost:4000/api/tasks/${taskId}/activities`, { activity_type: 'updated', message: 'No agent', agent_id: missingAgentId }),
    { params: { id: taskId } }
  );
  assert.equal(missingAgentResponse.status, 400);
  const body = await missingAgentResponse.json();
  assert.equal(body.field, 'agent_id');
  assert.equal(body.value, missingAgentId);
});

test('deliverable create rejects missing task before insert', async () => {
  await resetDb();
  const response = await createDeliverable(
    jsonRequest('http://localhost:4000/api/tasks/missing-task/deliverables', { deliverable_type: 'artifact', title: 'Output' }),
    { params: { id: 'missing-task' } }
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'Invalid foreign key reference');
  assert.equal(body.field, 'task_id');
});
