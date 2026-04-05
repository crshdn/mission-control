import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getCostBreakdown, getPerFeatureStats } from '@/lib/costs/reporting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';
    const breakdown = getCostBreakdown(workspaceId);
    const perFeature = getPerFeatureStats(workspaceId);
    return NextResponse.json({ ...breakdown, per_feature: perFeature });
  } catch (error) {
    logger.error('Failed to fetch cost breakdown:', error);
    return NextResponse.json({ error: 'Failed to fetch cost breakdown' }, { status: 500 });
  }
}
