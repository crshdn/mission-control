import { NextRequest, NextResponse } from 'next/server';
import { buildCheckpointContext, getLatestCheckpoint } from '@/lib/checkpoint';
import { getMissionControlUrl } from '@/lib/config';
import { queryOne, run } from '@/lib/db';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/[id]/checkpoint/restore — Restore from checkpoint and re-dispatch
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const checkpoint = getLatestCheckpoint(id);
    if (!checkpoint) {
      return NextResponse.json({ error: 'No checkpoint to restore from' }, { status: 404 });
    }

    const checkpointCtx = buildCheckpointContext(id);
    const now = new Date().toISOString();

    // Append checkpoint context to description
    if (checkpointCtx) {
      const newDesc = (task.description || '') + checkpointCtx;
      run(
        `UPDATE tasks SET description = ?, status = 'assigned', planning_dispatch_error = NULL, updated_at = ? WHERE id = ?`,
        [newDesc, now, id]
      );
    } else {
      run(
        `UPDATE tasks SET status = 'assigned', planning_dispatch_error = NULL, updated_at = ? WHERE id = ?`,
        [now, id]
      );
    }

    // End current sessions
    run(
      `UPDATE openclaw_sessions SET status = 'ended', ended_at = ?, updated_at = ? WHERE task_id = ? AND status = 'active'`,
      [now, now, id]
    );

    // Re-dispatch
    const missionControlUrl = getMissionControlUrl();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.MC_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.MC_API_TOKEN}`;
    }

    const res = await fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json({ error: `Re-dispatch failed: ${errorText}` }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      checkpoint_id: checkpoint.id,
      message: 'Task restored from checkpoint and re-dispatched',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to restore from checkpoint' }, { status: 500 });
  }
}
