import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { ReleaseStallSchema } from '@/lib/validation';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/[id]/admin/release-stall
 *
 * Admin escape hatch for stalled tasks that cannot clear the evidence gate.
 * Terminates the task (default: cancelled), ends all OpenClaw sessions for
 * the task and — if this is a convoy parent — for every convoy sub-task too,
 * unassigns the agent, and writes audit trail to both task_activities and
 * events.
 *
 * Auth: relies on the middleware bearer-token check (same as other admin
 * endpoints — see src/middleware.ts). No additional role logic.
 *
 * Body:
 *   reason:           required, 1..500 chars
 *   terminal_state:   'cancelled' (default) | 'done'
 *   released_by:      optional audit string (operator name, token hint, etc)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const validation = ReleaseStallSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { reason, terminal_state = 'cancelled', released_by } = validation.data;

    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const statusReason = `released_by_admin: ${reason}`;

    // If this task is a convoy parent, collect sub-task ids so we can end
    // sessions for every convoy member, not just the primary assignee.
    const convoy = queryOne<{ id: string }>(
      'SELECT id FROM convoys WHERE parent_task_id = ?',
      [taskId]
    );
    const convoySubtaskIds = convoy
      ? queryAll<{ task_id: string }>(
          'SELECT task_id FROM convoy_subtasks WHERE convoy_id = ?',
          [convoy.id]
        ).map(r => r.task_id)
      : [];
    const sessionTaskIds = [taskId, ...convoySubtaskIds];

    transaction(() => {
      // 1. End all active OpenClaw sessions bound to this task or any
      //    convoy sub-task. Matches the session-end shape used by
      //    nudgeAgent() in src/lib/agent-health.ts.
      const placeholders = sessionTaskIds.map(() => '?').join(',');
      run(
        `UPDATE openclaw_sessions
         SET status = 'ended', ended_at = ?, updated_at = ?
         WHERE task_id IN (${placeholders}) AND status = 'active'`,
        [now, now, ...sessionTaskIds]
      );

      // 2. Flip the parent task to the terminal state. Clear the assignee
      //    so the ex-agent can pick up other work via the standby sweep.
      run(
        `UPDATE tasks
         SET status = ?, status_reason = ?, assigned_agent_id = NULL,
             planning_dispatch_error = NULL, updated_at = ?
         WHERE id = ?`,
        [terminal_state, statusReason, now, taskId]
      );

      // 3. Audit row inside the task so it shows up in the Activity tab.
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, 'admin_release', ?, ?)`,
        [
          uuidv4(),
          taskId,
          existing.assigned_agent_id || null,
          `Admin release-stall → ${terminal_state}: ${reason}${released_by ? ` (by ${released_by})` : ''}`,
          now,
        ]
      );

      // 4. System-level audit event. Mirrors the shape used by
      //    auditBoardOverride() in src/lib/task-governance.ts.
      run(
        `INSERT INTO events (id, type, task_id, message, metadata, created_at)
         VALUES (?, 'system', ?, ?, ?, ?)`,
        [
          uuidv4(),
          taskId,
          `Admin release-stall: ${existing.status} → ${terminal_state}`,
          JSON.stringify({ adminRelease: true, reason, released_by: released_by || null, convoy_dissolved: Boolean(convoy) }),
          now,
        ]
      );

      // 5. If this was a convoy parent, mark the convoy as failed so the
      //    coordinator UI reflects the dissolution. We don't touch the
      //    sub-tasks — they'll be DELETEd / released individually if needed.
      if (convoy) {
        run(
          `UPDATE convoys SET status = 'failed', updated_at = ? WHERE id = ?`,
          [now, convoy.id]
        );
      }

      // 6. Return the previously-assigned agent to standby if they have no
      //    other active work. Same shape as in DELETE + PATCH handlers.
      if (existing.assigned_agent_id) {
        const otherActive = queryOne<{ count: number }>(
          `SELECT COUNT(*) as count FROM tasks
           WHERE assigned_agent_id = ?
             AND status IN ('assigned', 'in_progress', 'testing', 'verification')
             AND id != ?`,
          [existing.assigned_agent_id, taskId]
        );
        if (!otherActive || otherActive.count === 0) {
          run(
            `UPDATE agents SET status = 'standby', updated_at = ?
             WHERE id = ? AND status = 'working'`,
            [now, existing.assigned_agent_id]
          );
        }
      }
    });

    const updated = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (updated) {
      broadcast({ type: 'task_updated', payload: updated });
    }

    return NextResponse.json({
      success: true,
      task: updated,
      previous_status: existing.status,
      sessions_ended: sessionTaskIds.length,
      convoy_dissolved: Boolean(convoy),
    });
  } catch (error) {
    console.error('Failed to release-stall task:', error);
    return NextResponse.json(
      { error: `Failed to release-stall task: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
