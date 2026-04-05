import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { cancelTest } from '@/lib/autopilot/ab-testing';

export const dynamic = 'force-dynamic';

/** PATCH /api/products/:id/ab-tests/:testId/cancel — Cancel an active test */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const { testId } = await params;

    const result = cancelTest(testId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(result.test);
  } catch (error) {
    logger.error('Failed to cancel A/B test:', error);
    return NextResponse.json({ error: 'Failed to cancel A/B test' }, { status: 500 });
  }
}
