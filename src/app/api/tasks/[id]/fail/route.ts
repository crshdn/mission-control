import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { handleStageFailure, drainQueue } from '@/lib/workflow-engine';
import { notifyLearner } from '@/lib/learner';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/[id]/fail
 *
 * Report a stage failure. Triggers the workflow engine's fail-loopback
 * to send the task back to the appropriate stage (usually in_progress/builder).
 *
 * Body: { reason: "What failed and why" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const body = await request.json();
    const { reason } = body;

    if (!reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Only allow failure from testing, review, or verification stages
    const failableStatuses = ['testing', 'review', 'verification'];
    if (!failableStatuses.includes(task.status)) {
      return NextResponse.json(
        { error: `Cannot fail from status: ${task.status}. Must be in ${failableStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Notify learner about the failure
    notifyLearner(taskId, {
      previousStatus: task.status,
      newStatus: 'in_progress',
      passed: false,
      failReason: reason,
    }).catch(err => logger.error('[Learner] notification failed:', err));

    // Trigger the fail-loopback via the workflow engine
    const result = await handleStageFailure(taskId, task.status, reason);

    if (result.success) {
      // Fail-loopback freed a slot (testing/verification) — drain the queue
      drainQueue(taskId, task.workspace_id).catch(err =>
        logger.error('[Workflow] drainQueue after fail failed:', err)
      );

      return NextResponse.json({
        success: true,
        message: `Task returned to ${result.newAgentName ? result.newAgentName : 'previous stage'} for rework`,
        newAgent: result.newAgentName,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to process stage failure',
      }, { status: 500 });
    }
  } catch (error) {
    logger.error('Failed to process stage failure:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
