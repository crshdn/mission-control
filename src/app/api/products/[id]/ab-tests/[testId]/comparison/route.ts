import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getTestComparison } from '@/lib/autopilot/ab-testing';

export const dynamic = 'force-dynamic';

/** GET /api/products/:id/ab-tests/:testId/comparison — Get comparison metrics */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const { id, testId } = await params;
    const comparison = getTestComparison(testId);
    if (!comparison || comparison.test.product_id !== id) {
      return NextResponse.json({ error: 'A/B test not found' }, { status: 404 });
    }
    return NextResponse.json(comparison);
  } catch (error) {
    logger.error('Failed to get A/B test comparison:', error);
    return NextResponse.json({ error: 'Failed to get comparison' }, { status: 500 });
  }
}
