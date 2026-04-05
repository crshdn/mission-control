import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getTest } from '@/lib/autopilot/ab-testing';

export const dynamic = 'force-dynamic';

/** GET /api/products/:id/ab-tests/:testId — Get a single A/B test */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const { id, testId } = await params;
    const test = getTest(testId);
    if (!test || test.product_id !== id) {
      return NextResponse.json({ error: 'A/B test not found' }, { status: 404 });
    }
    return NextResponse.json(test);
  } catch (error) {
    logger.error('Failed to get A/B test:', error);
    return NextResponse.json({ error: 'Failed to get A/B test' }, { status: 500 });
  }
}
