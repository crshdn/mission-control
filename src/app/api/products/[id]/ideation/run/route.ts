import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { runIdeationCycle } from '@/lib/autopilot/ideation';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const cycleId = body.cycle_id || undefined;
    const ideationId = await runIdeationCycle(id, cycleId);
    return NextResponse.json({ ideation_id: ideationId }, { status: 202 });
  } catch (error) {
    logger.error('Failed to start ideation cycle:', error);
    const message = error instanceof Error ? error.message : 'Failed to start ideation cycle';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
