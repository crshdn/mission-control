import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { startTest, listTests } from '@/lib/autopilot/ab-testing';

export const dynamic = 'force-dynamic';

/** GET /api/products/:id/ab-tests — List all A/B tests for a product */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tests = listTests(id);
    return NextResponse.json(tests);
  } catch (error) {
    logger.error('Failed to list A/B tests:', error);
    return NextResponse.json({ error: 'Failed to list A/B tests' }, { status: 500 });
  }
}

/** POST /api/products/:id/ab-tests — Start a new A/B test */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.variant_a_id || typeof body.variant_a_id !== 'string') {
      return NextResponse.json({ error: 'variant_a_id is required' }, { status: 400 });
    }
    if (!body.variant_b_id || typeof body.variant_b_id !== 'string') {
      return NextResponse.json({ error: 'variant_b_id is required' }, { status: 400 });
    }

    if (body.split_mode && !['concurrent', 'alternating'].includes(body.split_mode)) {
      return NextResponse.json({ error: 'split_mode must be "concurrent" or "alternating"' }, { status: 400 });
    }

    if (body.min_swipes !== undefined && (typeof body.min_swipes !== 'number' || body.min_swipes < 1)) {
      return NextResponse.json({ error: 'min_swipes must be a positive integer' }, { status: 400 });
    }

    const result = startTest({
      product_id: id,
      variant_a_id: body.variant_a_id,
      variant_b_id: body.variant_b_id,
      split_mode: body.split_mode,
      min_swipes: body.min_swipes,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(result.test, { status: 201 });
  } catch (error) {
    logger.error('Failed to start A/B test:', error);
    return NextResponse.json({ error: 'Failed to start A/B test' }, { status: 500 });
  }
}
