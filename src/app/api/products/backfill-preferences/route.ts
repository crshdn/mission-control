import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { backfillAllPreferences } from '@/lib/autopilot/preferences';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const count = backfillAllPreferences();
    return NextResponse.json({ rebuilt: count });
  } catch (error) {
    logger.error('Failed to backfill preferences:', error);
    return NextResponse.json({ error: 'Failed to backfill' }, { status: 500 });
  }
}
