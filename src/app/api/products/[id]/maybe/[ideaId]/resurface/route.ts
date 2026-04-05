import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { resurfaceIdea } from '@/lib/autopilot/maybe-pool';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ideaId: string }> }
) {
  try {
    const { ideaId } = await params;
    const body = await request.json().catch(() => ({}));
    const idea = resurfaceIdea(ideaId, body.reason);
    return NextResponse.json(idea);
  } catch (error) {
    logger.error('Failed to resurface idea:', error);
    const message = error instanceof Error ? error.message : 'Failed to resurface idea';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
