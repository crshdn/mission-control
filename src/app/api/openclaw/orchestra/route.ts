import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface OrchestraStatusResponse {
  hasOtherOrchestrators: boolean;
  orchestratorCount: number;
  workspaceId?: string;
  orchestrators?: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
  }>;
}

/**
 * GET /api/openclaw/orchestra
 *
 * Checks if there are other orchestrators (master agents) available in the project/workspace.
 * Returns true if there are additional master agents beyond the default one.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';

    // Get all master agents in the workspace
    const orchestrators = queryAll<{
      id: string;
      name: string;
      role: string;
      status: string;
    }>(
      `SELECT id, name, role, status
       FROM agents
       WHERE is_master = 1
       AND workspace_id = ?
       AND status != 'offline'
       ORDER BY created_at ASC`,
      [workspaceId]
    );

    // Exclude the default (first-created) master agent from the count
    const additionalOrchestrators = orchestrators.slice(1);
    const hasOtherOrchestrators = additionalOrchestrators.length > 0;

    return NextResponse.json<OrchestraStatusResponse>({
      hasOtherOrchestrators,
      orchestratorCount: additionalOrchestrators.length,
      workspaceId,
      orchestrators: additionalOrchestrators,
    });
  } catch (error) {
    console.error('Failed to check orchestra status:', error);
    return NextResponse.json<OrchestraStatusResponse>(
      {
        hasOtherOrchestrators: false,
        orchestratorCount: 0,
      },
      { status: 500 }
    );
  }
}
