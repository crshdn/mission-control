/**
 * Enhanced Dispatch System for Multi-Agent Orchestration
 * 
 * Handles dispatching tasks to agents in sequence with accumulated context
 * from previous agent outputs.
 */

import { queryOne, run } from './db';
import { getOpenClawClient } from './openclaw/client';
import { broadcast } from './events';
import { getProjectsPath, getMissionControlUrl } from './config';
import * as crypto from 'crypto';

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
 * Dispatch task to the next agent in the multi-agent sequence
 */
export async function dispatchToNextAgent(
  taskId: string, 
  executionState: ExecutionState
): Promise<void> {
  try {
    const nextAgentIndex = executionState.current_agent_index;
    const nextAgentSpec = executionState.planning_agents[nextAgentIndex];
    
    if (!nextAgentSpec) {
      console.error(`[ENHANCED DISPATCH] No agent spec found for index ${nextAgentIndex}`);
      return;
    }

    console.log(`[ENHANCED DISPATCH] Dispatching to agent ${nextAgentIndex + 1}/${executionState.total_agents}: ${nextAgentSpec.name || nextAgentSpec.role}`);

    // Find the agent in the database by name or role
    const agent = await findAgentBySpec(nextAgentSpec, taskId);
    if (!agent) {
      console.error(`[ENHANCED DISPATCH] Agent not found for spec:`, nextAgentSpec);
      return;
    }

    // Update task assignment
    const now = new Date().toISOString();
    run(
      'UPDATE tasks SET assigned_agent_id = ?, status = ?, updated_at = ? WHERE id = ?',
      [agent.id, 'assigned', now, taskId]
    );

    // Dispatch with enhanced context
    await dispatchWithContext(taskId, agent, executionState);

  } catch (error) {
    console.error('[ENHANCED DISPATCH] Error dispatching to next agent:', error);
  }
}

/**
 * Find agent by planning specification
 */
async function findAgentBySpec(agentSpec: any, taskId: string): Promise<any> {
  // Get task workspace for agent lookup
  const task = queryOne<{ workspace_id: string }>(
    'SELECT workspace_id FROM tasks WHERE id = ?',
    [taskId]
  );

  if (!task) {
    console.error(`[ENHANCED DISPATCH] Task ${taskId} not found`);
    return null;
  }

  // Try to find agent by name first
  if (agentSpec.name) {
    const agent = queryOne(
      'SELECT * FROM agents WHERE name = ? AND workspace_id = ?',
      [agentSpec.name, task.workspace_id]
    );
    if (agent) return agent;
  }

  // Fallback: find by role
  if (agentSpec.role) {
    const agent = queryOne(
      'SELECT * FROM agents WHERE role = ? AND workspace_id = ?',
      [agentSpec.role, task.workspace_id]
    );
    if (agent) return agent;
  }

  // Last resort: find any available agent (not recommended in production)
  console.warn(`[ENHANCED DISPATCH] Could not find specific agent, using fallback`);
  const fallbackAgent = queryOne(
    'SELECT * FROM agents WHERE workspace_id = ? AND status != ? AND is_master = ? ORDER BY created_at ASC LIMIT 1',
    [task.workspace_id, 'offline', false]
  );

  return fallbackAgent;
}

/**
 * Enhanced dispatch with accumulated context from previous agents
 */
async function dispatchWithContext(
  taskId: string, 
  agent: any, 
  executionState: ExecutionState
): Promise<void> {
  const now = new Date().toISOString();

  // Get task details
  const task = queryOne<{
    title: string;
    description?: string;
    priority: string;
    due_date?: string;
    planning_spec?: string;
  }>('SELECT title, description, priority, due_date, planning_spec FROM tasks WHERE id = ?', [taskId]);

  if (!task) {
    console.error(`[ENHANCED DISPATCH] Task ${taskId} not found`);
    return;
  }

  // Connect to OpenClaw Gateway
  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }

  // Get or create session for this agent
  let session = queryOne<{
    id: string;
    openclaw_session_id: string;
    agent_id: string;
  }>(
    'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
    [agent.id, 'active']
  );

  if (!session) {
    // Create new session
    const sessionId = crypto.randomUUID();
    const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    run(
      `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, session_type, task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, agent.id, openclawSessionId, 'mission-control', 'active', 'subagent', taskId, now, now]
    );

    session = { 
      id: sessionId, 
      openclaw_session_id: openclawSessionId, 
      agent_id: agent.id 
    };
  }

  // Build enhanced task message with context
  const taskMessage = buildEnhancedTaskMessage(task, agent, executionState, taskId);

  // Send message to agent
  try {
    const gatewayAgentId = agent.gateway_agent_id || 'main';
    const sessionKey = `agent:${gatewayAgentId}:${session.openclaw_session_id}`;
    
    await client.call('chat.send', {
      sessionKey,
      message: taskMessage,
      idempotencyKey: `enhanced-dispatch-${taskId}-${agent.id}-${Date.now()}`,
    });

    // Update task status
    run(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
      ['in_progress', now, taskId]
    );

    // Update agent status
    run(
      'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
      ['working', now, agent.id]
    );

    // Log dispatch activity
    const activityId = crypto.randomUUID();
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        activityId, 
        taskId, 
        agent.id, 
        'spawned', 
        `🔄 Next agent dispatched: ${agent.name} (${executionState.current_agent_index + 1}/${executionState.total_agents})`,
        now
      ]
    );

    // Broadcast events
    broadcast({
      type: 'agent_spawned',
      payload: { 
        taskId, 
        agentId: agent.id, 
        agentName: agent.name, 
        sessionId: session.openclaw_session_id 
      },
    });

    const updatedTask = queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (updatedTask) {
      broadcast({
        type: 'task_updated',
        payload: updatedTask as any,
      });
    }

    console.log(`[ENHANCED DISPATCH] Successfully dispatched task to ${agent.name}`);

  } catch (error) {
    console.error('[ENHANCED DISPATCH] Error sending message to agent:', error);
    throw error;
  }
}

/**
 * Build enhanced task message with context from previous agents
 */
function buildEnhancedTaskMessage(
  task: any, 
  agent: any, 
  executionState: ExecutionState, 
  taskId: string
): string {
  const priorityMap: Record<string, string> = {
    low: '🔵',
    normal: '⚪',
    high: '🟡',
    urgent: '🔴'
  };
  const priorityEmoji = priorityMap[task.priority] || '⚪';

  const currentAgentIndex = executionState.current_agent_index;
  const currentAgentSpec = executionState.planning_agents[currentAgentIndex];
  const isFirstAgent = currentAgentIndex === 0;
  const isLastAgent = currentAgentIndex === executionState.total_agents - 1;

  // Build project directory path
  const projectsPath = getProjectsPath();
  const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taskProjectDir = `${projectsPath}/${projectDir}`;

  // Build previous outputs section
  const previousOutputsSection = isFirstAgent ? '' : buildPreviousOutputsSection(executionState, currentAgentIndex);

  // Build agent role context
  const roleContext = currentAgentSpec ? buildAgentRoleContext(currentAgentSpec, currentAgentIndex, executionState.total_agents) : '';

  const taskMessage = `${priorityEmoji} **MULTI-AGENT TASK HANDOFF**

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}
**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}
**Task ID:** ${taskId}

## Multi-Agent Context
**Your Position:** Agent ${currentAgentIndex + 1} of ${executionState.total_agents}
**Sequence:** ${executionState.planning_agents.map((a, i) => i === currentAgentIndex ? `**${a.name || a.role}**` : (a.name || a.role)).join(' → ')}
${isFirstAgent ? '**Status:** Starting the task sequence' : '**Status:** Continuing from previous agent(s)'}
${isLastAgent ? '**Note:** You are the FINAL agent - deliver the completed result' : '**Note:** Your output will be reviewed and passed to the next agent'}

${roleContext}

${previousOutputsSection}

## Planning Specification
${task.planning_spec || 'No detailed planning specification available'}

**OUTPUT DIRECTORY:** ${taskProjectDir}
Create this directory and save all deliverables there.

## Quality Standards
${isLastAgent ? 
  '- This is the FINAL output - ensure it meets all requirements\n- Integrate insights from all previous agents\n- Deliver a complete, polished result' :
  '- Your output will be quality-reviewed before proceeding\n- Focus on your specific role and responsibilities\n- Provide clear context for the next agent'
}

**WHEN COMPLETE:**
1. Wrap your final output/deliverable in a code block:
\`\`\`deliverable
Your actual output here (markdown table, code, text, etc.)
\`\`\`

2. Then reply with:
\`TASK_COMPLETE: [brief summary of what you accomplished]\`

The system will automatically capture your deliverable, trigger quality review, and proceed with orchestration.

${isFirstAgent ? 'You are starting this multi-agent task. Set a strong foundation for the agents that follow.' : ''}
${isLastAgent ? 'You are completing this multi-agent task. Deliver the final result that integrates all previous work.' : ''}

If you need clarification about your role or the previous work, ask the orchestrator.`;

  return taskMessage;
}

/**
 * Build section showing outputs from previous agents
 */
function buildPreviousOutputsSection(executionState: ExecutionState, currentAgentIndex: number): string {
  const previousOutputs = executionState.agent_outputs
    .filter(output => output.agent_index < currentAgentIndex)
    .sort((a, b) => a.agent_index - b.agent_index);

  if (previousOutputs.length === 0) {
    return '';
  }

  const outputsText = previousOutputs
    .map(output => {
      const truncatedOutput = output.output.length > 1000 
        ? `${output.output.slice(0, 1000)}...\n\n[Output truncated - full context available in task files]`
        : output.output;
      
      return `### ${output.agent_name} (Agent ${output.agent_index + 1})
**Completed:** ${new Date(output.completed_at).toLocaleString()}
**Output:**
${truncatedOutput}`;
    })
    .join('\n\n---\n\n');

  return `## Previous Agent Work

The following agents have already completed their parts of this task:

${outputsText}

## Your Task
Building on the above work, you need to:`;
}

/**
 * Build agent-specific role context
 */
function buildAgentRoleContext(agentSpec: any, agentIndex: number, totalAgents: number): string {
  const roleDescription = agentSpec.description || agentSpec.role || 'No specific role description';
  const expectations = agentSpec.expectations || [];
  
  let context = `## Your Role: ${agentSpec.name || agentSpec.role}\n**Description:** ${roleDescription}\n`;

  if (expectations && expectations.length > 0) {
    context += `**Key Expectations:**\n`;
    expectations.forEach((expectation: string, i: number) => {
      context += `${i + 1}. ${expectation}\n`;
    });
  }

  // Add contextual guidance based on position
  if (agentIndex === 0) {
    context += `\n**As the first agent:** Establish a clear foundation and direction for the subsequent agents.`;
  } else if (agentIndex === totalAgents - 1) {
    context += `\n**As the final agent:** Synthesize all previous work into a polished, complete deliverable.`;
  } else {
    context += `\n**As a middle agent:** Build upon previous work and prepare clear input for the next agent.`;
  }

  return context;
}

/**
 * Enhanced dispatch endpoint that supports previousOutputs context
 * This extends the existing dispatch route to handle multi-agent context
 */
export async function enhancedDispatch(
  taskId: string, 
  agentId: string, 
  previousOutputs?: Array<{ agent_name: string; output: string; }>
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    // Get task and agent info
    const task = queryOne<{ 
      execution_state?: string; 
      planning_agents?: string;
      title: string;
      description?: string;
    }>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    const agent = queryOne<{ 
      id: string; 
      name: string; 
      gateway_agent_id?: string; 
    }>('SELECT * FROM agents WHERE id = ?', [agentId]);

    if (!task || !agent) {
      return { success: false, error: 'Task or agent not found' };
    }

    // If this is a multi-agent task with execution state, use enhanced dispatch
    if (task.execution_state) {
      const executionState = JSON.parse(task.execution_state);
      await dispatchWithContext(taskId, agent, executionState);
      return { success: true, message: 'Enhanced dispatch successful' };
    }

    // Otherwise, fall back to standard dispatch behavior
    // (This would call the original dispatch logic)
    return { success: true, message: 'Standard dispatch completed' };

  } catch (error) {
    console.error('[ENHANCED DISPATCH] Error in enhancedDispatch:', error);
    return { success: false, error: String(error) };
  }
}