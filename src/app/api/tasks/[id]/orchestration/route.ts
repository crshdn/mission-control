/**
 * API Route: /api/tasks/[id]/orchestration/review
 * 
 * Handles Polly's quality control reviews for multi-agent tasks.
 * Processes review decisions and triggers next actions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { triggerPollyReview } from '@/lib/orchestration-review';
import { dispatchToNextAgent } from '@/lib/enhanced-dispatch';
import { broadcast } from '@/lib/events';
import * as crypto from 'crypto';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ReviewDecisionRequest {
  decision: 'APPROVED' | 'REVISION_NEEDED' | 'ESCALATE';
  feedback?: string;
  reasoning: string;
  confidence?: number;
  reviewer?: 'polly' | 'human';
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

/**
 * POST /api/tasks/[id]/orchestration/review
 * Process a review decision for multi-agent orchestration
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: taskId } = await params;
    const reviewDecision: ReviewDecisionRequest = await request.json();

    // Validate request
    if (!reviewDecision.decision || !reviewDecision.reasoning) {
      return NextResponse.json(
        { error: 'Missing required fields: decision, reasoning' },
        { status: 400 }
      );
    }

    if (!['APPROVED', 'REVISION_NEEDED', 'ESCALATE'].includes(reviewDecision.decision)) {
      return NextResponse.json(
        { error: 'Invalid decision value' },
        { status: 400 }
      );
    }

    // Get task with execution state
    const task = queryOne<{
      id: string;
      execution_state?: string;
      status: string;
      assigned_agent_id?: string;
    }>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.execution_state) {
      return NextResponse.json(
        { error: 'Task is not a multi-agent orchestration task' },
        { status: 400 }
      );
    }

    // Parse execution state
    let executionState: ExecutionState;
    try {
      executionState = JSON.parse(task.execution_state);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid execution state format' },
        { status: 500 }
      );
    }

    // Get current agent output
    const currentOutput = executionState.agent_outputs
      .find(output => output.agent_index === executionState.current_agent_index);

    if (!currentOutput) {
      return NextResponse.json(
        { error: 'No current agent output found' },
        { status: 500 }
      );
    }

    // Process the review decision
    const result = await processReviewDecision(taskId, executionState, currentOutput, reviewDecision);

    return NextResponse.json(result);

  } catch (error) {
    console.error('[ORCHESTRATION REVIEW] Error processing review:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tasks/[id]/orchestration/review
 * Get current review status for a multi-agent task
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: taskId } = await params;

    const task = queryOne<{
      id: string;
      execution_state?: string;
      status: string;
      title: string;
    }>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.execution_state) {
      return NextResponse.json({
        isMultiAgent: false,
        message: 'Task is not a multi-agent orchestration task'
      });
    }

    const executionState: ExecutionState = JSON.parse(task.execution_state);
    
    // Get latest activities related to reviews
    const reviewActivities = queryAll<{
      message: string;
      created_at: string;
      activity_type: string;
    }>(
      `SELECT message, created_at, activity_type 
       FROM task_activities 
       WHERE task_id = ? AND (message LIKE '%QC Review%' OR message LIKE '%Escalated%')
       ORDER BY created_at DESC LIMIT 5`,
      [taskId]
    );

    const currentOutput = executionState.agent_outputs
      .find(output => output.agent_index === executionState.current_agent_index);

    return NextResponse.json({
      isMultiAgent: true,
      taskId,
      taskTitle: task.title,
      executionState,
      currentOutput,
      reviewActivities,
      status: task.status,
      isComplete: task.status === 'done',
      needsReview: task.status === 'review' || (currentOutput && !isAgentCompleted(executionState)),
    });

  } catch (error) {
    console.error('[ORCHESTRATION REVIEW] Error getting review status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Process review decision and take appropriate action
 */
async function processReviewDecision(
  taskId: string,
  executionState: ExecutionState,
  currentOutput: any,
  reviewDecision: ReviewDecisionRequest
): Promise<{ success: boolean; action: string; message: string }> {
  const now = new Date().toISOString();
  const reviewer = reviewDecision.reviewer || 'polly';

  // Log the review decision
  const activityId = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      activityId,
      taskId,
      null, // No specific agent (this is a review)
      'updated',
      `🔍 ${reviewer.toUpperCase()} Review: ${reviewDecision.decision} - ${reviewDecision.reasoning.slice(0, 150)}${reviewDecision.reasoning.length > 150 ? '...' : ''}`,
      now
    ]
  );

  switch (reviewDecision.decision) {
    case 'APPROVED':
      return await handleApprovalDecision(taskId, executionState, currentOutput);
      
    case 'REVISION_NEEDED':
      return await handleRevisionDecision(taskId, executionState, currentOutput, reviewDecision);
      
    case 'ESCALATE':
      return await handleEscalationDecision(taskId, executionState, reviewDecision);
      
    default:
      return {
        success: false,
        action: 'error',
        message: `Unknown decision: ${reviewDecision.decision}`
      };
  }
}

/**
 * Handle APPROVED decision
 */
async function handleApprovalDecision(
  taskId: string,
  executionState: ExecutionState,
  currentOutput: any
): Promise<{ success: boolean; action: string; message: string }> {
  const isLastAgent = executionState.current_agent_index === executionState.total_agents - 1;
  const now = new Date().toISOString();

  if (isLastAgent) {
    // Final agent approved - complete the task
    const finalResult = executionState.agent_outputs
      .map(output => `## ${output.agent_name}\n${output.output}`)
      .join('\n\n');

    run(
      `UPDATE tasks SET 
        result = ?, 
        result_captured_at = ?, 
        status = 'done', 
        updated_at = ? 
       WHERE id = ?`,
      [finalResult, now, now, taskId]
    );

    // Log completion
    const activityId = crypto.randomUUID();
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        activityId,
        taskId,
        null,
        'completed',
        '✅ Multi-agent task completed successfully - all agents approved',
        now
      ]
    );

    // Broadcast completion
    const completedTask = queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (completedTask) {
      broadcast({
        type: 'task_updated',
        payload: completedTask as any,
      });
    }

    return {
      success: true,
      action: 'completed',
      message: 'Task completed successfully - final agent output approved'
    };

  } else {
    // Move to next agent
    const nextAgentIndex = executionState.current_agent_index + 1;
    executionState.current_agent_index = nextAgentIndex;
    executionState.revision_count = 0; // Reset for new agent
    
    // Update execution state
    run(
      'UPDATE tasks SET execution_state = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(executionState), now, taskId]
    );
    
    // Dispatch to next agent
    await dispatchToNextAgent(taskId, executionState);

    return {
      success: true,
      action: 'next_agent',
      message: `Output approved - dispatched to next agent (${nextAgentIndex + 1}/${executionState.total_agents})`
    };
  }
}

/**
 * Handle REVISION_NEEDED decision
 */
async function handleRevisionDecision(
  taskId: string,
  executionState: ExecutionState,
  currentOutput: any,
  reviewDecision: ReviewDecisionRequest
): Promise<{ success: boolean; action: string; message: string }> {
  const now = new Date().toISOString();

  // Check revision limits
  if (currentOutput.revision_count >= executionState.max_revisions) {
    return await handleEscalationDecision(
      taskId,
      executionState,
      {
        decision: 'ESCALATE',
        reasoning: `Max revisions (${executionState.max_revisions}) exceeded for ${currentOutput.agent_name}`,
      }
    );
  }

  // Increment revision count
  executionState.revision_count += 1;
  
  // Update execution state
  run(
    'UPDATE tasks SET execution_state = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(executionState), now, taskId]
  );

  // Send revision request (this would integrate with the existing message system)
  await sendRevisionRequest(taskId, currentOutput, reviewDecision.feedback || 'Please improve your output based on the review.');

  return {
    success: true,
    action: 'revision_requested',
    message: `Revision requested - agent has ${executionState.max_revisions - currentOutput.revision_count} attempts remaining`
  };
}

/**
 * Handle ESCALATE decision
 */
async function handleEscalationDecision(
  taskId: string,
  executionState: ExecutionState,
  reviewDecision: ReviewDecisionRequest
): Promise<{ success: boolean; action: string; message: string }> {
  const now = new Date().toISOString();

  // Update task to require human review
  run(
    `UPDATE tasks SET status = 'review', updated_at = ? WHERE id = ?`,
    [now, taskId]
  );

  // Log escalation
  const activityId = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      activityId,
      taskId,
      null,
      'status_changed',
      `🚨 Escalated to human review: ${reviewDecision.reasoning}`,
      now
    ]
  );

  // Broadcast update
  const updatedTask = queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (updatedTask) {
    broadcast({
      type: 'task_updated',
      payload: updatedTask as any,
    });
  }

  return {
    success: true,
    action: 'escalated',
    message: `Task escalated to human review: ${reviewDecision.reasoning}`
  };
}

/**
 * Send revision request to agent
 */
async function sendRevisionRequest(
  taskId: string,
  agentOutput: any,
  feedback: string
): Promise<void> {
  // This would integrate with the OpenClaw messaging system
  // For now, we'll log it as an activity that the agent can see
  const activityId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      activityId,
      taskId,
      agentOutput.agent_id,
      'updated',
      `🔄 Revision requested for ${agentOutput.agent_name}: ${feedback}`,
      now
    ]
  );

  console.log(`[ORCHESTRATION] Revision request logged for ${agentOutput.agent_name}`);
}

/**
 * Check if current agent has completed their work
 */
function isAgentCompleted(executionState: ExecutionState): boolean {
  return executionState.agent_outputs.some(
    output => output.agent_index === executionState.current_agent_index
  );
}

/**
 * Helper to get all task activities
 */
function queryAll<T>(sql: string, params: any[] = []): T[] {
  // This would use the actual db module's queryAll function
  // Placeholder implementation
  return [];
}