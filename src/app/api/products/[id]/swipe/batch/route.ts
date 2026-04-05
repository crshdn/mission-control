import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { batchSwipe } from '@/lib/autopilot/swipe';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BatchSwipeSchema = z.object({
  actions: z.array(z.object({
    idea_id: z.string().min(1),
    action: z.enum(['approve', 'reject', 'maybe', 'fire']),
    notes: z.string().max(2000).optional(),
  })).min(1).max(200),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = BatchSwipeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }

    const results = batchSwipe(id, validation.data.actions);
    return NextResponse.json({
      processed: results.length,
      results: results.map(r => ({
        idea_id: r.idea_id,
        action: r.action,
        idea: r.idea,
        task: r.task,
        swipeId: r.swipeId,
      })),
    });
  } catch (error) {
    logger.error('Failed to process batch swipe:', error);
    const message = error instanceof Error ? error.message : 'Failed to process batch swipe';
    // If a concurrent session conflict, return 409
    const status = message.includes('not in pending status') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
