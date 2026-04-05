import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkspaces } from '@/lib/workspace-isolation';

export const dynamic = 'force-dynamic';

// GET /api/products/[id]/workspaces — List active parallel workspaces
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workspaces = getActiveWorkspaces(id);
    return NextResponse.json({ productId: id, activeWorkspaces: workspaces });
  } catch (error) {
    logger.error('Failed to list product workspaces:', error);
    return NextResponse.json({ error: 'Failed to list workspaces' }, { status: 500 });
  }
}
