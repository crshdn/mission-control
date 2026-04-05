import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSwipeDeck } from '@/lib/autopilot/swipe';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deck = getSwipeDeck(id);
    return NextResponse.json(deck);
  } catch (error) {
    logger.error('Failed to fetch swipe deck:', error);
    return NextResponse.json({ error: 'Failed to fetch swipe deck' }, { status: 500 });
  }
}
