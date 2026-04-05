import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/[id]/read — Mark task chat as read
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: taskId } = await params;
    const userId = 'operator'; // Single-user for now
    const now = new Date().toISOString();

    // Upsert the read timestamp
    const existing = queryOne<{ id: string }>(
      'SELECT id FROM user_task_reads WHERE user_id = ? AND task_id = ?',
      [userId, taskId]
    );

    if (existing) {
      run(
        'UPDATE user_task_reads SET last_read_at = ? WHERE id = ?',
        [now, existing.id]
      );
    } else {
      run(
        'INSERT INTO user_task_reads (id, user_id, task_id, last_read_at) VALUES (?, ?, ?, ?)',
        [uuidv4(), userId, taskId, now]
      );
    }

    return NextResponse.json({ success: true, last_read_at: now });
  } catch (error) {
    logger.error('Failed to mark task as read:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
