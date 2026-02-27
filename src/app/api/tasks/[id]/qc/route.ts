import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { dispatchToNextAgent } from '@/lib/enhanced-dispatch';

interface QCDecision {
  decision: 'APPROVED' | 'REVISION_NEEDED' | 'ESCALATE';
  reasoning: string;
  feedback?: string;
  confidence?: number;
}

interface ExecutionState {
  current_agent_index: number;
  total_agents: number;
  agent_outputs: Array<{
    agent_index: number;
    agent_id: string;
    agent_name: string;
    output: string;
    completed_at: string;
    revision_count: number;
  }>;
  revision_count: number;
  max_revisions: number;
  planning_agents: any[];
}

const MAX_REVISIONS_PER_AGENT = 3;

/**
 * POST /api/tasks/[id]/qc
 * 
 * Endpoint for Polly to submit QC decisions.
 * Expected payload:
 * {
 *   "decision": "APPROVED" | "REVISION_NEEDED" | "ESCALATE",
 *   "reasoning": "Explanation of the decision",
 *   "feedback": "Specific feedback for revision (if REVISION_NEEDED)",
 *   "confidence": 0.8
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body: QCDecision = await request.json();
    const now = new Date().toISOString();

    // Validate decision
    if (!['APPROVED', 'REVISION_NEEDED', 'ESCALATE'].includes(body.decision)) {
      return NextResponse.json(
        { error: 'Invalid decision. Must be APPROVED, REVISION_NEEDED, or ESCALATE' },
        { status: 400 }
      );
    }

    // Get task with execution state
    const task = queryOne<{
      id: string;
      title: string;
      status: string;
      execution_state?: string;
      planning_agents?: string;
      assigned_agent_id?: string;
    }>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Log the QC decision as an activity
    const activityId = uuidv4();
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        activityId,
        taskId,
        null, // Polly's review
        'qc_decision',
        `🔍 QC: ${body.decision} - ${body.reasoning.slice(0, 150)}${body.reasoning.length > 150 ? '...' : ''}`,
        now
      ]
    );

    // Check if this is a multi-agent task
    let executionState: ExecutionState | null = null;
    if (task.execution_state) {
      try {
        executionState = JSON.parse(task.execution_state);
      } catch {
        executionState = null;
      }
    }

    // Process based on decision
    switch (body.decision) {
      case 'APPROVED':
        return await handleApproval(taskId, task, executionState, now);

      case 'REVISION_NEEDED':
        return await handleRevision(taskId, task, executionState, body.feedback || 'Please revise your output', now);

      case 'ESCALATE':
        return await handleEscalation(taskId, task, body.reasoning, now);

      default:
        return NextResponse.json({ error: 'Unknown decision' }, { status: 400 });
    }
  } catch (error) {
    console.error('[QC] Error processing QC decision:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleApproval(
  taskId: string,
  task: any,
  executionState: ExecutionState | null,
  now: string
) {
  // Multi-agent: check if there are more agents
  if (executionState && executionState.current_agent_index < executionState.total_agents - 1) {
    // Move to next agent
    const nextAgentIndex = executionState.current_agent_index + 1;
    executionState.current_agent_index = nextAgentIndex;
    executionState.revision_count = 0;

    run(
      'UPDATE tasks SET execution_state = ?, status = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(executionState), 'assigned', now, taskId]
    );

    // Dispatch to next agent
    await dispatchToNextAgent(taskId, executionState);

    // Log activity
    const activityId = uuidv4();
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [activityId, taskId, null, 'updated', `✅ QC approved - moving to agent ${nextAgentIndex + 1}/${executionState.total_agents}`, now]
    );

    broadcastUpdate(taskId);

    return NextResponse.json({
      success: true,
      action: 'next_agent',
      next_agent_index: nextAgentIndex,
      message: `Approved. Task assigned to agent ${nextAgentIndex + 1}/${executionState.total_agents}`
    });
  }

  // Single agent or final agent: mark as done
  run(
    'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
    ['done', now, taskId]
  );

  // Log completion
  const activityId = uuidv4();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [activityId, taskId, null, 'completed', '✅ QC approved - task complete', now]
  );

  // Free up assigned agent
  if (task.assigned_agent_id) {
    run(
      'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
      ['standby', now, task.assigned_agent_id]
    );
  }

  broadcastUpdate(taskId);

  return NextResponse.json({
    success: true,
    action: 'completed',
    message: 'Task approved and marked as done'
  });
}

async function handleRevision(
  taskId: string,
  task: any,
  executionState: ExecutionState | null,
  feedback: string,
  now: string
) {
  // Check revision count
  if (executionState) {
    const currentAgentIndex = executionState.current_agent_index;
    const currentOutput = executionState.agent_outputs.find(
      o => o.agent_index === currentAgentIndex
    );

    if (currentOutput && currentOutput.revision_count >= MAX_REVISIONS_PER_AGENT) {
      // Max revisions reached, escalate instead
      return await handleEscalation(
        taskId,
        task,
        `Max revisions (${MAX_REVISIONS_PER_AGENT}) reached for current agent`,
        now
      );
    }

    // Increment revision count
    if (currentOutput) {
      currentOutput.revision_count++;
      run(
        'UPDATE tasks SET execution_state = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(executionState), now, taskId]
      );
    }
  }

  // Move back to in_progress
  run(
    'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
    ['in_progress', now, taskId]
  );

  // Log revision request with feedback
  const activityId = uuidv4();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [activityId, taskId, null, 'revision_requested', `🔄 Revision requested: ${feedback.slice(0, 200)}`, now]
  );

  broadcastUpdate(taskId);

  return NextResponse.json({
    success: true,
    action: 'revision_requested',
    feedback,
    message: 'Task sent back for revision'
  });
}

async function handleEscalation(
  taskId: string,
  task: any,
  reason: string,
  now: string
) {
  // Mark as blocked
  run(
    'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
    ['blocked', now, taskId]
  );

  // Log escalation
  const activityId = uuidv4();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [activityId, taskId, null, 'escalated', `🚨 Escalated: ${reason}`, now]
  );

  // Free up assigned agent
  if (task.assigned_agent_id) {
    run(
      'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
      ['standby', now, task.assigned_agent_id]
    );
  }

  broadcastUpdate(taskId);

  return NextResponse.json({
    success: true,
    action: 'escalated',
    reason,
    message: 'Task escalated - human intervention required'
  });
}

function broadcastUpdate(taskId: string) {
  const updatedTask = queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (updatedTask) {
    broadcast({
      type: 'task_updated',
      payload: updatedTask as any,
    });
  }
}

/**
 * GET /api/tasks/[id]/qc
 * 
 * Get QC status and history for a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const task = queryOne<{ status: string; execution_state?: string }>(
      'SELECT status, execution_state FROM tasks WHERE id = ?',
      [taskId]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get QC-related activities
    const activities = queryAll(
      `SELECT * FROM task_activities 
       WHERE task_id = ? AND activity_type IN ('qc_decision', 'review_requested', 'revision_requested', 'escalated')
       ORDER BY created_at DESC
       LIMIT 10`,
      [taskId]
    );

    return NextResponse.json({
      task_id: taskId,
      status: task.status,
      needs_qc: task.status === 'review',
      execution_state: task.execution_state ? JSON.parse(task.execution_state) : null,
      qc_history: activities
    });
  } catch (error) {
    console.error('[QC] Error getting QC status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
