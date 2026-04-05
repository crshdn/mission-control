import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getAllProductScores } from '@/lib/autopilot/health-score';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products/health-scores
 * Returns all product health scores as a map { productId: score }.
 */
export async function GET() {
  try {
    const scores = getAllProductScores();
    return NextResponse.json(scores);
  } catch (error) {
    logger.error('[API] Batch health scores error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health scores' },
      { status: 500 }
    );
  }
}
