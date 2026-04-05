import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { IdeationCycle } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cycles = queryAll<IdeationCycle>(
      'SELECT * FROM ideation_cycles WHERE product_id = ? ORDER BY started_at DESC LIMIT 20',
      [id]
    );
    return NextResponse.json(cycles);
  } catch (error) {
    logger.error('Failed to fetch ideation cycles:', error);
    return NextResponse.json({ error: 'Failed to fetch ideation cycles' }, { status: 500 });
  }
}
