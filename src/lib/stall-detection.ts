import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { sendMail } from '@/lib/mailbox';
import { logTaskActivity } from '@/lib/activity-log';
import { saveCheckpointThrottled } from '@/lib/checkpoint';
import { logDebugEvent } from '@/lib/debug-log';
import type { Task } from '@/lib/types';

// Active statuses that can go stale. Kept in sync with
// src/lib/task-governance.ts — not imported so this module remains a thin
// leaf dependency; a drift test in Phase 9 pins the list.
const ACTIVE_STATUSES = ['assigned', 'in_progress', 'convoy_active', 'testing', 'review', 'verification'] as const;

/** Default threshold. Override via STALL_DETECTION_MINUTES env var. */
const DEFAULT_STALL_MINUTES = 30;

/** Consider the coordinator itself stalled if its last heartbeat is older than this. */
const COORDINATOR_STALL_MINUTES = 10;

/** Don't re-notify for the same stall within this window. */
const NOTIFY_THROTTLE_MINUTES = 60;

export interface StallReport {
  scanned: number;
  flagged: Array<{
    task_id: string;
    title: string;
    status: string;
    minutes_idle: number;
    mode: 'convoy' | 'solo';
    notified: 'coordinator' | 'webhook' | 'coordinator_stalled' | 'coordinator_missing' | 'throttled' | 'none';
  }>;
}

function getThresholdMinutes(): number {
  const raw = process.env.STALL_DETECTION_MINUTES;
  if (!raw) return DEFAULT_STALL_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALL_MINUTES;
}

/**
 * Stall scanner. Flags tasks in an active status whose last typed activity
 * is older than the threshold AND which have no deliverables. Notifies via
 * the convoy coordinator (if this is a convoy sub-task) or via webhook.
 *
 * Called from `runHealthCheckCycle` in agent-health.ts and also available
 * as a manual trigger at POST /api/tasks/scan-stalls.
 *
 * This function must be idempotent: calling it repeatedly within
 * NOTIFY_THROTTLE_MINUTES should not re-flag or re-notify the same task.
 */
export async function scanStalledTasks(): Promise<StallReport> {
  const thresholdMinutes = getThresholdMinutes();

  // Join with the max activity timestamp so we rank by freshness. Anything
  // older than the threshold AND with zero deliverables is a candidate.
  // `task_activities` is the source of truth — it's task-scoped so convoy
  // members writing to it count toward the parent's freshness.
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
  const candidates = queryAll<Task & { last_activity_at: string | null; deliverable_count: number }>(
    `SELECT
       t.*,
       (SELECT MAX(created_at) FROM task_activities WHERE task_id = t.id) as last_activity_at,
       (SELECT COUNT(*) FROM task_deliverables WHERE task_id = t.id) as deliverable_count
     FROM tasks t
     WHERE t.status IN (${placeholders})`,
    [...ACTIVE_STATUSES]
  );

  const report: StallReport = { scanned: candidates.length, flagged: [] };
  const nowMs = Date.now();

  for (const task of candidates) {
    if (task.deliverable_count > 0) continue;

    const lastTick = task.last_activity_at || task.updated_at;
    const minutesIdle = (nowMs - new Date(lastTick).getTime()) / 60000;
    if (minutesIdle < thresholdMinutes) continue;

    // Skip if we already raced through and flagged this task recently. The
    // coordinator may be mid-handoff, or a nudge may be in-flight — both
    // show up as a fresh `status_changed` activity which would bump
    // `last_activity_at` above. Defense in depth: also skip if we already
    // wrote a stall_detected row within the throttle window.
    const lastDetected = queryOne<{ created_at: string }>(
      `SELECT created_at FROM task_activities
       WHERE task_id = ? AND activity_type = 'stall_detected'
       ORDER BY created_at DESC LIMIT 1`,
      [task.id]
    );
    const alreadyFlagged = lastDetected
      && (nowMs - new Date(lastDetected.created_at).getTime()) / 60000 < NOTIFY_THROTTLE_MINUTES;

    // 1. Mark the task. status_reason is cleared by Phase 3.5
    //    (recovery-guard) when the coordinator does anything real.
    if (!alreadyFlagged) {
      run(
        `UPDATE tasks SET status_reason = ?, updated_at = ? WHERE id = ?`,
        [
          `stalled_no_activity (idle ${Math.round(minutesIdle)}m, detected ${new Date().toISOString()})`,
          new Date().toISOString(),
          task.id,
        ]
      );
      logTaskActivity({
        taskId: task.id,
        type: 'stall_detected',
        message: `Task idle for ${Math.round(minutesIdle)}m with no deliverables`,
        metadata: { minutes_idle: Math.round(minutesIdle), threshold: thresholdMinutes },
      });

      logDebugEvent({
        type: 'stall.flagged',
        direction: 'internal',
        taskId: task.id,
        agentId: task.assigned_agent_id,
        metadata: {
          minutes_idle: Math.round(minutesIdle),
          threshold_minutes: thresholdMinutes,
          task_status: task.status,
        },
      });

      // Snapshot a checkpoint so a subsequent /checkpoint/restore has
      // something to resume from. Throttled at 300s (same as the scan
      // cadence floor) to avoid piling rows on re-flagged tasks.
      if (task.assigned_agent_id) {
        try {
          saveCheckpointThrottled(
            {
              taskId: task.id,
              agentId: task.assigned_agent_id,
              checkpointType: 'auto',
              stateSummary: `Stall snapshot — idle ${Math.round(minutesIdle)}m in ${task.status}`,
              contextData: {
                minutes_idle: Math.round(minutesIdle),
                status_at_snapshot: task.status,
                detected_at: new Date().toISOString(),
              },
            },
            300
          );
        } catch (err) {
          console.warn('[Stall] saveCheckpoint on stall_detected failed:', err);
        }
      }
    }

    // 2. Decide who to notify.
    const convoyMembership = resolveConvoyMembership(task);
    const notifyDecision = alreadyFlagged
      ? 'throttled' as const
      : await notifyForStall(task, convoyMembership, minutesIdle);

    report.flagged.push({
      task_id: task.id,
      title: task.title,
      status: task.status,
      minutes_idle: Math.round(minutesIdle),
      mode: convoyMembership ? 'convoy' : 'solo',
      notified: notifyDecision,
    });
  }

  return report;
}

interface ConvoyMembership {
  convoyId: string;
  parentTaskId: string;
  coordinatorAgentId: string | null;
}

/**
 * Resolve the convoy this task belongs to, if any. Three shapes to handle:
 *   (a) task is a convoy sub-task  → tasks.convoy_id + convoy_subtasks row
 *   (b) task is a convoy parent    → convoys.parent_task_id = task.id
 *   (c) neither                    → null (solo task, webhook path)
 * In every convoy case, the "coordinator" is the agent assigned to the
 * convoy's parent task. The schema doesn't model a separate coordinator,
 * so we synthesize it here — see src/lib/convoy.ts for the idiom.
 */
function resolveConvoyMembership(task: Task): ConvoyMembership | null {
  // Case (b): this task IS the convoy parent
  const convoyAsParent = queryOne<{ id: string }>(
    'SELECT id FROM convoys WHERE parent_task_id = ?',
    [task.id]
  );
  if (convoyAsParent) {
    return {
      convoyId: convoyAsParent.id,
      parentTaskId: task.id,
      coordinatorAgentId: task.assigned_agent_id || null,
    };
  }

  // Case (a): this task is a convoy sub-task
  if (task.convoy_id) {
    const convoy = queryOne<{ id: string; parent_task_id: string }>(
      'SELECT id, parent_task_id FROM convoys WHERE id = ?',
      [task.convoy_id]
    );
    if (convoy) {
      const parent = queryOne<{ assigned_agent_id: string | null }>(
        'SELECT assigned_agent_id FROM tasks WHERE id = ?',
        [convoy.parent_task_id]
      );
      return {
        convoyId: convoy.id,
        parentTaskId: convoy.parent_task_id,
        coordinatorAgentId: parent?.assigned_agent_id || null,
      };
    }
  }

  return null;
}

async function notifyForStall(
  task: Task,
  convoy: ConvoyMembership | null,
  minutesIdle: number
): Promise<StallReport['flagged'][number]['notified']> {
  if (!convoy) {
    await fireWebhook(task, minutesIdle);
    logTaskActivity({
      taskId: task.id,
      type: 'stall_notified',
      message: `Notified via webhook (solo task)`,
    });
    return 'webhook';
  }

  // Convoy path. Coordinator may be missing (agent deleted) or itself
  // stalled (its own most-recent activity older than COORDINATOR_STALL_MINUTES).
  if (!convoy.coordinatorAgentId) {
    logTaskActivity({
      taskId: task.id,
      type: 'coordinator_missing',
      message: `Convoy ${convoy.convoyId} has no assigned coordinator — falling back to webhook`,
    });
    await fireWebhook(task, minutesIdle);
    return 'coordinator_missing';
  }

  const coordinatorLast = queryOne<{ last_activity_at: string }>(
    `SELECT MAX(created_at) as last_activity_at FROM task_activities
     WHERE agent_id = ?`,
    [convoy.coordinatorAgentId]
  );
  const coordinatorIdleMinutes = coordinatorLast?.last_activity_at
    ? (Date.now() - new Date(coordinatorLast.last_activity_at).getTime()) / 60000
    : Infinity;

  if (coordinatorIdleMinutes > COORDINATOR_STALL_MINUTES) {
    logTaskActivity({
      taskId: task.id,
      type: 'coordinator_stalled',
      message: `Coordinator ${convoy.coordinatorAgentId} also stalled (${Math.round(coordinatorIdleMinutes)}m idle) — escalating via webhook`,
    });
    await fireWebhook(task, minutesIdle);
    return 'coordinator_stalled';
  }

  // Send mail. sendMail requires a from_agent_id — we use the task's
  // originally-assigned agent as the nominal "from" (the agent that
  // stalled), falling back to the coordinator itself (self-message) so
  // the FK check doesn't fail when the stalled task never had an assignee.
  const fromAgentId = task.assigned_agent_id || convoy.coordinatorAgentId;
  try {
    sendMail({
      convoyId: convoy.convoyId,
      fromAgentId,
      toAgentId: convoy.coordinatorAgentId,
      subject: `Stall on "${task.title}"`,
      body: [
        `Sub-task ${task.id} has been idle for ${Math.round(minutesIdle)} minutes in status "${task.status}".`,
        `No deliverables registered. You can:`,
        `- Revise the spec and re-dispatch via POST /api/tasks/${task.id}/dispatch`,
        `- Reassign to another agent via PATCH /api/tasks/${task.id}`,
        `- Cancel via POST /api/tasks/${task.id}/admin/release-stall`,
      ].join('\n'),
    });
    logTaskActivity({
      taskId: task.id,
      type: 'stall_notified',
      message: `Notified coordinator (agent ${convoy.coordinatorAgentId})`,
      metadata: { convoy_id: convoy.convoyId, coordinator_agent_id: convoy.coordinatorAgentId },
    });
    return 'coordinator';
  } catch (err) {
    // sendMail throws if the convoy vanished between the SELECT above and
    // here — extremely rare but possible. Fall back to webhook so the
    // operator still gets a signal.
    console.warn('[Stall] Coordinator sendMail failed, falling back to webhook:', err);
    await fireWebhook(task, minutesIdle);
    return 'webhook';
  }
}

async function fireWebhook(task: Task, minutesIdle: number): Promise<void> {
  const url = process.env.MC_STALL_WEBHOOK_URL;
  if (!url) return;

  const payload = {
    text: `🚨 Stalled task: "${task.title}" (${task.id}) idle ${Math.round(minutesIdle)}m in status "${task.status}"`,
    task_id: task.id,
    title: task.title,
    status: task.status,
    minutes_idle: Math.round(minutesIdle),
    assigned_agent_id: task.assigned_agent_id || null,
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    // Webhook failures are best-effort — a failing webhook shouldn't block
    // the rest of the scan from processing other stalled tasks.
    console.warn('[Stall] Webhook POST failed:', (err as Error).message);
  }
}

/**
 * Called by dispatch / reassign / plan-revision paths to clear the
 * stalled flag when the coordinator (or an operator) takes a real action.
 * Without this the next scan would re-flag the same task and re-notify.
 */
export function clearStallFlag(taskId: string): void {
  const task = queryOne<{ status_reason: string | null }>(
    'SELECT status_reason FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!task?.status_reason?.startsWith('stalled_')) return;

  run(
    `UPDATE tasks SET status_reason = NULL, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), taskId]
  );
  logTaskActivity({
    taskId,
    type: 'stall_recovered',
    message: 'Stall cleared by subsequent action (dispatch / reassign / mail from coordinator)',
  });

  logDebugEvent({
    type: 'stall.cleared',
    direction: 'internal',
    taskId,
    metadata: { prior_status_reason: task.status_reason },
  });
}
