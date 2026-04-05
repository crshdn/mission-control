import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { backfillEmbeddings } from '@/lib/autopilot/similarity';
import { queryAll, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products/:id/similarity — Get similarity stats for a product
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const totalIdeas = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM ideas WHERE product_id = ?',
      [id]
    )?.count || 0;

    const totalEmbeddings = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM idea_embeddings WHERE product_id = ?',
      [id]
    )?.count || 0;

    const flaggedIdeas = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM ideas WHERE product_id = ? AND similarity_flag IS NOT NULL',
      [id]
    )?.count || 0;

    const suppressedIdeas = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM idea_suppressions WHERE product_id = ?',
      [id]
    )?.count || 0;

    const recentSuppressions = queryAll<{
      id: string;
      suppressed_title: string;
      similarity_score: number;
      reason: string;
      created_at: string;
    }>(
      'SELECT id, suppressed_title, similarity_score, reason, created_at FROM idea_suppressions WHERE product_id = ? ORDER BY created_at DESC LIMIT 10',
      [id]
    );

    return NextResponse.json({
      totalIdeas,
      totalEmbeddings,
      embeddingCoverage: totalIdeas > 0 ? Math.round((totalEmbeddings / totalIdeas) * 100) : 0,
      flaggedIdeas,
      suppressedIdeas,
      recentSuppressions,
    });
  } catch (error) {
    logger.error('Failed to fetch similarity stats:', error);
    return NextResponse.json({ error: 'Failed to fetch similarity stats' }, { status: 500 });
  }
}

/**
 * POST /api/products/:id/similarity — Backfill embeddings for existing ideas
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const count = backfillEmbeddings(id);
    return NextResponse.json({ backfilled: count, message: `Backfilled ${count} idea embeddings` });
  } catch (error) {
    logger.error('Failed to backfill embeddings:', error);
    return NextResponse.json({ error: 'Failed to backfill embeddings' }, { status: 500 });
  }
}
