import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { recordSwipe, getPendingCount } from '@/lib/autopilot/swipe';
import { SwipeActionSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = SwipeActionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const result = recordSwipe(id, validation.data);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Failed to record swipe:', error);
    const message = error instanceof Error ? error.message : 'Failed to record swipe';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const count = getPendingCount(id);
    return NextResponse.json({ pending_count: count });
  } catch (error) {
    logger.error('Failed to get pending count:', error);
    return NextResponse.json({ error: 'Failed to get pending count' }, { status: 500 });
  }
}
