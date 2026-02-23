import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { v4 as uuid } from 'uuid';
import { CreateDependencySchema } from '@/lib/validation';
import { broadcast } from '@/lib/events';
import type { TaskDependency } from '@/lib/types';

// GET /api/tasks/dependencies?workspace_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspace_id');

  let sql = `
    SELECT td.* FROM task_dependencies td
    JOIN tasks t1 ON td.source_task_id = t1.id
    JOIN tasks t2 ON td.target_task_id = t2.id
  `;
  const params: string[] = [];

  if (workspaceId) {
    sql += ` WHERE t1.workspace_id = ? AND t2.workspace_id = ?`;
    params.push(workspaceId, workspaceId);
  }

  sql += ` ORDER BY td.created_at DESC`;

  const deps = queryAll<TaskDependency>(sql, params);
  return NextResponse.json(deps);
}

// POST /api/tasks/dependencies
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateDependencySchema.parse(body);

    // Validate both tasks exist
    const sourceTask = queryOne<{ id: string }>('SELECT id FROM tasks WHERE id = ?', [parsed.source_task_id]);
    const targetTask = queryOne<{ id: string }>('SELECT id FROM tasks WHERE id = ?', [parsed.target_task_id]);

    if (!sourceTask || !targetTask) {
      return NextResponse.json({ error: 'One or both tasks not found' }, { status: 404 });
    }

    // Prevent self-dependency
    if (parsed.source_task_id === parsed.target_task_id) {
      return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 });
    }

    // Check for existing dependency
    const existing = queryOne(
      'SELECT id FROM task_dependencies WHERE source_task_id = ? AND target_task_id = ?',
      [parsed.source_task_id, parsed.target_task_id]
    );
    if (existing) {
      return NextResponse.json({ error: 'Dependency already exists' }, { status: 409 });
    }

    const id = uuid();
    run(
      'INSERT INTO task_dependencies (id, source_task_id, target_task_id, dependency_type) VALUES (?, ?, ?, ?)',
      [id, parsed.source_task_id, parsed.target_task_id, parsed.dependency_type || 'blocks']
    );

    const dep = queryOne<TaskDependency>('SELECT * FROM task_dependencies WHERE id = ?', [id]);

    if (dep) {
      broadcast({ type: 'dependency_created', payload: dep });
    }

    return NextResponse.json(dep, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
    }
    console.error('[API] Failed to create dependency:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/tasks/dependencies?id=xxx
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Dependency ID required' }, { status: 400 });
  }

  const existing = queryOne<TaskDependency>('SELECT * FROM task_dependencies WHERE id = ?', [id]);
  if (!existing) {
    return NextResponse.json({ error: 'Dependency not found' }, { status: 404 });
  }

  run('DELETE FROM task_dependencies WHERE id = ?', [id]);

  broadcast({ type: 'dependency_removed', payload: { id } });

  return NextResponse.json({ success: true });
}
