import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');

    const db = getDb();
    
    // Get tasks awaiting QC review
    const reviewQueue = db.prepare(`
      SELECT COUNT(*) as count 
      FROM tasks 
      WHERE status = 'review'
      ${workspaceId ? 'AND workspace_id = ?' : ''}
    `).get(workspaceId ? [workspaceId] : []) as { count: number };

    // Get today's QC decisions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const todayDecisions = db.prepare(`
      SELECT 
        SUM(CASE WHEN result LIKE '%APPROVED%' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN result LIKE '%REJECTED%' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN result LIKE '%ESCALAT%' THEN 1 ELSE 0 END) as escalated
      FROM task_activities 
      WHERE activity_type = 'qc_decision' 
      AND created_at >= ?
      ${workspaceId ? 'AND task_id IN (SELECT id FROM tasks WHERE workspace_id = ?)' : ''}
    `).get(workspaceId ? [todayISO, workspaceId] : [todayISO]) as {
      approved: number | null;
      rejected: number | null;
      escalated: number | null;
    };

    // Calculate average review time for completed reviews in last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoISO = weekAgo.toISOString();

    const avgReviewTime = db.prepare(`
      SELECT AVG(
        CASE 
          WHEN completed_at IS NOT NULL AND status_changed_at IS NOT NULL 
          THEN (strftime('%s', completed_at) - strftime('%s', status_changed_at)) / 60.0
          ELSE NULL
        END
      ) as avg_minutes
      FROM tasks 
      WHERE status = 'done' 
      AND completed_at >= ?
      ${workspaceId ? 'AND workspace_id = ?' : ''}
    `).get(workspaceId ? [weekAgoISO, workspaceId] : [weekAgoISO]) as { avg_minutes: number | null };

    return NextResponse.json({
      reviewQueue: reviewQueue.count,
      avgReviewTime: avgReviewTime.avg_minutes || 0,
      approvedToday: todayDecisions.approved || 0,
      rejectedToday: todayDecisions.rejected || 0,
      escalatedToday: todayDecisions.escalated || 0,
    });
  } catch (error) {
    console.error('QC metrics error:', error);
    return NextResponse.json({ error: 'Failed to fetch QC metrics' }, { status: 500 });
  }
}