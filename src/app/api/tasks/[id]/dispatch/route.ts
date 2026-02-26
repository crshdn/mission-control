import { NextRequest, NextResponse } from 'next/server';
import { dispatchTaskToAgent } from '@/lib/dispatch';
import { broadcast } from '@/lib/events';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/dispatch
 * Dispatches a task to its assigned agent's OpenClaw session.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await dispatchTaskToAgent(id);

    if (!result.success) {
      const status = result.error === 'Task not found' || result.error === 'Assigned agent not found'
        ? 404
        : result.error === 'Task has no assigned agent'
          ? 400
          : result.error === 'Failed to connect to OpenClaw Gateway'
            ? 503
            : 500;

      return NextResponse.json({ error: result.error }, { status });
    }

    // Broadcast SSE updates
    if (result.updatedTask) {
      broadcast({ type: 'task_updated', payload: result.updatedTask });
    }
    if (result.updatedAgent) {
      broadcast({ type: 'agent_updated', payload: result.updatedAgent });
    }

    return NextResponse.json({
      success: true,
      task_id: result.taskId,
      agent_id: result.agentId,
      session_id: result.sessionId,
      message: 'Task dispatched to agent'
    });
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
