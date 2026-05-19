import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { broadcast } from '@/lib/events';
import { queryAll, queryOne, run } from '@/lib/db';
import type { Task } from '@/lib/types';
import { postToHyperagentWithRetry } from '@/lib/hyperagent';

export const dynamic = 'force-dynamic';

type SyncRequest = {
  mode?: 'full' | 'task';
  task_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SyncRequest;
    const now = new Date().toISOString();
    const syncMode = body.mode || (body.task_id ? 'task' : 'full');

    let tasks: Task[] = [];
    if (syncMode === 'task') {
      if (!body.task_id) {
        return NextResponse.json({ error: 'task_id is required for task mode' }, { status: 400 });
      }

      const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [body.task_id]);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      tasks = [task];
    } else {
      tasks = queryAll<Task>(
        `SELECT * FROM tasks
         WHERE status IN ('inbox', 'assigned', 'in_progress', 'testing', 'review')
         ORDER BY updated_at DESC
         LIMIT 200`
      );
    }

    // This route is the outbound handoff point.
    // If HYPERAGENT_SYNC_ENDPOINT is configured, operators can wire this payload
    // into a queue worker or HTTP bridge that pushes into Hyperagent.
    const payload = {
      source: 'mission-control',
      synced_at: now,
      mode: syncMode,
      count: tasks.length,
      tasks
    };

    const delivery = await postToHyperagentWithRetry(payload);

    run(
      `INSERT INTO events (id, type, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'system',
        delivery.delivered
          ? `Hyperagent sync delivered (${syncMode}, ${tasks.length} task${tasks.length === 1 ? '' : 's'})`
          : `Hyperagent sync queued (${syncMode}, ${tasks.length} task${tasks.length === 1 ? '' : 's'})`,
        JSON.stringify({
          source: 'hyperagent',
          sync_mode: syncMode,
          task_count: tasks.length,
          endpoint: process.env.HYPERAGENT_SYNC_ENDPOINT || null,
          delivery
        }),
        now
      ]
    );

    broadcast({
      type: 'hyperagent_sync_queued',
        payload: {
          mode: syncMode,
          count: tasks.length
        }
      });

    return NextResponse.json(
      {
        success: true,
        mode: syncMode,
        count: tasks.length,
        endpoint_configured: Boolean(process.env.HYPERAGENT_SYNC_ENDPOINT),
        delivery,
        payload
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[Hyperagent sync] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
