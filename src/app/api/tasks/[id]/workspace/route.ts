import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import {
  createTaskWorkspace,
  getWorkspaceStatus,
  mergeWorkspace,
  cleanupWorkspace,
  triggerWorkspaceMerge,
} from '@/lib/workspace-isolation';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tasks/[id]/workspace — Get workspace status
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const status = await getWorkspaceStatus(task);
    return NextResponse.json(status);
  } catch (error) {
    logger.error('Failed to get workspace status:', error);
    return NextResponse.json({ error: 'Failed to get workspace status' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/workspace — Create workspace or trigger action
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action || 'create';

    switch (action) {
      case 'create': {
        if (task.workspace_path) {
          return NextResponse.json({ error: 'Workspace already exists', path: task.workspace_path }, { status: 409 });
        }
        const workspace = await createTaskWorkspace(task);
        return NextResponse.json({
          success: true,
          workspacePath: workspace.path,
          strategy: workspace.strategy,
          branch: workspace.branch,
          port: workspace.port,
          baseCommit: workspace.baseCommit,
        }, { status: 201 });
      }

      case 'merge': {
        if (!task.workspace_path) {
          return NextResponse.json({ error: 'No workspace to merge' }, { status: 400 });
        }
        const force = (body as { force?: boolean }).force || false;
        const createPR = (body as { createPR?: boolean }).createPR !== false;
        const result = await mergeWorkspace(task, { force, createPR });
        return NextResponse.json(result);
      }

      case 'cleanup': {
        if (!task.workspace_path) {
          return NextResponse.json({ error: 'No workspace to clean up' }, { status: 400 });
        }
        const cleaned = cleanupWorkspace(task);
        return NextResponse.json({ success: cleaned });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    logger.error('Workspace operation failed:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
