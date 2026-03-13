import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workspaces/[id]/workflows
 * List workflow templates for the given workspace, including global default templates.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;

  try {
    const templates = queryAll<{
      id: string; workspace_id: string; name: string; description: string;
      stages: string; fail_targets: string; is_default: number;
      created_at: string; updated_at: string;
    }>(
      `SELECT * FROM workflow_templates
       WHERE workspace_id = ? OR workspace_id = 'default'
       ORDER BY is_default DESC, name ASC`,
      [workspaceId]
    );

    const parsed = templates.map(t => ({
      ...t,
      stages: JSON.parse(t.stages || '[]'),
      fail_targets: JSON.parse(t.fail_targets || '{}'),
      is_default: Boolean(t.is_default),
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Failed to fetch workflow templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/**
 * POST /api/workspaces/[id]/workflows
 * Create a new workflow template
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;

  try {
    const body = await request.json();
    const { name, description, stages, fail_targets, is_default } = body;

    if (!name || !stages || !Array.isArray(stages) || stages.length === 0) {
      return NextResponse.json(
        { error: 'name and stages (non-empty array) are required' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // If this is the default, unset other defaults in the workspace
    if (is_default) {
      run(
        'UPDATE workflow_templates SET is_default = 0 WHERE workspace_id = ?',
        [workspaceId]
      );
    }

    run(
      `INSERT INTO workflow_templates (id, workspace_id, name, description, stages, fail_targets, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, workspaceId, name, description || null, JSON.stringify(stages), JSON.stringify(fail_targets || {}), is_default ? 1 : 0, now, now]
    );

    const template = queryOne(
      'SELECT * FROM workflow_templates WHERE id = ?',
      [id]
    );

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Failed to create workflow template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
