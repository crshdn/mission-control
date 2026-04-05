import { logger } from '@/lib/logger';
/**
 * POST /api/products/[id]/rollback — Manual rollback trigger
 * Body: { pr_url: string, commit_sha: string, reason?: string, task_id?: string }
 *
 * PATCH /api/products/[id]/rollback — Acknowledge rollback & restore automation tier
 * Body: { rollback_id: string, restore_tier?: 'semi_auto' | 'full_auto' }
 *
 * GET /api/products/[id]/rollback — List rollback history for this product
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import {
  executeRollback,
  acknowledgeRollback,
  listRollbackHistory,
  getUnacknowledgedRollbacks,
  updateProductSettings,
  getProductSettings,
  stopMonitor,
} from '@/lib/rollback';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — List rollback history for product
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const history = listRollbackHistory(id);
    const unacknowledged = getUnacknowledgedRollbacks(id);

    return NextResponse.json({
      rollbacks: history,
      total: history.length,
      unacknowledged: unacknowledged.length,
      currentTier: getProductSettings(product).automation_tier || null,
    });
  } catch (err) {
    logger.error('[API] Failed to list product rollbacks:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list rollbacks' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Manual rollback trigger
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const body = await request.json();
    const { pr_url, commit_sha, reason, task_id } = body;

    if (!pr_url || !commit_sha) {
      return NextResponse.json(
        { error: 'Missing required fields: pr_url, commit_sha' },
        { status: 400 }
      );
    }

    // Stop any active monitor for this product
    stopMonitor(id);

    const result = await executeRollback({
      productId: id,
      taskId: task_id,
      triggerType: 'manual',
      triggerDetails: reason || 'Manual rollback triggered via API',
      mergedPrUrl: pr_url,
      mergedCommitSha: commit_sha,
    });

    return NextResponse.json({
      success: true,
      rollbackId: result.rollbackId,
      revertPrUrl: result.revertPrUrl,
      revertSuccess: result.success,
    }, { status: 201 });
  } catch (err) {
    logger.error('[API] Failed to trigger rollback:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to trigger rollback' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — Acknowledge rollback & optionally restore automation tier
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const body = await request.json();
    const { rollback_id, restore_tier } = body;

    if (!rollback_id) {
      return NextResponse.json(
        { error: 'Missing required field: rollback_id' },
        { status: 400 }
      );
    }

    // Acknowledge the rollback
    acknowledgeRollback(rollback_id, 'user');

    // Optionally restore automation tier
    if (restore_tier && ['supervised', 'semi_auto', 'full_auto'].includes(restore_tier)) {
      updateProductSettings(id, { automation_tier: restore_tier });
    }

    return NextResponse.json({
      success: true,
      acknowledged: rollback_id,
      restoredTier: restore_tier || null,
    });
  } catch (err) {
    logger.error('[API] Failed to acknowledge rollback:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to acknowledge rollback' },
      { status: 500 }
    );
  }
}
