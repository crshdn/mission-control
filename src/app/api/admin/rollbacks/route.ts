import { logger } from '@/lib/logger';
/**
 * GET  /api/admin/rollbacks — List rollback history (optionally filtered by product)
 */

import { NextRequest, NextResponse } from 'next/server';
import { listRollbackHistory, getUnacknowledgedRollbacks, getActiveMonitors } from '@/lib/rollback';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id') || undefined;
    const unacknowledgedOnly = searchParams.get('unacknowledged') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const history = unacknowledgedOnly
      ? getUnacknowledgedRollbacks(productId)
      : listRollbackHistory(productId, limit);

    return NextResponse.json({
      rollbacks: history,
      total: history.length,
      activeMonitors: getActiveMonitors(),
    });
  } catch (err) {
    logger.error('[API] Failed to list rollbacks:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list rollbacks' },
      { status: 500 }
    );
  }
}
