import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSwipeHistory } from '@/lib/autopilot/swipe';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const history = getSwipeHistory(id, limit);
    return NextResponse.json(history);
  } catch (error) {
    logger.error('Failed to fetch swipe history:', error);
    return NextResponse.json({ error: 'Failed to fetch swipe history' }, { status: 500 });
  }
}
