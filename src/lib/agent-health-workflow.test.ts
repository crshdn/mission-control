import test from 'node:test';
import assert from 'node:assert/strict';
import { queryOne, run } from './db';
import { checkAgentHealth, nudgeAgent, runHealthCheckCycle } from './agent-health';

function seedWorkspace(id: string) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, `Workspace ${id}`, `workspace-${id}`]
  );
}

function seedAgent(id: string, workspaceId: string, status: 'standby' | 'working' = 'working') {
  run(
    `INSERT INTO agents (id, name, role, avatar_emoji, status, is_master, workspace_id, source, session_key_prefix, created_at, updated_at)
     VALUES (?, ?, 'builder', '🛠️', ?, 0, ?, 'local', 'agent:coder:', datetime('now'), datetime('now'))`,
    [id, `Builder ${id.slice(0, 6)}`, status, workspaceId]
  );
}

function seedTask(options: {
  id: string;
  workspaceId: string;
  agentId: string;
  status?: string;
  planningComplete?: number;
  updatedAtExpr?: string;
}) {
  run(
    `INSERT INTO tasks (
      id, title, status, priority, assigned_agent_id, workspace_id, business_id,
      planning_complete, created_at, updated_at
     ) VALUES (?, ?, ?, 'normal', ?, ?, 'default', ?, datetime('now'), ${options.updatedAtExpr || "datetime('now')"})`,
    [
      options.id,
      `Task ${options.id.slice(0, 6)}`,
      options.status || 'in_progress',
      options.agentId,
      options.workspaceId,
      options.planningComplete ?? 1,
    ]
  );
}

function seedSession(agentId: string, taskId: string, status: 'active' | 'ended' = 'active') {
  run(
    `INSERT INTO openclaw_sessions (id, agent_id, task_id, openclaw_session_id, channel, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'mission-control', ?, datetime('now'), datetime('now'))`,
    [crypto.randomUUID(), agentId, taskId, `mission-control-${agentId.slice(0, 8)}`, status]
  );
}

test('checkAgentHealth returns zombie when active task has no active OpenClaw session', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId, 'working');
  seedTask({ id: taskId, workspaceId, agentId, status: 'in_progress' });

  const state = checkAgentHealth(agentId);
  assert.equal(state, 'zombie');
});

test('checkAgentHealth returns stalled when real activity is older than threshold', () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId, 'working');
  seedTask({ id: taskId, workspaceId, agentId, status: 'in_progress' });
  seedSession(agentId, taskId, 'active');
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, 'note', 'real work happened', datetime('now', '-10 minutes'))`,
    [crypto.randomUUID(), taskId, agentId]
  );

  const state = checkAgentHealth(agentId);
  assert.equal(state, 'stalled');
});

test('nudgeAgent ends the active session, reassigns task to assigned, and resets health after successful redispatch', async () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId, 'working');
  seedTask({ id: taskId, workspaceId, agentId, status: 'in_progress' });
  seedSession(agentId, taskId, 'active');
  run(
    `INSERT INTO agent_health (id, agent_id, task_id, health_state, consecutive_stall_checks, updated_at)
     VALUES (?, ?, ?, 'zombie', 3, datetime('now'))`,
    [crypto.randomUUID(), agentId, taskId]
  );

  const originalFetch = global.fetch;
  global.fetch = async () => new Response('{}', { status: 200 });

  try {
    const result = await nudgeAgent(agentId);
    assert.equal(result.success, true);

    const task = queryOne<{ status: string; planning_dispatch_error: string | null }>(
      'SELECT status, planning_dispatch_error FROM tasks WHERE id = ?',
      [taskId]
    );
    assert.equal(task?.status, 'assigned');
    assert.equal(task?.planning_dispatch_error, null);

    const endedSession = queryOne<{ status: string; ended_at: string | null }>(
      `SELECT status, ended_at FROM openclaw_sessions WHERE agent_id = ? AND task_id = ? ORDER BY created_at DESC LIMIT 1`,
      [agentId, taskId]
    );
    assert.equal(endedSession?.status, 'ended');
    assert.ok(endedSession?.ended_at);

    const health = queryOne<{ health_state: string; consecutive_stall_checks: number }>(
      'SELECT health_state, consecutive_stall_checks FROM agent_health WHERE agent_id = ?',
      [agentId]
    );
    assert.equal(health?.health_state, 'working');
    assert.equal(health?.consecutive_stall_checks, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runHealthCheckCycle auto-dispatches orphaned assigned tasks older than threshold', async () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId, 'standby');
  seedTask({
    id: taskId,
    workspaceId,
    agentId,
    status: 'assigned',
    planningComplete: 1,
    updatedAtExpr: "datetime('now', '-3 minutes')",
  });

  let dispatchedUrl = '';
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    dispatchedUrl = String(input);
    return new Response('{}', { status: 200 });
  };

  try {
    await runHealthCheckCycle();
    assert.match(dispatchedUrl, new RegExp(`/api/tasks/${taskId}/dispatch$`));

    const activity = queryOne<{ message: string }>(
      `SELECT message FROM task_activities WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );
    assert.match(activity?.message || '', /Auto-dispatched by health sweeper/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runHealthCheckCycle can await auto-nudge redispatch for zombie agents', async () => {
  const workspaceId = `ws-${crypto.randomUUID()}`;
  const agentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  seedWorkspace(workspaceId);
  seedAgent(agentId, workspaceId, 'working');
  seedTask({ id: taskId, workspaceId, agentId, status: 'in_progress' });
  run(
    `INSERT INTO agent_health (id, agent_id, task_id, health_state, consecutive_stall_checks, updated_at)
     VALUES (?, ?, ?, 'zombie', 2, datetime('now'))`,
    [crypto.randomUUID(), agentId, taskId]
  );

  const dispatchedUrls: string[] = [];
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = String(input);
    dispatchedUrls.push(url);
    if (url.endsWith(`/api/tasks/${taskId}/dispatch`)) {
      run(`UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?`, [taskId]);
    }
    return new Response('{}', { status: 200 });
  };

  try {
    await runHealthCheckCycle({ awaitNudges: true });

    assert.ok(dispatchedUrls.some(url => url.endsWith(`/api/tasks/${taskId}/dispatch`)));
    const task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'in_progress');

    const health = queryOne<{ health_state: string; consecutive_stall_checks: number }>(
      'SELECT health_state, consecutive_stall_checks FROM agent_health WHERE agent_id = ?',
      [agentId]
    );
    assert.equal(health?.health_state, 'working');
    assert.equal(health?.consecutive_stall_checks, 0);

    const activity = queryOne<{ message: string }>(
      `SELECT message FROM task_activities
       WHERE task_id = ? AND message = 'Agent nudged — re-dispatching with checkpoint context'
       ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );
    assert.equal(activity?.message, 'Agent nudged — re-dispatching with checkpoint context');
  } finally {
    global.fetch = originalFetch;
  }
});
