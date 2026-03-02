import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run, getDb } from '@/lib/db';
import { triggerAutoDispatch } from '@/lib/auto-dispatch';

export const dynamic = 'force-dynamic';
/**
 * POST /api/tasks/[id]/planning/retry-dispatch
 * 
 * Retries the auto-dispatch for a completed planning task
 * This endpoint allows users to retry failed dispatches from the UI
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    // Get task details
    const task = queryOne<{
      id: string;
      title: string;
      assigned_agent_id?: string;
      workspace_id?: string;
      planning_complete?: number;
      planning_dispatch_error?: string;
      status: string;
    }>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if planning is complete
    if (!task.planning_complete) {
      return NextResponse.json({ 
        error: 'Cannot retry dispatch: planning is not complete' 
      }, { status: 400 });
    }

    // Check if there's an assigned agent
    if (!task.assigned_agent_id) {
      return NextResponse.json({ 
        error: 'Cannot retry dispatch: no agent assigned' 
      }, { status: 400 });
    }

    // Get agent name for logging
    const agent = queryOne<{ name: string }>('SELECT name FROM agents WHERE id = ?', [task.assigned_agent_id]);

    // Trigger the dispatch
    const result = await triggerAutoDispatch({
      taskId: task.id,
      taskTitle: task.title,
      agentId: task.assigned_agent_id,
      agentName: agent?.name || 'Unknown Agent',
      workspaceId: task.workspace_id
    });

    // Use transaction to ensure atomic updates
    const db = getDb();
    const transaction = db.transaction(() => {
      if (result.success) {
        // Update task status on success
        run(`
          UPDATE tasks 
          SET status = 'inbox',
              planning_dispatch_error = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `, [taskId]);
      } else {
        // Reset to planning so user can re-plan - clears stale planning data
        run(`
          UPDATE tasks
          SET status = 'planning',
              status_reason = ?,
              planning_complete = 0,
              planning_spec = NULL,
              planning_agents = NULL,
              planning_messages = NULL,
              planning_dispatch_error = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `, ['Dispatch retry failed: ' + result.error, result.error, taskId]);
      }
    });

    transaction();

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: 'Dispatch retry successful' 
      });
    } else {
      return NextResponse.json({ 
        error: 'Dispatch retry failed', 
        details: result.error 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Failed to retry dispatch:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Reset to planning so user can re-plan - clears stale planning data
    run(`
      UPDATE tasks
      SET status = 'planning',
          status_reason = ?,
          planning_complete = 0,
          planning_spec = NULL,
          planning_agents = NULL,
          planning_messages = NULL,
          planning_dispatch_error = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, [`Retry error: ${errorMessage}`, `Retry error: ${errorMessage}`, taskId]);

    return NextResponse.json({ 
      error: 'Failed to retry dispatch'
    }, { status: 500 });
  }
}