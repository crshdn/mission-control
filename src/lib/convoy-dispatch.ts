import { getDispatchableSubtasks, updateConvoyProgress } from '@/lib/convoy';
import { getMissionControlUrl } from '@/lib/config';
import { queryOne, queryAll, run } from '@/lib/db';
import { pickDynamicAgent } from '@/lib/task-governance';
import type { Task, Convoy } from '@/lib/types';

const MAX_PARALLEL = 5;

/**
 * Dispatch ready subtasks for an active convoy.
 * Called from: task PATCH (subtask completion), agent-completion webhook, SSE heartbeat sweep.
 */
export async function dispatchReadyConvoySubtasks(convoyId: string): Promise<{ dispatched: number }> {
  const convoy = queryOne<Convoy>('SELECT * FROM convoys WHERE id = ?', [convoyId]);
  if (!convoy || convoy.status !== 'active') return { dispatched: 0 };

  const allDispatchable = getDispatchableSubtasks(convoyId);
  if (allDispatchable.length === 0) return { dispatched: 0 };

  const currentlyActive = queryAll<{ id: string }>(
    `SELECT t.id FROM convoy_subtasks cs JOIN tasks t ON cs.task_id = t.id
     WHERE cs.convoy_id = ? AND t.status IN ('assigned', 'in_progress', 'testing', 'verification')`,
    [convoyId]
  ).length;
  const slots = Math.max(0, MAX_PARALLEL - currentlyActive);
  const dispatchable = allDispatchable.slice(0, slots);
  if (dispatchable.length === 0) return { dispatched: 0 };

  const missionControlUrl = getMissionControlUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.MC_API_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.MC_API_TOKEN}`;
  }

  let dispatched = 0;

  for (const subtask of dispatchable) {
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [subtask.task_id]);
    if (!task) continue;

    // Auto-assign agent if not assigned
    let agentId = task.assigned_agent_id;
    if (!agentId) {
      const picked = pickDynamicAgent(subtask.task_id, 'builder');
      if (picked) {
        agentId = picked.id;
        run('UPDATE tasks SET assigned_agent_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [agentId, subtask.task_id]);
      }
    }

    if (!agentId) {
      console.warn(`[ConvoyDispatch] No agent available for subtask ${subtask.task_id}`);
      continue;
    }

    // Move to assigned to trigger dispatch
    run('UPDATE tasks SET status = \'assigned\', updated_at = datetime(\'now\') WHERE id = ?', [subtask.task_id]);

    try {
      const res = await fetch(`${missionControlUrl}/api/tasks/${subtask.task_id}/dispatch`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        dispatched++;
      } else {
        const errorText = await res.text().catch(() => 'unknown');
        console.error(`[ConvoyDispatch] Dispatch failed for subtask ${subtask.task_id}: ${errorText}`);
      }
    } catch (err) {
      console.error(`[ConvoyDispatch] Dispatch error for subtask ${subtask.task_id}:`, err);
    }
  }

  updateConvoyProgress(convoyId);
  return { dispatched };
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
