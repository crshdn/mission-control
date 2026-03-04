import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');

    const db = getDb();
    
    // Get rejection patterns from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Extract common rejection reasons
    const rejections = db.prepare(`
      SELECT 
        a.message,
        COUNT(*) as count
      FROM task_activities a
      JOIN tasks t ON a.task_id = t.id
      WHERE a.activity_type IN ('qc_decision', 'status_changed')
      AND a.message LIKE '%REJECTED%'
      AND a.created_at >= ?
      ${workspaceId ? 'AND t.workspace_id = ?' : ''}
      GROUP BY a.message
      ORDER BY count DESC
      LIMIT 10
    `).all(workspaceId ? [thirtyDaysAgoISO, workspaceId] : [thirtyDaysAgoISO]) as Array<{
      message: string;
      count: number;
    }>;

    // Calculate total rejections for percentage calculation
    const totalRejections = rejections.reduce((sum, r) => sum + r.count, 0);

    // Extract readable rejection reasons and calculate percentages
    const patterns = rejections.map(rejection => {
      // Extract reason from message (simple pattern matching)
      let reason = rejection.message;
      
      // Common patterns to extract
      if (reason.includes('emoji')) reason = 'Contains emoji';
      else if (reason.includes('incomplete')) reason = 'Incomplete work';
      else if (reason.includes('placeholder')) reason = 'Placeholder content';
      else if (reason.includes('not working')) reason = 'Functionality broken';
      else if (reason.includes('missing')) reason = 'Missing requirements';
      else if (reason.includes('error')) reason = 'Contains errors';
      else if (reason.includes('test')) reason = 'Failed testing';
      else reason = 'Other quality issues';

      return {
        reason,
        count: rejection.count,
        percentage: totalRejections > 0 ? Math.round((rejection.count / totalRejections) * 100) : 0,
      };
    });

    // Merge similar patterns
    const mergedPatterns = patterns.reduce((acc, pattern) => {
      const existing = acc.find(p => p.reason === pattern.reason);
      if (existing) {
        existing.count += pattern.count;
        existing.percentage = totalRejections > 0 ? Math.round((existing.count / totalRejections) * 100) : 0;
      } else {
        acc.push(pattern);
      }
      return acc;
    }, [] as Array<{ reason: string; count: number; percentage: number }>);

    // Sort by count and limit to top 5
    mergedPatterns.sort((a, b) => b.count - a.count);
    const topPatterns = mergedPatterns.slice(0, 5);

    return NextResponse.json(topPatterns);
  } catch (error) {
    console.error('QC patterns error:', error);
    return NextResponse.json({ error: 'Failed to fetch QC patterns' }, { status: 500 });
  }
}