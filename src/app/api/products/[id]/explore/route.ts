import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { exploreCodebase, type ExplorationDepth } from '@/lib/codebase-explorer';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/products/[id]/explore
 *
 * Triggers a codebase exploration for the product's repo.
 * Returns the exploration snapshot and context document.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (!product.repo_url) {
      return NextResponse.json({ error: 'Product has no repository URL configured' }, { status: 400 });
    }

    let body: { depth?: ExplorationDepth; task_title?: string; task_description?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine — use defaults
    }

    const depth = body.depth || (product.exploration_depth as ExplorationDepth) || 'standard';

    const result = await exploreCodebase(product.id, product.repo_url, {
      defaultBranch: product.default_branch || 'main',
      depth,
      taskTitle: body.task_title,
      taskDescription: body.task_description,
    });

    return NextResponse.json({
      success: true,
      snapshot_id: result.snapshot.id,
      commit_sha: result.snapshot.commit_sha,
      framework: result.snapshot.framework,
      language: result.snapshot.language,
      loc: result.snapshot.loc,
      context_document: result.contextDocument,
    });
  } catch (error) {
    console.error('Failed to explore codebase:', error);
    return NextResponse.json(
      { error: `Codebase exploration failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/products/[id]/explore
 *
 * Returns the most recent exploration snapshot for this product.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const snapshot = queryOne<{
      id: string;
      commit_sha: string;
      framework: string | null;
      language: string | null;
      loc: number | null;
      explored_at: string;
    }>(
      'SELECT id, commit_sha, framework, language, loc, explored_at FROM codebase_snapshots WHERE product_id = ? ORDER BY explored_at DESC LIMIT 1',
      [id]
    );

    if (!snapshot) {
      return NextResponse.json({ error: 'No exploration snapshot found. Trigger one via POST.' }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Failed to get exploration snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
