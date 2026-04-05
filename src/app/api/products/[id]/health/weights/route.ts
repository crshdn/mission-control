import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { updateWeights } from '@/lib/autopilot/health-score';
import { getProduct } from '@/lib/autopilot/products';

/**
 * PUT /api/products/[id]/health/weights
 * Update per-product weight configuration and trigger recalculation.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = getProduct(id);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const body = await req.json();

    // Validate weights
    const validComponents = ['research', 'pipeline', 'swipe', 'build', 'cost'];
    for (const key of validComponents) {
      if (body[key] !== undefined) {
        const val = Number(body[key]);
        if (isNaN(val) || val < 0 || val > 100) {
          return NextResponse.json(
            { error: `Weight '${key}' must be 0-100` },
            { status: 400 }
          );
        }
      }
    }

    if (body.disabled && !Array.isArray(body.disabled)) {
      return NextResponse.json(
        { error: 'disabled must be an array of component names' },
        { status: 400 }
      );
    }

    const updated = updateWeights(id, body);
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('[API] Update weights error:', error);
    return NextResponse.json(
      { error: 'Failed to update weights' },
      { status: 500 }
    );
  }
}
