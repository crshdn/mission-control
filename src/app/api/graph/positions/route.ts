import { NextRequest, NextResponse } from 'next/server';
import { queryAll, run, transaction } from '@/lib/db';
import { v4 as uuid } from 'uuid';
import { BatchUpdatePositionsSchema } from '@/lib/validation';
import type { GraphNodePosition } from '@/lib/types';

// GET /api/graph/positions?workspace_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspace_id');

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 });
  }

  const positions = queryAll<GraphNodePosition>(
    'SELECT * FROM graph_node_positions WHERE workspace_id = ?',
    [workspaceId]
  );

  // Convert pinned integer to boolean
  const mapped = positions.map(p => ({
    ...p,
    pinned: Boolean(p.pinned),
  }));

  return NextResponse.json(mapped);
}

// PUT /api/graph/positions - batch update positions
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BatchUpdatePositionsSchema.parse(body);

    transaction(() => {
      for (const pos of parsed.positions) {
        // Upsert: insert or replace
        run(
          `INSERT INTO graph_node_positions (id, workspace_id, node_type, node_id, x, y, pinned, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(workspace_id, node_type, node_id)
           DO UPDATE SET x = ?, y = ?, pinned = ?, updated_at = datetime('now')`,
          [
            uuid(),
            pos.workspace_id,
            pos.node_type,
            pos.node_id,
            pos.x,
            pos.y,
            pos.pinned ? 1 : 0,
            pos.x,
            pos.y,
            pos.pinned ? 1 : 0,
          ]
        );
      }
    });

    return NextResponse.json({ success: true, count: parsed.positions.length });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
    }
    console.error('[API] Failed to update positions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
