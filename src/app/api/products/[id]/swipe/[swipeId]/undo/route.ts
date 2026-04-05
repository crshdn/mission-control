import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { undoSwipe } from '@/lib/autopilot/swipe';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; swipeId: string }> }
) {
  try {
    const { id, swipeId } = await params;
    const result = undoSwipe(id, swipeId);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Failed to undo swipe:', error);
    const message = error instanceof Error ? error.message : 'Failed to undo swipe';
    const status = message.includes('expired') ? 410 : message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
