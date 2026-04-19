import { NextRequest, NextResponse } from 'next/server';
import { scanStalledTasks } from '@/lib/stall-detection';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/scan-stalls
 *
 * Manual trigger for the stall scanner. The scanner also runs automatically
 * every 2 minutes as part of runHealthCheckCycle (invoked from the SSE
 * stream while at least one client is connected). Use this endpoint when
 * you want an immediate pass — e.g. from an external cron, or when
 * debugging a stuck task.
 *
 * Response:
 *   {
 *     scanned: number,
 *     flagged: Array<{ task_id, title, status, minutes_idle, mode, notified }>
 *   }
 */
export async function POST(_request: NextRequest) {
  try {
    const report = await scanStalledTasks();
    return NextResponse.json(report);
  } catch (error) {
    console.error('[ScanStalls] failed:', error);
    return NextResponse.json(
      { error: `Stall scan failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
