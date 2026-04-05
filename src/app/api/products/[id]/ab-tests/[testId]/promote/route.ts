import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { promoteWinner, analyzeWinnerDelta } from '@/lib/autopilot/ab-testing';

export const dynamic = 'force-dynamic';

/** POST /api/products/:id/ab-tests/:testId/promote — Promote winner to primary program */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const { testId } = await params;

    const result = promoteWinner(testId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    // Generate learning engine analysis
    const analysis = analyzeWinnerDelta(testId);

    return NextResponse.json({
      success: true,
      message: 'Winner promoted to primary Product Program',
      analysis,
    });
  } catch (error) {
    logger.error('Failed to promote winner:', error);
    return NextResponse.json({ error: 'Failed to promote winner' }, { status: 500 });
  }
}
