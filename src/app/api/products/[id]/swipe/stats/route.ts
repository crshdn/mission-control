import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSwipeStats } from '@/lib/autopilot/swipe';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const stats = getSwipeStats(id);
    return NextResponse.json(stats);
  } catch (error) {
    logger.error('Failed to fetch swipe stats:', error);
    return NextResponse.json({ error: 'Failed to fetch swipe stats' }, { status: 500 });
  }
}
