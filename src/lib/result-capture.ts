/**
 * Enhanced Result Capture Utility
 * 
 * Handles both single-agent and multi-agent task completion flows.
 * For multi-agent tasks, triggers Polly review instead of auto-completion.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { queryOne, run } from './db';
import { broadcast } from './events';
// Note: triggerPollyReview removed - Polly now picks up 'review' status tasks during heartbeat
import type { OpenClawSession } from './types';

interface SessionMessage {
  type: string;
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }> | string;
  };
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
  planning_agents: any[]; // Reference to original spec
}

/**
 * Read session history from the JSONL file directly
 * Searches for the task ID in session files to find the right session
 */
function readSessionHistory(sessionKey: string, taskId?: string, gatewayAgentId?: string): Array<{ role: string; content: string }> {
  const openclawDir = path.join(os.homedir(), '.openclaw');
  
  // Extract agent ID from sessionKey if not provided
  // Format: agent:{gatewayAgentId}:{sessionId}
  if (!gatewayAgentId && sessionKey.startsWith('agent:')) {
    const parts = sessionKey.split(':');
    if (parts.length >= 2) {
      gatewayAgentId = parts[1];
    }
  }
  
  // Default to 'main' if we can't determine the agent
  const agentDir = gatewayAgentId || 'main';
  const sessionsDir = path.join(openclawDir, 'agents', agentDir, 'sessions');
  
  // Check if directory exists
  if (!fs.existsSync(sessionsDir)) {
    console.log(`[RESULT CAPTURE] Sessions directory not found: ${sessionsDir}`);
    return [];
  }
  
  // Find session files - look for task ID or session key
  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(sessionsDir, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first
  
  const messages: Array<{ role: string; content: string }> = [];
  
  for (const { name: file } of files) {
    const filePath = path.join(sessionsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    // Check if this file contains our task ID or session key
    const hasTaskId = taskId && content.includes(taskId);
    const hasSessionKey = content.includes(sessionKey);
    if (!hasTaskId && !hasSessionKey) continue;
    
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
 * Check if task is multi-agent based on planning_agents field
 */
function isMultiAgentTask(task: any): boolean {
  if (!task.planning_agents) return false;
  
  try {
    const planningAgents = JSON.parse(task.planning_agents);
    return Array.isArray(planningAgents) && planningAgents.length > 1;
  } catch {
    return false;
  }
}

/**
 * Initialize execution state for multi-agent task
 */
function initializeExecutionState(task: any): ExecutionState {
  let planningAgents = [];
  try {
    planningAgents = JSON.parse(task.planning_agents || '[]');
  } catch {
    planningAgents = [];
  }

  return {
    current_agent_index: 0,
    total_agents: planningAgents.length,
    agent_outputs: [],
    revision_count: 0,
    max_revisions: 3,
    planning_agents: planningAgents,
  };
}

/**
 * Store agent output in execution state and determine next action
 */
async function handleMultiAgentCompletion(taskId: string, agentOutputText: string, agentInfo: any): Promise<void> {
  const now = new Date().toISOString();
  
  // Get current task with execution state
  const task = queryOne<{ 
    execution_state?: string; 
    planning_agents?: string;
    assigned_agent_id?: string;
  }>('SELECT execution_state, planning_agents, assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
  
  if (!task) {
    console.error(`[MULTI-AGENT] Task ${taskId} not found`);
    return;
  }

  // Initialize or parse execution state
  let executionState: ExecutionState;
  if (task.execution_state) {
    try {
      executionState = JSON.parse(task.execution_state);
    } catch {
      executionState = initializeExecutionState(task);
    }
  } else {
    executionState = initializeExecutionState(task);
  }

  // Add current agent output to execution state
  const agentOutput = {
    agent_index: executionState.current_agent_index,
    agent_id: agentInfo.id,
    agent_name: agentInfo.name,
    output: agentOutputText,
    completed_at: now,
    revision_count: 0, // Reset for new agent
  };

  // Find existing output for this agent (for revision tracking)
  const existingOutputIndex = executionState.agent_outputs.findIndex(
    output => output.agent_index === executionState.current_agent_index
  );

  if (existingOutputIndex >= 0) {
    // This is a revision - increment count
    agentOutput.revision_count = executionState.agent_outputs[existingOutputIndex].revision_count + 1;
    executionState.agent_outputs[existingOutputIndex] = agentOutput;
  } else {
    // New agent output
    executionState.agent_outputs.push(agentOutput);
  }

  // Update execution state in database
  run(
    'UPDATE tasks SET execution_state = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(executionState), now, taskId]
  );

  console.log(`[MULTI-AGENT] Stored output for agent ${agentInfo.name} (index ${executionState.current_agent_index})`);
  
  // Set task to 'review' status for Polly to pick up during heartbeat
  // This replaces the broken synchronous triggerPollyReview approach
  run(
    'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
    ['review', now, taskId]
  );
  
  // Log activity for visibility
  const activityId = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [activityId, taskId, agentInfo.id, 'review_requested', `🔍 ${agentInfo.name} completed - awaiting Polly QC review`, now]
  );
  
  console.log(`[MULTI-AGENT] Task ${taskId} moved to 'review' status for Polly QC`);
}

/**
 * Attempt to capture the result from an agent's session history.
 * Enhanced to handle multi-agent orchestration with Polly review.
 */
export async function captureResultFromSession(taskId: string): Promise<string | null> {
  try {
    // Check if task already has a result
    const task = queryOne<{ 
      result?: string;
      planning_agents?: string;
      execution_state?: string;
    }>('SELECT result, planning_agents, execution_state FROM tasks WHERE id = ?', [taskId]);
    
    if (!task) {
      console.log(`[RESULT CAPTURE] Task ${taskId} not found`);
      return null;
    }

    if (task.result) {
      console.log(`[RESULT CAPTURE] Task ${taskId} already has result, skipping session capture`);
      return task.result;
    }

    // Check if this is a multi-agent task
    const isMultiAgent = isMultiAgentTask(task);
    console.log(`[RESULT CAPTURE] Task ${taskId} is ${isMultiAgent ? 'multi-agent' : 'single-agent'}`);

    // Find the active session for this task
    const session = queryOne<OpenClawSession & { gateway_agent_id?: string }>(
      `SELECT s.*, a.gateway_agent_id, a.name as agent_name, a.id as agent_id
       FROM openclaw_sessions s
       LEFT JOIN agents a ON s.agent_id = a.id
       WHERE s.task_id = ? OR (s.agent_id IN (
         SELECT assigned_agent_id FROM tasks WHERE id = ?
       ))
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [taskId, taskId]
    );

    if (!session) {
      console.log(`[RESULT CAPTURE] No session found for task ${taskId}`);
      return null;
    }

    // Read session history
    const history = readSessionHistory(session.openclaw_session_id, taskId, session.gateway_agent_id);
    console.log(`[RESULT CAPTURE] Found ${history.length} messages for task ${taskId}`);
    
    if (!history || history.length === 0) {
      console.log(`[RESULT CAPTURE] No history found for session ${session.openclaw_session_id}`);
      return null;
    }

    // Extract result from session history
    let result: string | null = null;
    
    // Search backwards through messages for deliverable blocks or TASK_COMPLETE
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const content = msg.content;
      
      // Priority: Look for ```deliverable block
      const deliverableMatch = content.match(/```deliverable\n([\s\S]*?)```/);
      if (deliverableMatch) {
        result = deliverableMatch[1].trim();
        console.log(`[RESULT CAPTURE] Found deliverable block in session history`);
        break;
      }
      
      // Alternative: ```output block
      const outputMatch = content.match(/```output\n([\s\S]*?)```/);
      if (outputMatch) {
        result = outputMatch[1].trim();
        console.log(`[RESULT CAPTURE] Found output block in session history`);
        break;
      }
      
      // TASK_COMPLETE pattern
      const taskCompleteMatch = content.match(/TASK_COMPLETE:\s*(.+?)(?:\n|$)/i);
      if (taskCompleteMatch) {
        result = taskCompleteMatch[1].trim();
        console.log(`[RESULT CAPTURE] Found TASK_COMPLETE in session history`);
        break;
      }
      
      // Fallback: Last substantial message
      if (i === history.length - 1 && content.length > 100) {
        result = content.slice(0, 2000);
        if (content.length > 2000) {
          result += '... [truncated]';
        }
        console.log(`[RESULT CAPTURE] Using last assistant message as result`);
        break;
      }
    }

    if (!result) {
      console.log(`[RESULT CAPTURE] No result found in session history`);
      return null;
    }

    const now = new Date().toISOString();
    
    // Get agent info for logging
    const agent = queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM agents WHERE id = ?',
      [session.agent_id]
    );

    if (!agent) {
      console.error(`[RESULT CAPTURE] Agent not found for session ${session.id}`);
      return null;
    }

    // **BRANCH: Multi-agent vs Single-agent handling**
    if (isMultiAgent) {
      // Multi-agent: Store in execution_state and trigger Polly review
      await handleMultiAgentCompletion(taskId, result, agent);
      
      // Mark session as completed but don't auto-complete the task
      run(
        `UPDATE openclaw_sessions SET status = 'completed', ended_at = ? WHERE id = ?`,
        [now, session.id]
      );
      
      // Log activity but don't mark as completed yet
      const activityId = crypto.randomUUID();
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [activityId, taskId, agent.id, 'updated', `${agent.name} completed their part: ${result.slice(0, 200)}${result.length > 200 ? '...' : ''}`, now]
      );
      
      console.log(`[RESULT CAPTURE] Multi-agent task - stored output and triggered Polly review`);
    } else {
      // Single-agent: Original auto-completion behavior
      run(
        `UPDATE tasks SET result = ?, result_captured_at = ?, updated_at = ? WHERE id = ?`,
        [result, now, now, taskId]
      );
      
      // Mark session as completed
      run(
        `UPDATE openclaw_sessions SET status = 'completed', ended_at = ? WHERE id = ?`,
        [now, session.id]
      );
      
      // Log completion activity
      const activityId = crypto.randomUUID();
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [activityId, taskId, agent.id, 'completed', `${agent.name} completed: ${result.slice(0, 200)}${result.length > 200 ? '...' : ''}`, now]
      );
      
      console.log(`[RESULT CAPTURE] Single-agent task - auto-completed`);
    }

    // Update agent status back to standby in both cases
    run(
      `UPDATE agents SET status = 'standby', updated_at = ? WHERE id = ?`,
      [now, agent.id]
    );
    
    // Broadcast agent completed event for real-time UI updates
    broadcast({
      type: 'agent_completed',
      payload: { taskId, agentId: agent.id, agentName: agent.name, sessionId: session.openclaw_session_id },
    });

    return result;
  } catch (err) {
    console.error('[RESULT CAPTURE] Error capturing result from session:', err);
    return null;
  }
}

/**
 * Parse and store result from a completion message.
 * Called when activity_type "completed" is logged or when agent sends TASK_COMPLETE.
 */
export function storeTaskResult(taskId: string, resultText: string): void {
  const now = new Date().toISOString();
  
  // Only store if no result exists yet
  run(
    `UPDATE tasks SET result = ?, result_captured_at = ?, updated_at = ? 
     WHERE id = ? AND result IS NULL`,
    [resultText, now, now, taskId]
  );
}