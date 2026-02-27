/**
 * Completion Listener - Monitors sub-agent sessions for TASK_COMPLETE
 * 
 * This module maintains a persistent connection to OpenClaw and listens
 * for agent messages. When TASK_COMPLETE is detected, it triggers
 * result-capture to update the task status.
 */

import { getOpenClawClient } from './openclaw/client';
import { captureResultFromSession } from './result-capture';
import { queryOne, queryAll, run } from './db';
import { broadcast } from './events';

// Track which sessions we're monitoring
const monitoredSessions = new Map<string, {
  taskId: string;
  agentId: string;
  lastCheckedAt: number;
}>();

// Polling interval (check every 10 seconds)
const POLL_INTERVAL_MS = 10000;
let pollTimer: NodeJS.Timeout | null = null;
let isPolling = false;

/**
 * Start monitoring for task completions
 */
export function startCompletionListener(): void {
  if (pollTimer) return;
  
  console.log('[COMPLETION LISTENER] Starting...');
  pollTimer = setInterval(pollForCompletions, POLL_INTERVAL_MS);
  
  // Also do an immediate poll
  pollForCompletions();
}

/**
 * Stop the completion listener
 */
export function stopCompletionListener(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  monitoredSessions.clear();
  console.log('[COMPLETION LISTENER] Stopped');
}

/**
 * Register a session for monitoring
 */
export function registerSessionForMonitoring(
  sessionId: string, 
  taskId: string, 
  agentId: string
): void {
  monitoredSessions.set(sessionId, {
    taskId,
    agentId,
    lastCheckedAt: Date.now()
  });
  console.log(`[COMPLETION LISTENER] Registered session ${sessionId} for task ${taskId}`);
}

/**
 * Poll all monitored sessions for TASK_COMPLETE
 */
async function pollForCompletions(): Promise<void> {
  if (isPolling) return;
  isPolling = true;
  
  try {
    // Get all in_progress tasks with sessions
    const tasks = queryAll<{
      id: string;
      title: string;
      assigned_agent_id: string;
    }>(`
      SELECT t.id, t.title, t.assigned_agent_id 
      FROM tasks t 
      WHERE t.status = 'in_progress' 
      AND t.assigned_agent_id IS NOT NULL
    `);
    
    if (tasks.length === 0) {
      return;
    }
    
    // Check each task's session for TASK_COMPLETE
    for (const task of tasks) {
      try {
        await checkTaskForCompletion(task.id, task.assigned_agent_id);
      } catch (err) {
        console.error(`[COMPLETION LISTENER] Error checking task ${task.id}:`, err);
      }
    }
  } finally {
    isPolling = false;
  }
}

/**
 * Check if a specific task has been completed by its agent
 */
async function checkTaskForCompletion(taskId: string, agentId: string): Promise<void> {
  // Get agent details and task dispatch time
  const agent = queryOne<{
    gateway_agent_id: string;
    name: string;
  }>('SELECT gateway_agent_id, name FROM agents WHERE id = ?', [agentId]);
  
  if (!agent) return;
  
  // Get task dispatch time to only look for TASK_COMPLETE after dispatch
  const task = queryOne<{
    updated_at: string;
  }>('SELECT updated_at FROM tasks WHERE id = ?', [taskId]);
  
  if (!task) return;
  
  const taskDispatchTime = new Date(task.updated_at).getTime();
  
  const gatewayAgentId = agent.gateway_agent_id || 'main';
  
  // Map gateway_agent_id to folder name
  const folderMap: Record<string, string> = {
    'builder': 'builder',
    'researcher': 'researcher', 
    'creative': 'creative',
    'marketing': 'marketing',
    'finance': 'finance'
  };
  const folder = folderMap[gatewayAgentId] || 'main';
  
  // Find recent session file
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  const sessionsDir = path.join(os.homedir(), '.openclaw', 'agents', folder, 'sessions');
  
  if (!fs.existsSync(sessionsDir)) return;
  
  // Get most recent session file
  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      path: path.join(sessionsDir, f),
      mtime: fs.statSync(path.join(sessionsDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime);
  
  if (files.length === 0) return;
  
  // Check most recent file(s) for TASK_COMPLETE
  const recentFile = files[0];
  
  // Only check files modified in the last hour
  if (Date.now() - recentFile.mtime > 60 * 60 * 1000) return;
  
  const content = fs.readFileSync(recentFile.path, 'utf-8');
  
  // Parse JSONL to find TASK_COMPLETE messages AFTER task dispatch
  const lines = content.split('\n').filter(line => line.trim());
  let foundCompletion = false;
  let completionSummary = 'Task completed';
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const entryTime = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
      
      // Only consider messages after task dispatch
      if (entryTime < taskDispatchTime) continue;
      
      // Only check assistant messages (not dispatch instructions)
      if (entry.message?.role !== 'assistant') continue;
      
      // Check if this message contains TASK_COMPLETE
      const msgContent = JSON.stringify(entry.message?.content || '');
      if (msgContent.includes('TASK_COMPLETE')) {
        const match = msgContent.match(/TASK_COMPLETE:\s*([^"\\]+)/);
        if (match) {
          completionSummary = match[1].trim();
          foundCompletion = true;
          break;
        }
      }
    } catch {
      // Skip invalid JSON lines
    }
  }
  
  if (!foundCompletion) return;
  
  console.log(`[COMPLETION LISTENER] Found TASK_COMPLETE for task ${taskId}: ${completionSummary.slice(0, 50)}...`);
  
  const now = new Date().toISOString();
  
  // Check if this is a multi-agent task
  const taskData = queryOne<{ execution_state?: string }>('SELECT execution_state FROM tasks WHERE id = ?', [taskId]);
  
  if (taskData?.execution_state) {
    try {
      const state = JSON.parse(taskData.execution_state);
      const currentIndex = state.current_agent_index || 0;
      const totalAgents = state.total_agents || 1;
      const planningAgents = state.planning_agents || [];
      
      // Store output from current agent
      if (!state.agent_outputs) state.agent_outputs = [];
      state.agent_outputs.push({
        agent: planningAgents[currentIndex]?.name || 'Unknown',
        output: completionSummary,
        completed_at: now
      });
      
      // Check if more agents in chain
      if (currentIndex < totalAgents - 1) {
        // Advance to next agent
        const nextIndex = currentIndex + 1;
        const nextAgent = planningAgents[nextIndex];
        
        console.log(`[COMPLETION LISTENER] Multi-agent task: advancing from agent ${currentIndex} to ${nextIndex} (${nextAgent?.name})`);
        
        // Update execution state
        state.current_agent_index = nextIndex;
        
        // Find the next agent's ID
        const nextAgentRecord = queryOne<{ id: string }>(
          'SELECT id FROM agents WHERE LOWER(name) = LOWER(?) LIMIT 1',
          [nextAgent?.name]
        );
        
        if (nextAgentRecord) {
          // Log activity for current agent completion
          const activityId1 = crypto.randomUUID();
          run(
            `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [activityId1, taskId, agentId, 'completed', `${agent.name} completed: ${completionSummary}`, now]
          );
          
          // Update task for next agent
          run(
            `UPDATE tasks 
             SET assigned_agent_id = ?,
                 execution_state = ?,
                 status = 'assigned',
                 updated_at = ?
             WHERE id = ?`,
            [nextAgentRecord.id, JSON.stringify(state), now, taskId]
          );
          
          // Trigger dispatch to next agent
          const port = process.env.PORT || process.env.MC_PORT || '4000';
          fetch(`http://localhost:${port}/api/tasks/${taskId}/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).then(res => {
            console.log(`[COMPLETION LISTENER] Dispatched to next agent ${nextAgent?.name}: ${res.status}`);
          }).catch(err => {
            console.error(`[COMPLETION LISTENER] Failed to dispatch to next agent:`, err);
          });
          
          // Broadcast update
          const updatedTask = queryOne<any>('SELECT * FROM tasks WHERE id = ?', [taskId]);
          if (updatedTask) {
            broadcast({ type: 'task_updated', payload: updatedTask });
          }
          
          return; // Don't mark as done yet
        }
      }
      
      // Final agent completed - update state and mark done
      run(
        `UPDATE tasks 
         SET execution_state = ?,
             updated_at = ?
         WHERE id = ?`,
        [JSON.stringify(state), now, taskId]
      );
    } catch (parseErr) {
      console.error(`[COMPLETION LISTENER] Failed to parse execution_state:`, parseErr);
    }
  }
  
  // Mark task as done (either single-agent or final agent in chain)
  run(
    `UPDATE tasks 
     SET status = 'done', 
         result = ?, 
         result_captured_at = ?,
         updated_at = ?
     WHERE id = ? AND status = 'in_progress'`,
    [completionSummary, now, now, taskId]
  );
  
  // Log activity
  const activityId = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [activityId, taskId, agentId, 'completed', `Task completed: ${completionSummary}`, now]
  );
  
  // Broadcast update
  const updatedTask = queryOne<any>('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (updatedTask) {
    broadcast({
      type: 'task_updated',
      payload: updatedTask,
    });
  }
  
  console.log(`[COMPLETION LISTENER] Task ${taskId} marked as done`);
}

// Auto-start when module is imported
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  // Delay start to allow server to initialize
  setTimeout(() => {
    startCompletionListener();
  }, 5000);
}
