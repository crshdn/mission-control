export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getProductInsights } from '@/lib/session-insights';

// GET /api/products/[id]/insights — aggregate product-level analytics
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const product = queryOne<{ id: string }>('SELECT id FROM products WHERE id = ?', [id]);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const insights = getProductInsights(id);
  return NextResponse.json(insights);
}
