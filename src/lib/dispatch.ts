/**
 * Shared task dispatch logic
 * Used by both the API route (POST /api/tasks/[id]/dispatch) and the daemon dispatcher.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from './db';
import { getOpenClawClient } from './openclaw/client';
import { getProjectsPath, getMissionControlUrl } from './config';
import type { Task, Agent, OpenClawSession } from './types';

export interface DispatchResult {
  success: boolean;
  taskId?: string;
  agentId?: string;
  sessionId?: string;
  updatedTask?: Task;
  updatedAgent?: Agent;
  error?: string;
}

export async function dispatchTaskToAgent(taskId: string): Promise<DispatchResult> {
  // Get task with agent info
  const task = queryOne<Task & { assigned_agent_name?: string; is_master?: number }>(
    `SELECT t.*, a.name as assigned_agent_name, a.is_master
     FROM tasks t
     LEFT JOIN agents a ON t.assigned_agent_id = a.id
     WHERE t.id = ?`,
    [taskId]
  );

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  if (!task.assigned_agent_id) {
    return { success: false, error: 'Task has no assigned agent' };
  }

  const agent = queryOne<Agent>(
    'SELECT * FROM agents WHERE id = ?',
    [task.assigned_agent_id]
  );

  if (!agent) {
    return { success: false, error: 'Assigned agent not found' };
  }

  // Connect to OpenClaw Gateway
  const client = getOpenClawClient();
  if (!client.isConnected()) {
    try {
      await client.connect();
    } catch {
      return { success: false, error: 'Failed to connect to OpenClaw Gateway' };
    }
  }

  // Get or create OpenClaw session for this agent
  let session = queryOne<OpenClawSession>(
    'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
    [agent.id, 'active']
  );

  const now = new Date().toISOString();

  if (!session) {
    const sessionId = uuidv4();
    const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;

    run(
      `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, agent.id, openclawSessionId, 'mission-control', 'active', now, now]
    );

    session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE id = ?',
      [sessionId]
    );

    run(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'agent_status_changed', agent.id, `${agent.name} session created`, now]
    );
  }

  if (!session) {
    return { success: false, error: 'Failed to create agent session' };
  }

  // Build task message
  const priorityEmoji = {
    low: '\u{1F535}',
    normal: '\u26AA',
    high: '\u{1F7E1}',
    urgent: '\u{1F534}'
  }[task.priority] || '\u26AA';

  const projectsPath = getProjectsPath();
  const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taskProjectDir = `${projectsPath}/${projectDir}`;
  const missionControlUrl = getMissionControlUrl();

  const taskMessage = `${priorityEmoji} **NEW TASK ASSIGNED**

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}
**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}
**Task ID:** ${task.id}

**OUTPUT DIRECTORY:** ${taskProjectDir}
Create this directory and save all deliverables there.

**IMPORTANT:** After completing work, you MUST call these APIs:
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Description of what was done"}
2. Register deliverable: POST ${missionControlUrl}/api/tasks/${task.id}/deliverables
   Body: {"deliverable_type": "file", "title": "File name", "path": "${taskProjectDir}/filename.html"}
3. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "review"}

When complete, reply with:
\`TASK_COMPLETE: [brief summary of what you did]\`

If you need help or clarification, ask me (Charlie).`;

  try {
    const sessionKey = `agent:main:${session.openclaw_session_id}`;
    await client.call('chat.send', {
      sessionKey,
      message: taskMessage,
      idempotencyKey: `dispatch-${task.id}-${Date.now()}`
    });

    // Update task status to in_progress
    run(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
      ['in_progress', now, taskId]
    );

    const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    // Update agent status to working
    run(
      'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
      ['working', now, agent.id]
    );

    const updatedAgent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [agent.id]);

    // Log dispatch event
    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'task_dispatched',
        agent.id,
        task.id,
        `Task "${task.title}" dispatched to ${agent.name}`,
        now
      ]
    );

    return {
      success: true,
      taskId: task.id,
      agentId: agent.id,
      sessionId: session.openclaw_session_id,
      updatedTask: updatedTask || undefined,
      updatedAgent: updatedAgent || undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to send task to agent: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }
}
