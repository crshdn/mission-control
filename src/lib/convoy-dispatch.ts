import { getDispatchableSubtasks, updateConvoyProgress } from '@/lib/convoy';
import { getMissionControlUrl } from '@/lib/config';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import { pickDynamicAgent } from '@/lib/task-governance';
import type { Task, Convoy } from '@/lib/types';

const MAX_PARALLEL = 5;

export interface ConvoyDispatchAttemptResult {
  taskId: string;
  success: boolean;
  reason: 'dispatched' | 'dispatch_failed' | 'claim_lost' | 'no_agent';
  error?: string;
}

export interface ConvoyDispatchBatchResult {
  dispatched: number;
  total: number;
  results: ConvoyDispatchAttemptResult[];
  message?: string;
}

interface ClaimedConvoySubtask {
  taskId: string;
  agentId: string;
}

function getDispatchHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.MC_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.MC_API_TOKEN}`;
  }
  return headers;
}

function getAvailableConvoySlots(convoyId: string): number {
  const currentlyActive = queryAll<{ id: string }>(
    `SELECT t.id FROM convoy_subtasks cs JOIN tasks t ON cs.task_id = t.id
     WHERE cs.convoy_id = ? AND t.status IN ('assigned', 'in_progress', 'testing', 'verification')`,
    [convoyId]
  ).length;

  return Math.max(0, MAX_PARALLEL - currentlyActive);
}

function claimReadySubtask(taskId: string): ClaimedConvoySubtask | null {
  return transaction(() => {
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task || task.status !== 'inbox') {
      return null;
    }

    let agentId = task.assigned_agent_id;
    if (!agentId) {
      const picked = pickDynamicAgent(taskId, 'builder');
      if (picked) {
        agentId = picked.id;
      }
    }

    if (!agentId) {
      return null;
    }

    const claimed = run(
      `UPDATE tasks
       SET assigned_agent_id = ?, status = 'assigned', planning_dispatch_error = NULL, updated_at = datetime('now')
       WHERE id = ? AND status = 'inbox'`,
      [agentId, taskId]
    );

    if (claimed.changes === 0) {
      return null;
    }

    return { taskId, agentId };
  });
}

function recordDispatchFailure(taskId: string, agentId: string, error: string): void {
  const now = new Date().toISOString();
  const reverted = run(
    `UPDATE tasks
     SET status = 'inbox', planning_dispatch_error = ?, updated_at = ?
     WHERE id = ? AND status = 'assigned'`,
    [error, now, taskId]
  );

  if (reverted.changes === 0) {
    return;
  }

  run(
    `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      'task_status_changed',
      agentId,
      taskId,
      `Convoy dispatch failed; subtask returned to inbox: ${error}`,
      now,
    ]
  );

  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      taskId,
      agentId,
      'status_changed',
      `Convoy dispatch failed; subtask returned to inbox: ${error}`,
      now,
    ]
  );
}

async function dispatchClaimedSubtask(taskId: string, headers: Record<string, string>): Promise<ConvoyDispatchAttemptResult> {
  const claimed = claimReadySubtask(taskId);
  if (!claimed) {
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    return {
      taskId,
      success: false,
      reason: task?.status === 'inbox' ? 'no_agent' : 'claim_lost',
      ...(task?.status === 'inbox' ? { error: 'No agent available' } : {}),
    };
  }

  try {
    const res = await fetch(`${getMissionControlUrl()}/api/tasks/${taskId}/dispatch`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (res.ok) {
      return { taskId, success: true, reason: 'dispatched' };
    }

    const errorText = await res.text().catch(() => 'unknown');
    const error = `Dispatch request failed (${res.status}): ${errorText}`;
    recordDispatchFailure(taskId, claimed.agentId, error);
    return { taskId, success: false, reason: 'dispatch_failed', error };
  } catch (err) {
    const error = `Dispatch error: ${err instanceof Error ? err.message : String(err)}`;
    recordDispatchFailure(taskId, claimed.agentId, error);
    return { taskId, success: false, reason: 'dispatch_failed', error };
  }
}

/**
 * Dispatch ready subtasks for an active convoy.
 * Called from: task PATCH (subtask completion), agent-completion webhook, SSE heartbeat sweep.
 */
export async function dispatchReadyConvoySubtasks(convoyId: string): Promise<ConvoyDispatchBatchResult> {
  const convoy = queryOne<Convoy>('SELECT * FROM convoys WHERE id = ?', [convoyId]);
  if (!convoy || convoy.status !== 'active') {
    return { dispatched: 0, total: 0, results: [], message: 'Convoy is not active' };
  }

  const allDispatchable = getDispatchableSubtasks(convoyId);
  if (allDispatchable.length === 0) {
    return { dispatched: 0, total: 0, results: [], message: 'No sub-tasks ready for dispatch' };
  }

  const slots = getAvailableConvoySlots(convoyId);
  if (slots === 0) {
    return { dispatched: 0, total: 0, results: [], message: `Max parallel limit reached (${MAX_PARALLEL} active)` };
  }

  const dispatchable = allDispatchable.slice(0, slots);
  const headers = getDispatchHeaders();
  const results: ConvoyDispatchAttemptResult[] = [];

  for (const subtask of dispatchable) {
    results.push(await dispatchClaimedSubtask(subtask.task_id, headers));
  }

  updateConvoyProgress(convoyId);

  return {
    dispatched: results.filter((result) => result.success).length,
    total: dispatchable.length,
    results,
  };
}

/**
 * Sweep all active convoys and dispatch any ready subtasks.
 * Called from SSE heartbeat alongside health checks.
 */
export async function sweepActiveConvoys(): Promise<void> {
  const activeConvoys = queryAll<Convoy>(
    'SELECT * FROM convoys WHERE status = \'active\'',
    []
  );

  for (const convoy of activeConvoys) {
    try {
      const result = await dispatchReadyConvoySubtasks(convoy.id);
      if (result.dispatched > 0) {
        console.log(`[ConvoyDispatch] Swept convoy ${convoy.id}: dispatched ${result.dispatched} subtasks`);
      }
    } catch (err) {
      console.error(`[ConvoyDispatch] Sweep failed for convoy ${convoy.id}:`, err);
    }
  }
}
