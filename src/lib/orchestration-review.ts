/**
 * Enhanced Multi-Agent Orchestration Review System
 * 
 * Handles quality control between agent handoffs using Polly as the reviewer.
 * Fixed to properly handle REVISION_NEEDED, ESCALATE, and revision limits.
 */

import { queryOne, run } from './db';
import { getOpenClawClient } from './openclaw/client';
import { broadcast } from './events';
import { dispatchToNextAgent } from './enhanced-dispatch';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Configuration constants
const MAX_REVISIONS_PER_AGENT = 3;
const POLLY_RESPONSE_TIMEOUT_MS = 45000; // 45 seconds
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1471789155427160156/7XUAgfGx6FXl8qNvmn9GRpuQ3VM5Ix7LBTrtcPsiKk6h7ql45qFan1Wq932n59yLYJH0';

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

interface SessionMessage {
  type: string;
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }> | string;
  };
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
    const reviewResult = await sendPollyReviewRequest(reviewContext, taskId);
    
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
  const planningAgents = executionState.planning_agents || [];
  const agentIndex = currentOutput?.agent_index ?? 0;
  const currentAgent = planningAgents[agentIndex] || { role: 'Unknown' };
  const isLastAgent = executionState.current_agent_index === executionState.total_agents - 1;
  
  // Build accumulated context from previous agents (defensive: handle undefined arrays)
  const agentOutputs = executionState.agent_outputs || [];
  const previousOutputs = agentOutputs
    .filter(output => output.agent_index < agentIndex)
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
**Revision Count:** ${currentOutput.revision_count}/${MAX_REVISIONS_PER_AGENT}
**Output:**
${currentOutput.output}

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
- **Revision History:** ${currentOutput.revision_count > 0 ? `This is revision ${currentOutput.revision_count + 1}. Has the agent addressed previous feedback?` : 'This is the agent\\'s first attempt.'}

Proceed with your review:`;

  return reviewPrompt;
}

/**
 * Enhanced Polly response reader using JSONL pattern from result-capture.ts
 */
function readSessionHistory(taskId: string): Array<{ role: string; content: string }> {
  const openclawDir = path.join(os.homedir(), '.openclaw');
  const sessionsDir = path.join(openclawDir, 'agents', 'dispatcher', 'sessions');
  
  if (!fs.existsSync(sessionsDir)) {
    console.log(`[POLLY REVIEW] Sessions directory not found: ${sessionsDir}`);
    return [];
  }
  
  // Find recent session files that might contain our QC review
  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(sessionsDir, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first
  
  const messages: Array<{ role: string; content: string }> = [];
  
  // Search recent files for QC review content
  for (const { name: file } of files.slice(0, 5)) { // Check last 5 files
    const filePath = path.join(sessionsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    // Check if this file contains our QC review
    const hasQcReview = content.includes('QUALITY CONTROL REVIEW');
    const hasTaskId = content.includes(taskId);
    
    if (!hasQcReview) continue;
    
    console.log(`[POLLY REVIEW] Found QC review in ${file}, hasTaskId=${hasTaskId}`);
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as SessionMessage;
        if (parsed.type === 'message' && parsed.message?.role === 'assistant') {
          const msgContent = parsed.message.content;
          let textContent = '';
          
          if (typeof msgContent === 'string') {
            textContent = msgContent;
          } else if (Array.isArray(msgContent)) {
            textContent = msgContent
              .filter(c => c.type === 'text' && c.text)
              .map(c => c.text!)
              .join('\n');
          }
          
          if (textContent) {
            messages.push({ role: 'assistant', content: textContent });
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }
  
  return messages;
}

/**
 * Send review request to Polly and read response
 */
async function sendPollyReviewRequest(reviewContext: string, taskId: string): Promise<PollyReviewResult> {
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

    // Wait for Polly to process and respond
    console.log('[POLLY REVIEW] Waiting for Polly to process request...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Initial wait
    
    // Read Polly's response from session history
    const startTime = Date.now();
    let pollyResponse: string | null = null;
    
    while (Date.now() - startTime < POLLY_RESPONSE_TIMEOUT_MS) {
      const history = readSessionHistory(taskId);
      
      // Find the most recent response that looks like a QC decision
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        const content = msg.content;
        
        if (content.includes('"decision"') || 
            content.includes('APPROVED') || 
            content.includes('REVISION_NEEDED') || 
            content.includes('ESCALATE')) {
          pollyResponse = content;
          break;
        }
      }
      
      if (pollyResponse) break;
      
      // Wait before trying again
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    if (!pollyResponse) {
      throw new Error('No response from Polly within timeout period');
    }

    console.log(`[POLLY REVIEW] Found Polly response: ${pollyResponse.slice(0, 200)}...`);

    // Extract JSON from Polly's response
    const jsonMatch = pollyResponse.match(/```json\n([\s\S]*?)```/);
    if (!jsonMatch) {
      // If no JSON block, try to infer decision from response text
      console.log('[POLLY REVIEW] No JSON block found, inferring decision from text');
      
      const lowerResponse = pollyResponse.toLowerCase();
      if (lowerResponse.includes('approved') || lowerResponse.includes('looks good') || lowerResponse.includes('proceed')) {
        return {
          decision: 'APPROVED',
          reasoning: 'Polly indicated approval (inferred from text)',
          confidence: 0.7,
        };
      } else if (lowerResponse.includes('revision') || lowerResponse.includes('needs work') || lowerResponse.includes('improve')) {
        return {
          decision: 'REVISION_NEEDED',
          feedback: pollyResponse.slice(0, 500),
          reasoning: 'Polly indicated revisions needed (inferred from text)',
          confidence: 0.7,
        };
      } else if (lowerResponse.includes('escalate') || lowerResponse.includes('human') || lowerResponse.includes('serious')) {
        return {
          decision: 'ESCALATE',
          reasoning: 'Polly indicated escalation needed (inferred from text)',
          confidence: 0.8,
        };
      }
      
      throw new Error('Could not parse or infer decision from Polly response');
    }

    const reviewResult: PollyReviewResult = JSON.parse(jsonMatch[1]);
    
    // Validate required fields
    if (!reviewResult.decision || !reviewResult.reasoning) {
      throw new Error('Polly response missing required fields (decision, reasoning)');
    }

    // Validate decision value
    if (!['APPROVED', 'REVISION_NEEDED', 'ESCALATE'].includes(reviewResult.decision)) {
      throw new Error(`Invalid decision value: ${reviewResult.decision}`);
    }

    console.log(`[POLLY REVIEW] Parsed decision: ${reviewResult.decision}, Confidence: ${reviewResult.confidence}`);
    return reviewResult;

  } catch (error) {
    console.error('[POLLY REVIEW] Error getting response from Polly:', error);
    
    // Remove auto-approve fallback - escalate instead
    return {
      decision: 'ESCALATE',
      reasoning: `QC system error: ${error instanceof Error ? error.message : String(error)}`,
      confidence: 0.0,
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
      `🔍 QC Review: ${reviewResult.decision} - ${reviewResult.reasoning.slice(0, 150)}${reviewResult.reasoning.length > 150 ? '...' : ''}`,
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
      await escalateToHuman(taskId, `Unknown review decision: ${reviewResult.decision}`, executionState);
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
    
    console.log(`[POLLY REVIEW] Approved - moving to next agent (${nextAgentIndex + 1}/${executionState.total_agents})`);
    
    // Dispatch to next agent with accumulated context
    await dispatchToNextAgent(taskId, executionState);
  }
}

/**
 * Enhanced revision handling with proper tracking and limits
 */
async function handleRevisionRequest(
  taskId: string, 
  executionState: ExecutionState, 
  currentOutput: AgentOutput,
  reviewResult: PollyReviewResult
): Promise<void> {
  const now = new Date().toISOString();
  
  // Check if we've exceeded max revisions for this specific agent
  if (currentOutput.revision_count >= MAX_REVISIONS_PER_AGENT) {
    console.log(`[POLLY REVIEW] Max revisions (${MAX_REVISIONS_PER_AGENT}) exceeded for ${currentOutput.agent_name}`);
    await escalateToHuman(
      taskId, 
      `Agent ${currentOutput.agent_name} failed after ${MAX_REVISIONS_PER_AGENT} revision attempts`,
      executionState
    );
    return;
  }

  // Increment revision count for this agent
  const updatedOutput = { ...currentOutput, revision_count: currentOutput.revision_count + 1 };
  
  // Update the agent output in execution state
  const outputIndex = executionState.agent_outputs.findIndex(
    output => output.agent_index === currentOutput.agent_index
  );
  
  if (outputIndex >= 0) {
    executionState.agent_outputs[outputIndex] = updatedOutput;
  }
  
  // Update execution state in database
  run(
    'UPDATE tasks SET execution_state = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(executionState), now, taskId]
  );

  // Log revision request activity
  const activityId = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      activityId,
      taskId,
      currentOutput.agent_id,
      'revision_requested',
      `🔄 Revision ${updatedOutput.revision_count}/${MAX_REVISIONS_PER_AGENT} requested for ${currentOutput.agent_name}: ${(reviewResult.feedback || '').slice(0, 200)}`,
      now
    ]
  );

  console.log(`[POLLY REVIEW] Sending revision request to ${currentOutput.agent_name} (attempt ${updatedOutput.revision_count}/${MAX_REVISIONS_PER_AGENT})`);
  
  // Send revision request back to the same agent
  await sendRevisionRequest(taskId, updatedOutput, reviewResult.feedback || 'Please improve your output based on the quality review.');
}

/**
 * Send revision request to agent with specific feedback and context injection
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

  const revisionMessage = `🔄 **REVISION REQUEST - QUALITY CONTROL FEEDBACK**

Your previous output has been reviewed by the quality controller and needs improvement.

**Previous attempt failed QC:** ${feedback}

**Your Previous Output:**
${agentOutput.output.slice(0, 800)}${agentOutput.output.length > 800 ? '...\n\n[Previous output truncated - see above for context]' : ''}

**What you need to do:**
1. **Address the specific feedback above** - this is critical for approval
2. Revise and improve your output based on the quality controller's guidance
3. When ready, submit your revised deliverable using the same format:
   - Use \`\`\`deliverable\` block for your final output
   - End with \`TASK_COMPLETE: [summary of changes made]\`

**Revision Status:** This is revision attempt ${agentOutput.revision_count}/${MAX_REVISIONS_PER_AGENT}
${agentOutput.revision_count === MAX_REVISIONS_PER_AGENT ? '⚠️  **FINAL ATTEMPT** - Task will escalate to human if this revision fails' : ''}

Focus on quality, completeness, and directly addressing the feedback provided. Revise accordingly.`;

  try {
    const gatewayAgentId = session.gateway_agent_id || 'main';
    const sessionKey = `agent:${gatewayAgentId}:${session.openclaw_session_id}`;
    
    await client.call('chat.send', {
      sessionKey,
      message: revisionMessage,
      idempotencyKey: `revision-${taskId}-${agentOutput.revision_count}-${Date.now()}`,
    });

    console.log(`[REVISION] Sent revision request to ${agentOutput.agent_name} (attempt ${agentOutput.revision_count}/${MAX_REVISIONS_PER_AGENT})`);
  } catch (error) {
    console.error('[REVISION] Error sending revision request:', error);
    
    // If we can't send revision request, escalate
    await escalateToHuman(
      taskId,
      `Failed to send revision request to ${agentOutput.agent_name}: ${error}`,
      JSON.parse('{}') // Empty execution state as fallback
    );
  }
}

/**
 * Enhanced escalation with Discord notification and proper task handling
 */
async function escalateToHuman(
  taskId: string, 
  reason: string, 
  executionState: ExecutionState
): Promise<void> {
  const now = new Date().toISOString();

  // Get task details for Discord notification
  const task = queryOne<{ 
    title: string; 
    description?: string;
    workspace_id: string;
  }>('SELECT title, description, workspace_id FROM tasks WHERE id = ?', [taskId]);

  if (!task) {
    console.error(`[ESCALATION] Task ${taskId} not found for escalation`);
    return;
  }

  // Update task status to blocked (not just review)
  run(
    `UPDATE tasks SET status = 'blocked', updated_at = ? WHERE id = ?`,
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
      'escalated',
      `🚨 Escalated to human: ${reason}`,
      now
    ]
  );

  // Post to Discord #operations webhook
  await postToDiscord(taskId, task.title, reason);

  // Mark any active agents as standby to free them up
  run(
    `UPDATE agents SET status = 'standby', updated_at = ? 
     WHERE id IN (
       SELECT agent_id FROM openclaw_sessions 
       WHERE task_id = ? AND status = 'active'
     )`,
    [now, taskId]
  );

  // Close any active sessions for this task
  run(
    `UPDATE openclaw_sessions SET status = 'completed', ended_at = ? 
     WHERE task_id = ? AND status = 'active'`,
    [now, taskId]
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
  console.log(`[ESCALATION] Agents freed up to work on other tasks - no blocking`);
}

/**
 * Post escalation notification to Discord #operations channel
 */
async function postToDiscord(taskId: string, taskTitle: string, reason: string): Promise<void> {
  try {
    const missionControlUrl = 'http://localhost:4000'; // Default, could be configurable
    const taskUrl = `${missionControlUrl}/tasks/${taskId}`;
    
    const discordPayload = {
      content: `🚨 **Task Escalation Required**`,
      embeds: [
        {
          title: taskTitle,
          description: reason,
          color: 0xFF6B6B, // Red color for escalations
          fields: [
            {
              name: 'Task ID',
              value: taskId,
              inline: true
            },
            {
              name: 'Status',
              value: 'Blocked - Human intervention required',
              inline: true
            }
          ],
          footer: {
            text: 'Multi-Agent Orchestration QC'
          },
          timestamp: new Date().toISOString(),
          url: taskUrl
        }
      ]
    };

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(discordPayload)
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }

    console.log(`[ESCALATION] Posted to Discord #operations: ${taskTitle}`);
  } catch (error) {
    console.error('[ESCALATION] Failed to post to Discord:', error);
    // Don't fail the escalation process if Discord posting fails
  }
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

  // Free up any agents that were working on this task
  run(
    `UPDATE agents SET status = 'standby', updated_at = ? 
     WHERE id IN (
       SELECT agent_id FROM openclaw_sessions 
       WHERE task_id = ? AND status = 'active'
     )`,
    [now, taskId]
  );

  // Close sessions
  run(
    `UPDATE openclaw_sessions SET status = 'completed', ended_at = ? 
     WHERE task_id = ? AND status = 'active'`,
    [now, taskId]
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