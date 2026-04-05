import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { concludeTest } from '@/lib/autopilot/ab-testing';

export const dynamic = 'force-dynamic';

/** PATCH /api/products/:id/ab-tests/:testId/conclude — Conclude a test with a winner */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const { id, testId } = await params;
    const body = await request.json();

    if (!body.winner_variant_id || typeof body.winner_variant_id !== 'string') {
      return NextResponse.json({ error: 'winner_variant_id is required' }, { status: 400 });
    }

    const result = concludeTest(testId, body.winner_variant_id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(result.test);
  } catch (error) {
    logger.error('Failed to conclude A/B test:', error);
    return NextResponse.json({ error: 'Failed to conclude A/B test' }, { status: 500 });
  }
}
