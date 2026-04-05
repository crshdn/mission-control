import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getMaybePool } from '@/lib/autopilot/maybe-pool';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = getMaybePool(id);
    return NextResponse.json(pool);
  } catch (error) {
    logger.error('Failed to fetch maybe pool:', error);
    return NextResponse.json({ error: 'Failed to fetch maybe pool' }, { status: 500 });
  }
}
