import { NextResponse } from 'next/server';
import { queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/tasks/clear — wipe every task from the Mission Control DB.
 * Does NOT touch OpenClaw Gateway state, workspace directories, or agents.
 *
 * Many child tables reference tasks(id) with ON DELETE CASCADE, but several
 * (events, conversations, openclaw_sessions, knowledge_entries, cost_events,
 * agent_health, ideas, content_pieces, skill_reports, product_skills) do
 * not — with FK=ON, a bare DELETE FROM tasks would fail. Clear the
 * non-cascading refs first (nullify where nullable, delete where task-scoped).
 */
export async function DELETE() {
  try {
    const before = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM tasks')?.cnt ?? 0;
    if (before === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    transaction(() => {
      // Task-scoped rows without ON DELETE CASCADE — wipe fully.
      run('DELETE FROM workspace_ports');
      run('DELETE FROM workspace_merges');
      run('DELETE FROM events WHERE task_id IS NOT NULL');
      run('DELETE FROM openclaw_sessions WHERE task_id IS NOT NULL');
      try { run('DELETE FROM skill_reports'); } catch {}
      try { run('DELETE FROM debug_events'); } catch {}

      // Rows that may outlive a task — just null out the FK.
      run('UPDATE conversations SET task_id = NULL WHERE task_id IS NOT NULL');
      run('UPDATE knowledge_entries SET task_id = NULL WHERE task_id IS NOT NULL');
      run('UPDATE agent_health SET task_id = NULL WHERE task_id IS NOT NULL');
      run('UPDATE cost_events SET task_id = NULL WHERE task_id IS NOT NULL');
      try { run('UPDATE ideas SET task_id = NULL WHERE task_id IS NOT NULL'); } catch {}
      try { run('UPDATE content_pieces SET task_id = NULL WHERE task_id IS NOT NULL'); } catch {}
      try { run('UPDATE product_skills SET created_by_task_id = NULL WHERE created_by_task_id IS NOT NULL'); } catch {}

      // Tables with ON DELETE CASCADE (task_roles, task_activities,
      // task_deliverables, planning_questions, planning_specs, task_notes,
      // user_task_reads, checkpoints, task_dependencies, convoys,
      // convoy_subtasks, stall_flags, work_checkpoints) handle themselves.
      run('DELETE FROM tasks');
    });

    broadcast({
      type: 'tasks_cleared',
      payload: { count: before },
    });

    return NextResponse.json({ deleted: before });
  } catch (error) {
    console.error('[DELETE /api/tasks/clear] failed:', error);
    return NextResponse.json(
      { error: `Failed to clear tasks: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
