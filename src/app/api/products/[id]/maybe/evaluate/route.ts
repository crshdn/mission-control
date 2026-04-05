import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { evaluateMaybePool } from '@/lib/autopilot/maybe-pool';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = evaluateMaybePool(id);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Failed to evaluate maybe pool:', error);
    return NextResponse.json({ error: 'Failed to evaluate maybe pool' }, { status: 500 });
  }
}
