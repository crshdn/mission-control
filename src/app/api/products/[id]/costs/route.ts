import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getProductCosts } from '@/lib/costs/tracker';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const costs = getProductCosts(id);
    return NextResponse.json(costs);
  } catch (error) {
    logger.error('Failed to fetch product costs:', error);
    return NextResponse.json({ error: 'Failed to fetch product costs' }, { status: 500 });
  }
}
