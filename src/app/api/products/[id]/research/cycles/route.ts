import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getResearchCycles } from '@/lib/autopilot/research';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cycles = getResearchCycles(id);
    return NextResponse.json(cycles);
  } catch (error) {
    logger.error('Failed to fetch research cycles:', error);
    return NextResponse.json({ error: 'Failed to fetch research cycles' }, { status: 500 });
  }
}
