import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';

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
 * Returns true if there are other master agents that could handle tasks
 * instead of going to Charlie.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';

    // Check for other master agents in the workspace
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
       ORDER BY name ASC`,
      [workspaceId]
    );

    // Exclude Charlie (the default master agent) from the count
    const nonCharlieOrchestrators = orchestrators.filter(a => a.name !== 'Charlie');
    const hasOtherOrchestrators = nonCharlieOrchestrators.length > 0;

    return NextResponse.json<OrchestraStatusResponse>({
      hasOtherOrchestrators,
      orchestratorCount: nonCharlieOrchestrators.length,
      workspaceId,
      orchestrators: nonCharlieOrchestrators,
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
