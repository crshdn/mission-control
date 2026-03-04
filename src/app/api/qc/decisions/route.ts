import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');
    const limit = parseInt(searchParams.get('limit') || '20');

    const db = getDb();
    
    // Get recent QC decisions from task activities
    const decisions = db.prepare(`
      SELECT 
        a.id,
        a.task_id,
        t.title as task_title,
        CASE 
          WHEN a.message LIKE '%APPROVED%' THEN 'approved'
          WHEN a.message LIKE '%REJECTED%' THEN 'rejected'
          WHEN a.message LIKE '%ESCALAT%' THEN 'escalated'
          ELSE 'unknown'
        END as decision,
        a.message as reason,
        a.created_at as reviewed_at,
        CASE 
          WHEN t.status_changed_at IS NOT NULL 
          THEN (strftime('%s', a.created_at) - strftime('%s', t.status_changed_at)) / 60.0
          ELSE 0
        END as review_time
      FROM task_activities a
      JOIN tasks t ON a.task_id = t.id
      WHERE a.activity_type IN ('qc_decision', 'status_changed')
      AND (a.message LIKE '%APPROVED%' OR a.message LIKE '%REJECTED%' OR a.message LIKE '%ESCALAT%')
      ${workspaceId ? 'AND t.workspace_id = ?' : ''}
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(workspaceId ? [workspaceId, limit] : [limit]);

    return NextResponse.json(decisions);
  } catch (error) {
    console.error('QC decisions error:', error);
    return NextResponse.json({ error: 'Failed to fetch QC decisions' }, { status: 500 });
  }
}