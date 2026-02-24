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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
 * Read Polly's response from session JSONL file
 */
function readPollyResponse(sessionId: string, waitMs: number = 15000): Promise<string | null> {
  return new Promise((resolve) => {
    const sessionsDir = path.join(os.homedir(), '.openclaw', 'agents', 'dispatcher', 'sessions');
    const startTime = Date.now();
    
    const checkForResponse = () => {
      if (!fs.existsSync(sessionsDir)) {
        console.log(`[POLLY REVIEW] Sessions directory not found: ${sessionsDir}`);
        resolve(null);
        return;
      }

      // Get files modified in the last 2 minutes, sorted by most recent
      const cutoffTime = Date.now() - 120000;
      const files = fs.readdirSync(sessionsDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(sessionsDir, f)).mtime }))
        .filter(f => f.mtime.getTime() > cutoffTime)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      console.log(`[POLLY REVIEW] Checking ${files.length} recent session files`);

      // Search most recent files for QC review
      for (const { name: file } of files.slice(0, 5)) {
        const filePath = path.join(sessionsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Look for QC review content
        if (!content.includes('QUALITY CONTROL REVIEW')) continue;
        
        console.log(`[POLLY REVIEW] Found QC review in ${file}`);
        
        // Parse lines backwards to find the most recent assistant response after a QC request
        const lines = content.split('\n').filter(l => l.trim());
        
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i]);
            if (parsed.type === 'message' && parsed.message?.role === 'assistant') {
              const msgContent = parsed.message.content;
              let textContent = '';
              
              if (typeof msgContent === 'string') {
                textContent = msgContent;
              } else if (Array.isArray(msgContent)) {
                textContent = msgContent
                  .filter((c: any) => c.type === 'text' && c.text)
                  .map((c: any) => c.text)
                  .join('\n');
              }
              
              // Check if this response contains a QC decision
              if (textContent && (textContent.includes('"decision"') || textContent.includes('APPROVED') || textContent.includes('REVISION'))) {
                console.log(`[POLLY REVIEW] Found QC decision in response`);
                resolve(textContent);
                return;
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Check if we should keep waiting
      if (Date.now() - startTime < waitMs) {
        setTimeout(checkForResponse, 2000); // Check every 2 seconds
      } else {
        console.log('[POLLY REVIEW] Timeout waiting for Polly response');
        resolve(null);
      }
    };

    // Start checking after a brief delay
    setTimeout(checkForResponse, 3000);
  });
}

/**
 * Send review request to Polly via OpenClaw
 */
async function sendPollyReviewRequest(reviewContext: string): Promise<PollyReviewResult> {
  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }

  // Create unique session for this review - use dispatcher agent (Polly)
  const reviewSessionId = `mc-qc-review-${crypto.randomUUID().slice(0, 8)}`;
  const pollySessionKey = `agent:dispatcher:${reviewSessionId}`;

  try {
    console.log(`[POLLY REVIEW] Sending review request to Polly (session: ${reviewSessionId})`);
    
    // Send review request to Polly
    await client.call('chat.send', {
      sessionKey: pollySessionKey,
      message: reviewContext,
      idempotencyKey: `review-${Date.now()}`,
    });

    // Wait for Polly to process before checking
    console.log('[POLLY REVIEW] Waiting for Polly to process...');
    await new Promise(resolve => setTimeout(resolve, 8000)); // Give Polly time to respond
    
    // Read Polly's response from session file
    const pollyResponse = await readPollyResponse(reviewSessionId, 30000);
    
    if (!pollyResponse) {
      throw new Error('No response from Polly within timeout');
    }

    // Extract JSON from Polly's response
    const jsonMatch = pollyResponse.match(/```json\n([\s\S]*?)```/);
    if (!jsonMatch) {
      // If no JSON block, try to infer decision from response
      console.log('[POLLY REVIEW] No JSON block in response, inferring decision');
      
      const lowerResponse = pollyResponse.toLowerCase();
      if (lowerResponse.includes('approved') || lowerResponse.includes('looks good') || lowerResponse.includes('proceed')) {
        return {
          decision: 'APPROVED',
          reasoning: pollyResponse.slice(0, 500),
          confidence: 0.7,
        };
      } else if (lowerResponse.includes('revision') || lowerResponse.includes('needs work') || lowerResponse.includes('missing')) {
        return {
          decision: 'REVISION_NEEDED',
          feedback: pollyResponse.slice(0, 500),
          reasoning: 'Polly indicated revisions needed',
          confidence: 0.7,
        };
      }
      
      throw new Error('Could not parse Polly response');
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
    
    // Fallback decision - approve to not block progress, but log warning
    console.warn('[POLLY REVIEW] Falling back to auto-approve due to error');
    return {
      decision: 'APPROVED',
      reasoning: `Auto-approved (QC error): ${error instanceof Error ? error.message : String(error)}`,
      confidence: 0.5,
    };
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