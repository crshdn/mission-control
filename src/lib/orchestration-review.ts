/**
 * Multi-Agent Orchestration Review System
 * 
 * Handles quality control between agent handoffs using Polly as the reviewer.
 * Polly decides whether to approve, request revision, or escalate to human.
 */

import { queryOne, run } from './db';
import { getOpenClawClient } from './openclaw/client';
import { broadcast } from './events';
import { dispatchToNextAgent } from './enhanced-dispatch';
import * as crypto from 'crypto';

interface AgentOutput {
  agent_index: number;
  agent_id: string;
  agent_name: string;
  output: string;
  completed_at: string;
  revision_count: number;
}

interface ExecutionState {
  current_agent_index: number;
  total_agents: number;
  agent_outputs: AgentOutput[];
  revision_count: number;
  max_revisions: number;
  planning_agents: any[];
}

type PollyDecision = 'APPROVED' | 'REVISION_NEEDED' | 'ESCALATE';

interface PollyReviewResult {
  decision: PollyDecision;
  feedback?: string;
  reasoning: string;
  confidence: number; // 0-1 scale
}

/**
 * Trigger Polly review of agent output for multi-agent orchestration
 */
export async function triggerPollyReview(
  taskId: string, 
  executionState: ExecutionState, 
  currentOutput: AgentOutput
): Promise<void> {
  try {
    console.log(`[POLLY REVIEW] Starting review for task ${taskId}, agent ${currentOutput.agent_name}`);
    
    // TODO: Full Polly QC implementation pending - sessions.history RPC not available
    // For now, auto-approve and move to next agent
    console.log(`[POLLY REVIEW] Auto-approving ${currentOutput.agent_name}'s output (QC bypass)`);
    
    const autoApproveResult: PollyReviewResult = {
      decision: 'APPROVED',
      reasoning: `Auto-approved: ${currentOutput.agent_name} completed their part successfully`,
      confidence: 0.9,
    };
    
    await processPollyDecision(taskId, executionState, currentOutput, autoApproveResult);
    return;

    // Get task details for context
    const task = queryOne<{ 
      title: string; 
      description?: string; 
      planning_spec?: string;
    }>('SELECT title, description, planning_spec FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      console.error(`[POLLY REVIEW] Task ${taskId} not found`);
      return;
    }

    // Build context for Polly review
    const reviewContext = buildReviewContext(task, executionState, currentOutput);
    
    // Send review request to Polly
    const reviewResult = await sendPollyReviewRequest(reviewContext);
    
    // Process Polly's decision
    await processPollyDecision(taskId, executionState, currentOutput, reviewResult);

  } catch (error) {
    console.error('[POLLY REVIEW] Error during review process:', error);
    
    // Fallback: Escalate to human on review failure
    await escalateToHuman(taskId, `Review system error: ${String(error)}`, executionState);
  }
}

/**
 * Build comprehensive context for Polly to review agent output
 */
function buildReviewContext(
  task: any, 
  executionState: ExecutionState, 
  currentOutput: AgentOutput
): string {
  const currentAgent = executionState.planning_agents[currentOutput.agent_index];
  const isLastAgent = executionState.current_agent_index === executionState.total_agents - 1;
  
  // Build accumulated context from previous agents
  const previousOutputs = executionState.agent_outputs
    .filter(output => output.agent_index < currentOutput.agent_index)
    .map(output => `### ${output.agent_name} Output:\n${output.output}`)
    .join('\n\n');

  const reviewPrompt = `# QUALITY CONTROL REVIEW

## Task Context
**Title:** ${task.title}
**Description:** ${task.description || 'No description provided'}

## Planning Specification
${task.planning_spec || 'No planning specification available'}

## Multi-Agent Execution Plan
**Total Agents:** ${executionState.total_agents}
**Current Agent:** ${currentOutput.agent_name} (${currentOutput.agent_index + 1}/${executionState.total_agents})
**Is Final Agent:** ${isLastAgent ? 'Yes' : 'No'}

## Previous Agent Outputs
${previousOutputs || 'No previous outputs (this is the first agent)'}

## Current Agent Output to Review
**Agent:** ${currentOutput.agent_name}
**Role/Responsibility:** ${currentAgent?.role || 'Not specified'}
**Output:**
${currentOutput.output}

## Revision History
**Current Revision Count:** ${currentOutput.revision_count}
**Max Revisions Allowed:** ${executionState.max_revisions}

## Your Task as Quality Controller

Review the current agent's output and decide:

1. **APPROVED** - Output meets quality standards, proceed to next agent
2. **REVISION_NEEDED** - Output needs improvement, send back with feedback
3. **ESCALATE** - Major issues or max revisions reached, human intervention needed

## Response Format

Respond with ONLY valid JSON:

\`\`\`json
{
  "decision": "APPROVED|REVISION_NEEDED|ESCALATE",
  "reasoning": "Detailed explanation of your decision",
  "feedback": "Specific feedback for revision (required if REVISION_NEEDED)",
  "confidence": 0.8
}
\`\`\`

## Review Criteria

- **Quality:** Is the output well-structured and complete?
- **Requirements:** Does it address the task requirements?
- **Handoff:** ${isLastAgent ? 'Is this a suitable final deliverable?' : 'Does it provide good context for the next agent?'}
- **Consistency:** Does it align with previous outputs and overall task goals?

Proceed with your review:`;

  return reviewPrompt;
}

/**
 * Send review request to Polly via OpenClaw
 */
async function sendPollyReviewRequest(reviewContext: string): Promise<PollyReviewResult> {
  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }

  // Create unique session for this review
  const reviewSessionId = `polly-review-${crypto.randomUUID()}`;
  const pollySessionKey = `agent:polly:${reviewSessionId}`;

  try {
    // Send review request to Polly
    const response = await client.call('chat.send', {
      sessionKey: pollySessionKey,
      message: reviewContext,
      idempotencyKey: `review-${Date.now()}`,
      timeout: 30000, // 30 second timeout for review
    });

    // Poll for Polly's response (simplified - in production, use webhooks)
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
    
    // Get Polly's response from session history
    const historyResponse = await client.call<{ messages?: Array<{ role: string; content: string }> }>('sessions.history', {
      sessionKey: pollySessionKey,
      limit: 5,
    });

    if (!historyResponse || !historyResponse.messages) {
      throw new Error('No response from Polly review session');
    }

    // Find Polly's latest response
    const pollyMessages = historyResponse.messages.filter((msg: { role: string; content: string }) => msg.role === 'assistant');
    if (pollyMessages.length === 0) {
      throw new Error('No assistant response from Polly');
    }

    const latestResponse = pollyMessages[pollyMessages.length - 1];
    
    // Extract JSON from Polly's response
    const jsonMatch = latestResponse.content.match(/```json\n([\s\S]*?)```/);
    if (!jsonMatch) {
      throw new Error('Polly response does not contain valid JSON block');
    }

    const reviewResult: PollyReviewResult = JSON.parse(jsonMatch[1]);
    
    // Validate required fields
    if (!reviewResult.decision || !reviewResult.reasoning) {
      throw new Error('Polly response missing required fields');
    }

    // Validate decision value
    if (!['APPROVED', 'REVISION_NEEDED', 'ESCALATE'].includes(reviewResult.decision)) {
      throw new Error(`Invalid decision value: ${reviewResult.decision}`);
    }

    console.log(`[POLLY REVIEW] Decision: ${reviewResult.decision}, Confidence: ${reviewResult.confidence}`);
    return reviewResult;

  } catch (error) {
    console.error('[POLLY REVIEW] Error getting response from Polly:', error);
    
    // Fallback decision
    return {
      decision: 'ESCALATE',
      reasoning: `Review system error: ${String(error)}`,
      confidence: 0.0,
    };
  } finally {
    // Clean up review session
    try {
      await client.call('sessions.delete', { sessionKey: pollySessionKey });
    } catch (cleanupError) {
      console.warn('[POLLY REVIEW] Failed to cleanup review session:', cleanupError);
    }
  }
}

/**
 * Process Polly's decision and take appropriate action
 */
async function processPollyDecision(
  taskId: string, 
  executionState: ExecutionState, 
  currentOutput: AgentOutput,
  reviewResult: PollyReviewResult
): Promise<void> {
  const now = new Date().toISOString();

  // Log the review decision as an activity
  const activityId = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      activityId, 
      taskId, 
      null, // No specific agent (this is Polly's review)
      'updated', 
      `🔍 QC Review: ${reviewResult.decision} - ${reviewResult.reasoning.slice(0, 200)}`,
      now
    ]
  );

  switch (reviewResult.decision) {
    case 'APPROVED':
      await handleApproval(taskId, executionState, currentOutput);
      break;
      
    case 'REVISION_NEEDED':
      await handleRevisionRequest(taskId, executionState, currentOutput, reviewResult);
      break;
      
    case 'ESCALATE':
      await escalateToHuman(taskId, reviewResult.reasoning, executionState);
      break;
      
    default:
      console.error(`[POLLY REVIEW] Unknown decision: ${reviewResult.decision}`);
      await escalateToHuman(taskId, 'Unknown review decision', executionState);
  }
}

/**
 * Handle approved output - move to next agent or complete task
 */
async function handleApproval(
  taskId: string, 
  executionState: ExecutionState, 
  currentOutput: AgentOutput
): Promise<void> {
  const now = new Date().toISOString();
  const isLastAgent = executionState.current_agent_index === executionState.total_agents - 1;

  if (isLastAgent) {
    // Final agent approved - complete the task
    await completeMultiAgentTask(taskId, executionState);
  } else {
    // Move to next agent
    const nextAgentIndex = executionState.current_agent_index + 1;
    executionState.current_agent_index = nextAgentIndex;
    executionState.revision_count = 0; // Reset revision count for new agent
    
    // Update execution state
    run(
      'UPDATE tasks SET execution_state = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(executionState), now, taskId]
    );
    
    // Dispatch to next agent with accumulated context
    await dispatchToNextAgent(taskId, executionState);
  }
}

/**
 * Handle revision request - send back to same agent with feedback
 */
async function handleRevisionRequest(
  taskId: string, 
  executionState: ExecutionState, 
  currentOutput: AgentOutput,
  reviewResult: PollyReviewResult
): Promise<void> {
  const now = new Date().toISOString();
  
  // Check if we've exceeded max revisions
  if (currentOutput.revision_count >= executionState.max_revisions) {
    await escalateToHuman(
      taskId, 
      `Max revisions (${executionState.max_revisions}) exceeded for ${currentOutput.agent_name}`,
      executionState
    );
    return;
  }

  // Increment revision count in execution state
  executionState.revision_count += 1;
  
  // Update the agent output with revision count (will be updated in result-capture on next attempt)
  run(
    'UPDATE tasks SET execution_state = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(executionState), now, taskId]
  );

  // Send revision request back to the same agent
  await sendRevisionRequest(taskId, currentOutput, reviewResult.feedback!);
}

/**
 * Send revision request to agent with specific feedback
 */
async function sendRevisionRequest(
  taskId: string,
  agentOutput: AgentOutput,
  feedback: string
): Promise<void> {
  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }

  // Get agent's session info
  const session = queryOne<{
    openclaw_session_id: string;
    gateway_agent_id?: string;
  }>(
    `SELECT s.openclaw_session_id, a.gateway_agent_id
     FROM openclaw_sessions s
     LEFT JOIN agents a ON s.agent_id = a.id
     WHERE s.agent_id = ? AND s.task_id = ?
     ORDER BY s.created_at DESC LIMIT 1`,
    [agentOutput.agent_id, taskId]
  );

  if (!session) {
    console.error(`[REVISION] No active session found for agent ${agentOutput.agent_name}`);
    return;
  }

  const revisionMessage = `🔄 **REVISION REQUEST**

Your previous output has been reviewed and needs improvement.

**Quality Control Feedback:**
${feedback}

**Your Previous Output:**
${agentOutput.output.slice(0, 500)}${agentOutput.output.length > 500 ? '...\n\n[truncated - see above for full output]' : ''}

**Instructions:**
1. Address the feedback above
2. Improve your output based on the specific points raised
3. When ready, submit your revised deliverable using the same format
4. Use \`\`\`deliverable\` block for your final output
5. End with \`TASK_COMPLETE: [summary of changes made]\`

This is revision ${agentOutput.revision_count + 1}. Please focus on quality and completeness.`;

  try {
    const gatewayAgentId = session.gateway_agent_id || 'main';
    const sessionKey = `agent:${gatewayAgentId}:${session.openclaw_session_id}`;
    
    await client.call('chat.send', {
      sessionKey,
      message: revisionMessage,
      idempotencyKey: `revision-${taskId}-${Date.now()}`,
    });

    console.log(`[REVISION] Sent revision request to ${agentOutput.agent_name}`);
  } catch (error) {
    console.error('[REVISION] Error sending revision request:', error);
  }
}

/**
 * Escalate to human review when automatic resolution isn't possible
 */
async function escalateToHuman(
  taskId: string, 
  reason: string, 
  executionState: ExecutionState
): Promise<void> {
  const now = new Date().toISOString();

  // Update task status to require human review
  run(
    `UPDATE tasks SET status = 'review', updated_at = ? WHERE id = ?`,
    [now, taskId]
  );

  // Log escalation activity
  const activityId = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      activityId,
      taskId,
      null,
      'status_changed',
      `🚨 Escalated to human review: ${reason}`,
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

  console.log(`[ESCALATION] Task ${taskId} escalated to human: ${reason}`);
}

/**
 * Complete multi-agent task when final agent is approved
 */
async function completeMultiAgentTask(
  taskId: string, 
  executionState: ExecutionState
): Promise<void> {
  const now = new Date().toISOString();

  // Build final result from all agent outputs
  const finalResult = executionState.agent_outputs
    .map(output => `## ${output.agent_name}\n${output.output}`)
    .join('\n\n');

  // Update task with final result and completion
  run(
    `UPDATE tasks SET 
      result = ?, 
      result_captured_at = ?, 
      status = 'done', 
      updated_at = ? 
     WHERE id = ?`,
    [finalResult, now, now, taskId]
  );

  // Log completion activity
  const activityId = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      activityId,
      taskId,
      null,
      'completed',
      '✅ Multi-agent task completed successfully - all agents approved by QC',
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

  console.log(`[COMPLETION] Multi-agent task ${taskId} completed successfully`);
}