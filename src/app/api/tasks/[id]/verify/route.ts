/**
 * Task Verification API
 * Endpoint for marking a task as verified
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/[id]/verify
 * Mark a task as verified
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const body = await request.json();
    const { agent_id } = body;

    const db = getDb();

    // Check if task exists
    const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
    if (!existingTask) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    // Update task with verification fields
    db.prepare(`
      UPDATE tasks 
      SET is_verified = 1, 
          verified_at = ?,
          verified_by = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, agent_id, now, taskId);

    // Get updated task
    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;

    // Log activity
    const activityId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO task_activities (id, task_id, agent_id, activity_type, message)
      VALUES (?, ?, ?, 'completed', 'Task verified by Claude Code')
    `).run(activityId, taskId, agent_id || null);

    // Broadcast SSE event
    broadcast({
      type: 'task_updated',
      payload: updatedTask,
    });

    return NextResponse.json(updatedTask, { status: 201 });
  } catch (error) {
    console.error('Error verifying task:', error);
    return NextResponse.json(
      { error: 'Failed to verify task' },
      { status: 500 }
    );
  }
}
