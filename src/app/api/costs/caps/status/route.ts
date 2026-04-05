import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { checkCaps } from '@/lib/costs/caps';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';
    const productId = searchParams.get('product_id') || undefined;
    const status = checkCaps(workspaceId, productId);
    return NextResponse.json(status);
  } catch (error) {
    logger.error('Failed to check cost caps:', error);
    return NextResponse.json({ error: 'Failed to check cost caps' }, { status: 500 });
  }
}
