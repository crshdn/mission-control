import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createCostCap, listCostCaps } from '@/lib/costs/caps';
import { CreateCostCapSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';
    const productId = searchParams.get('product_id') || undefined;
    const caps = listCostCaps(workspaceId, productId);
    return NextResponse.json(caps);
  } catch (error) {
    logger.error('Failed to list cost caps:', error);
    return NextResponse.json({ error: 'Failed to list cost caps' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CreateCostCapSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const cap = createCostCap(validation.data);
    return NextResponse.json(cap, { status: 201 });
  } catch (error) {
    logger.error('Failed to create cost cap:', error);
    return NextResponse.json({ error: 'Failed to create cost cap' }, { status: 500 });
  }
}
