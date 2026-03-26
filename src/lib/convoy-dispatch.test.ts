import test from 'node:test';
import assert from 'node:assert/strict';
import { queryAll, queryOne, run } from './db';
import { dispatchReadyConvoySubtasks } from './convoy-dispatch';

function seedWorkspace(id: string) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, `Workspace ${id}`, `workspace-${id}`]
  );
}

function seedAgent(id: string, workspaceId: string) {
  run(
    `INSERT INTO agents (id, name, role, avatar_emoji, status, is_master, workspace_id, source, session_key_prefix, created_at, updated_at)
     VALUES (?, ?, 'builder', '🛠️', 'standby', 0, ?, 'local', 'agent:coder:', datetime('now'), datetime('now'))`,
    [id, `Builder ${id.slice(0, 6)}`, workspaceId]
  );
}

function seedTask(id: string, workspaceId: string, status: string, assignedAgentId: string | null = null) {
  run(
    `INSERT INTO tasks (id, title, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at)
     VALUES (?, ?, ?, 'normal', ?, ?, 'default', datetime('now'), datetime('now'))`,
    [id, `Task ${id.slice(0, 6)}`, status, assignedAgentId, workspaceId]
  );
}

function seedConvoy(convoyId: string, parentTaskId: string) {
  run(
    `INSERT INTO convoys (id, parent_task_id, name, status, total_subtasks, created_at, updated_at)
     VALUES (?, ?, 'Test Convoy', 'active', 1, datetime('now'), datetime('now'))`,
    [convoyId, parentTaskId]
  );
}

function seedConvoySubtask(convoyId: string, taskId: string) {
  run(
    `INSERT INTO convoy_subtasks (id, convoy_id, task_id, sort_order, created_at)
     VALUES (?, ?, ?, 0, datetime('now'))`,
    [crypto.randomUUID(), convoyId, taskId]
  );
}

test('failed convoy dispatch returns subtask to inbox and records failure', async () => {
  const workspaceId = `workspace-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const parentTaskId = crypto.randomUUID();
  const convoyId = crypto.randomUUID();
  const subtaskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId);
  seedTask(parentTaskId, workspaceId, 'convoy_active');
  seedTask(subtaskId, workspaceId, 'inbox', agentId);
  run('UPDATE tasks SET convoy_id = ?, is_subtask = 1 WHERE id = ?', [convoyId, subtaskId]);
  seedConvoy(convoyId, parentTaskId);
  seedConvoySubtask(convoyId, subtaskId);

  const originalFetch = global.fetch;
  global.fetch = async () => new Response('dispatch unavailable', { status: 503 });

  try {
    const result = await dispatchReadyConvoySubtasks(convoyId);
    assert.equal(result.dispatched, 0);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.reason, 'dispatch_failed');

    const task = queryOne<{ status: string; assigned_agent_id: string | null; planning_dispatch_error: string | null }>(
      'SELECT status, assigned_agent_id, planning_dispatch_error FROM tasks WHERE id = ?',
      [subtaskId]
    );
    assert.equal(task?.status, 'inbox');
    assert.equal(task?.assigned_agent_id, agentId);
    assert.match(task?.planning_dispatch_error || '', /Dispatch request failed \(503\)/);

    const event = queryOne<{ message: string }>(
      `SELECT message FROM events
       WHERE task_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [subtaskId]
    );
    assert.match(event?.message || '', /Convoy dispatch failed; subtask returned to inbox/);

    const activity = queryOne<{ message: string }>(
      `SELECT message FROM task_activities
       WHERE task_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [subtaskId]
    );
    assert.match(activity?.message || '', /Convoy dispatch failed; subtask returned to inbox/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('concurrent convoy dispatch attempts claim a ready subtask only once', async () => {
  const workspaceId = `workspace-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const parentTaskId = crypto.randomUUID();
  const convoyId = crypto.randomUUID();
  const subtaskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId);
  seedTask(parentTaskId, workspaceId, 'convoy_active');
  seedTask(subtaskId, workspaceId, 'inbox', agentId);
  run('UPDATE tasks SET convoy_id = ?, is_subtask = 1 WHERE id = ?', [convoyId, subtaskId]);
  seedConvoy(convoyId, parentTaskId);
  seedConvoySubtask(convoyId, subtaskId);

  let fetchCalls = 0;
  let releaseFetch = () => {};
  const waitForRelease = new Promise<void>((resolve) => {
    releaseFetch = () => resolve();
  });

  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCalls += 1;
    await waitForRelease;
    return new Response('{}', { status: 200 });
  };

  try {
    const firstPromise = dispatchReadyConvoySubtasks(convoyId);
    const secondPromise = dispatchReadyConvoySubtasks(convoyId);
    await new Promise((resolve) => setImmediate(resolve));
    releaseFetch();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    assert.equal(fetchCalls, 1);
    assert.equal(first.dispatched + second.dispatched, 1);

    const task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [subtaskId]);
    assert.equal(task?.status, 'assigned');

    const failedActivities = queryAll<{ id: string }>(
      `SELECT id FROM task_activities
       WHERE task_id = ? AND message LIKE 'Convoy dispatch failed; subtask returned to inbox:%'`,
      [subtaskId]
    );
    assert.equal(failedActivities.length, 0);
  } finally {
    releaseFetch();
    global.fetch = originalFetch;
  }
});
