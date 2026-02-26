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
  
  // Update task status
  const now = new Date().toISOString();
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
