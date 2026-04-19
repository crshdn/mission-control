import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';

/**
 * Typed server-side activity types. NONE of these satisfy the evidence gate
 * at src/lib/task-governance.ts:hasStageEvidence — that gate deliberately
 * accepts only ('completed','file_created','updated') and this module must
 * not broaden it. These types exist for visibility, audit, and stall
 * detection — they fill in the gap where agent heartbeats used to land as
 * `activity_type = null`.
 */
export type ServerActivityType =
  | 'heartbeat'        // throttled proof-of-life from runHealthCheckCycle
  | 'dispatched'       // reserved; dispatch/route.ts still uses status_changed
  | 'admin_release'    // written by /admin/release-stall
  | 'stall_detected'   // stall scanner flags a deadlocked task
  | 'stall_notified'   // stall scanner messaged coordinator / webhook
  | 'stall_recovered'  // coordinator / dispatch clears a stall flag
  | 'coordinator_stalled'   // convoy coordinator itself can't be reached
  | 'coordinator_missing';  // convoy has no live coordinator

interface LogActivityInput {
  taskId: string;
  type: ServerActivityType;
  message: string;
  agentId?: string | null;
  metadata?: Record<string, unknown>;
}

export function logTaskActivity(input: LogActivityInput): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.taskId,
      input.agentId ?? null,
      input.type,
      input.message,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
    ]
  );
  return id;
}

/**
 * Log an activity row only if the most recent activity of the same type for
 * this task is older than `thresholdSeconds`. Keeps high-frequency signals
 * (heartbeats, re-scans) from flooding the activity feed.
 *
 * Returns the new activity id, or null if throttled.
 */
export function logTaskActivityThrottled(
  input: LogActivityInput,
  thresholdSeconds: number
): string | null {
  const latest = queryOne<{ created_at: string }>(
    `SELECT created_at FROM task_activities
     WHERE task_id = ? AND activity_type = ?
     ORDER BY created_at DESC LIMIT 1`,
    [input.taskId, input.type]
  );
  if (latest) {
    const ageSeconds = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
    if (ageSeconds < thresholdSeconds) return null;
  }
  return logTaskActivity(input);
}
