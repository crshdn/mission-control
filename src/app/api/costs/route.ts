import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getCostOverview } from '@/lib/costs/reporting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';
    const overview = getCostOverview(workspaceId);
    return NextResponse.json(overview);
  } catch (error) {
    logger.error('Failed to fetch cost overview:', error);
    return NextResponse.json({ error: 'Failed to fetch cost overview' }, { status: 500 });
  }
}
