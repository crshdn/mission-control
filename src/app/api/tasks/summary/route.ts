import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { Task } from '@/lib/types';

// GET /api/tasks/summary
// Authoritative status summary with counts AND itemised lists.
// Counts are derived from the same data as lists — they cannot drift.
// Consumers should check `reconciled: true` before trusting numeric counts.
export async function GET() {
  try {
    const tasks = queryAll<Task & { assigned_agent_name?: string }>(
      `SELECT t.id, t.title, t.status, t.priority, t.task_type, t.qc_status, t.assigned_agent_id,
              aa.name as assigned_agent_name
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       ORDER BY t.created_at DESC`,
      []
    );

    // Build itemised lists per status
    const byStatus: Record<string, Array<{ id: string; title: string; agent: string | null; task_type: Task['task_type'] | null; qc_status: Task['qc_status'] | null }>> = {};
    for (const task of tasks) {
      const s = task.status || 'unknown';
      if (!byStatus[s]) byStatus[s] = [];
      byStatus[s].push({
        id: task.id,
        title: task.title,
        agent: (task as Task & { assigned_agent_name?: string }).assigned_agent_name ?? null,
        task_type: task.task_type ?? null,
        qc_status: task.qc_status ?? null,
      });
    }

    // Counts derived from the same lists — cannot mismatch
    const counts: Record<string, number> = {};
    for (const [status, items] of Object.entries(byStatus)) {
      counts[status] = items.length;
    }

    const total = tasks.length;

    // Reconciliation check: verify counts match list lengths (they always should
    // when derived from the same source, but we validate defensively)
    const mismatches: Array<{ status: string; count_says: number; list_has: number }> = [];
    for (const [status, count] of Object.entries(counts)) {
      const listed = byStatus[status]?.length ?? 0;
      if (listed !== count) {
        mismatches.push({ status, count_says: count, list_has: listed });
      }
    }
    const reconciled = mismatches.length === 0;

    return NextResponse.json({
      total,
      counts,
      by_status: byStatus,
      reconciled,
      mismatches,
      source: 'api',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to generate tasks summary:', error);
    return NextResponse.json({ error: 'Failed to generate tasks summary' }, { status: 500 });
  }
}
