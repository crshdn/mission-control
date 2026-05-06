import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
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

    // Get QC decisions for different time periods
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    const getDecisions = (since: string) => db.prepare(`
      SELECT 
        SUM(CASE WHEN message LIKE '%APPROVED%' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN message LIKE '%REJECTED%' OR message LIKE '%REVISION_NEEDED%' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN message LIKE '%ESCALAT%' THEN 1 ELSE 0 END) as escalated
      FROM task_activities 
      WHERE activity_type = 'qc_decision' 
      AND created_at >= ?
      ${workspaceId ? 'AND task_id IN (SELECT id FROM tasks WHERE workspace_id = ?)' : ''}
    `).get(workspaceId ? [since, workspaceId] : [since]) as {
      approved: number | null;
      rejected: number | null;
      escalated: number | null;
    };

    const todayDecisions = getDecisions(todayISO);
    const weekDecisions = getDecisions(sevenDaysAgoISO);
    const monthDecisions = getDecisions(thirtyDaysAgoISO);

    // Calculate average review time for completed reviews in last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoISO = weekAgo.toISOString();

    const avgReviewTime = db.prepare(`
      SELECT AVG(
        CASE 
          WHEN updated_at IS NOT NULL AND created_at IS NOT NULL 
          THEN (strftime('%s', updated_at) - strftime('%s', created_at)) / 60.0
          ELSE NULL
        END
      ) as avg_minutes
      FROM tasks 
      WHERE status = 'done' 
      AND updated_at >= ?
      ${workspaceId ? 'AND workspace_id = ?' : ''}
    `).get(workspaceId ? [weekAgoISO, workspaceId] : [weekAgoISO]) as { avg_minutes: number | null };

    return NextResponse.json({
      reviewQueue: reviewQueue.count,
      avgReviewTime: avgReviewTime.avg_minutes || 0,
      // Today
      approvedToday: todayDecisions.approved || 0,
      rejectedToday: todayDecisions.rejected || 0,
      escalatedToday: todayDecisions.escalated || 0,
      // Last 7 days
      approvedWeek: weekDecisions.approved || 0,
      rejectedWeek: weekDecisions.rejected || 0,
      escalatedWeek: weekDecisions.escalated || 0,
      // Last 30 days
      approvedMonth: monthDecisions.approved || 0,
      rejectedMonth: monthDecisions.rejected || 0,
      escalatedMonth: monthDecisions.escalated || 0,
    });
  } catch (error) {
    console.error('QC metrics error:', error);
    return NextResponse.json({ error: 'Failed to fetch QC metrics' }, { status: 500 });
  }
}