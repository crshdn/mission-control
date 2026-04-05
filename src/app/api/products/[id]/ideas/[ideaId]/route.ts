import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { updateIdea } from '@/lib/autopilot/ideation';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ideaId: string }> }
) {
  try {
    const { ideaId } = await params;
    const body = await request.json();
    const idea = updateIdea(ideaId, body);
    if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    return NextResponse.json(idea);
  } catch (error) {
    logger.error('Failed to update idea:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
}
