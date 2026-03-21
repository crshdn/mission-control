import { NextRequest, NextResponse } from 'next/server';
import { getConvoy, getDispatchableSubtasks, updateConvoyProgress } from '@/lib/convoy';
import { getMissionControlUrl } from '@/lib/config';
import { queryOne, queryAll, run } from '@/lib/db';
import { pickDynamicAgent } from '@/lib/task-governance';
import { formatMailForDispatch } from '@/lib/mailbox';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/[id]/convoy/dispatch — Dispatch all ready sub-tasks
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const convoy = getConvoy(id);

    if (!convoy) {
      return NextResponse.json({ error: 'No convoy found for this task' }, { status: 404 });
    }

    if (convoy.status !== 'active') {
      return NextResponse.json({ error: `Convoy is ${convoy.status}, cannot dispatch` }, { status: 400 });
    }

    const allDispatchable = getDispatchableSubtasks(convoy.id);

    if (allDispatchable.length === 0) {
      return NextResponse.json({ dispatched: 0, message: 'No sub-tasks ready for dispatch' });
    }

    // Respect max parallel agents limit (default 5)
    const MAX_PARALLEL = 5;
    const currentlyActive = queryAll<{ id: string }>(
      `SELECT t.id FROM convoy_subtasks cs JOIN tasks t ON cs.task_id = t.id
       WHERE cs.convoy_id = ? AND t.status IN ('assigned', 'in_progress', 'testing', 'verification')`,
      [convoy.id]
    ).length;
    const slots = Math.max(0, MAX_PARALLEL - currentlyActive);
    const dispatchable = allDispatchable.slice(0, slots);

    if (dispatchable.length === 0) {
      return NextResponse.json({ dispatched: 0, message: `Max parallel limit reached (${MAX_PARALLEL} active)` });
    }

    const missionControlUrl = getMissionControlUrl();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.MC_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.MC_API_TOKEN}`;
    }

    const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

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
        results.push({ taskId: subtask.task_id, success: false, error: 'No agent available' });
        continue;
      }

      // Move to assigned status to trigger dispatch
      run('UPDATE tasks SET status = \'assigned\', updated_at = datetime(\'now\') WHERE id = ?', [subtask.task_id]);

      try {
        const res = await fetch(`${missionControlUrl}/api/tasks/${subtask.task_id}/dispatch`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          results.push({ taskId: subtask.task_id, success: true });
        } else {
          const errorText = await res.text();
          results.push({ taskId: subtask.task_id, success: false, error: errorText });
        }
      } catch (err) {
        results.push({ taskId: subtask.task_id, success: false, error: (err as Error).message });
      }
    }

    // Update convoy progress
    updateConvoyProgress(convoy.id);

    const dispatched = results.filter(r => r.success).length;
    return NextResponse.json({
      dispatched,
      total: dispatchable.length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to dispatch convoy' }, { status: 500 });
  }
}
