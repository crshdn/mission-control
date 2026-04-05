import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface UnreadCount {
  task_id: string;
  task_title: string;
  task_status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_role: string | null;
  assigned_agent_name: string | null;
  assigned_agent_emoji: string | null;
}

// GET /api/tasks/unread — Get unread message counts for all tasks with chat activity
export async function GET(request: NextRequest) {
  try {
    const userId = 'operator';
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');

    let sql = `
      SELECT 
        t.id as task_id,
        t.title as task_title,
        t.status as task_status,
        COUNT(CASE 
          WHEN utr.last_read_at IS NULL THEN 1
          WHEN tn.created_at > utr.last_read_at THEN 1
          ELSE NULL
        END) as unread_count,
        MAX(tn.created_at) as last_message_at,
        a.name as assigned_agent_name,
        a.avatar_emoji as assigned_agent_emoji
      FROM tasks t
      INNER JOIN task_notes tn ON tn.task_id = t.id
      LEFT JOIN user_task_reads utr ON utr.task_id = t.id AND utr.user_id = ?
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.status != 'done'
    `;
    const params: unknown[] = [userId];

    if (workspaceId) {
      sql += ' AND t.workspace_id = ?';
      params.push(workspaceId);
    }

    sql += ' GROUP BY t.id ORDER BY MAX(tn.created_at) DESC';

    const results = queryAll<UnreadCount>(sql, params);

    // Get last message preview for each task
    const enriched = results.map(row => {
      const lastNote = queryAll<{ content: string; role: string }>(
        'SELECT content, role FROM task_notes WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
        [row.task_id]
      );
      return {
        ...row,
        last_message_preview: lastNote[0]?.content?.slice(0, 120) || null,
        last_message_role: lastNote[0]?.role || null,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    logger.error('Failed to fetch unread counts:', error);
    return NextResponse.json({ error: 'Failed to fetch unread counts' }, { status: 500 });
  }
}
