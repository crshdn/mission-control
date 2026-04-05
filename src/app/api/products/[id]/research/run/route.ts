import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { runResearchCycle } from '@/lib/autopilot/research';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // If chainIdeation is true, ideation runs automatically after research completes
    let chainIdeation = false;
    try {
      const body = await request.json();
      chainIdeation = body.chainIdeation === true;
    } catch {
      // No body or invalid JSON — default to false
    }

    const cycleId = await runResearchCycle(id, undefined, chainIdeation);
    return NextResponse.json({ cycle_id: cycleId }, { status: 202 });
  } catch (error) {
    logger.error('Failed to start research cycle:', error);
    const message = error instanceof Error ? error.message : 'Failed to start research cycle';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
