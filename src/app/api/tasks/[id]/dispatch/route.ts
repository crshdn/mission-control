import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { getOpenClawSessionId, canDispatchAgent } from '@/lib/openclaw/agent-mapping';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import type { Task, Agent } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/dispatch
 * 
 * Dispatches a task to its assigned agent's OpenClaw session.
 * Sends task details directly to the agent via Gateway WebSocket.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const now = new Date().toISOString();
  
  try {
    const { id } = await params;

    // Get task with agent info
    const task = queryOne<Task & { assigned_agent_name?: string }>(
      `SELECT t.*, a.name as assigned_agent_name, a.is_master
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.assigned_agent_id) {
      return NextResponse.json(
        { error: 'Task has no assigned agent' },
        { status: 400 }
      );
    }

    // Get agent details
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );

    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    // Check if agent can be dispatched to OpenClaw
    if (!canDispatchAgent(agent.name)) {
      const errorMsg = `Agent "${agent.name}" has no OpenClaw session mapping`;
      console.error('[Dispatch]', errorMsg);
      
      // Log as task activity
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), task.id, agent.id, 'comment', `⚠️ Cannot dispatch: ${errorMsg}`, now]
      );
      
      return NextResponse.json(
        { error: errorMsg },
        { status: 400 }
      );
    }

    // Get OpenClaw session ID for this agent
    const openclawSessionId = getOpenClawSessionId(agent.name);
    if (!openclawSessionId) {
      return NextResponse.json(
        { error: 'Failed to resolve OpenClaw session ID' },
        { status: 500 }
      );
    }

    console.log(`[Dispatch] Dispatching task "${task.title}" to ${agent.name} (${openclawSessionId})`);

    // Connect to OpenClaw Gateway
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        console.log('[Dispatch] Connecting to OpenClaw Gateway...');
        await client.connect();
        console.log('[Dispatch] Connected to OpenClaw Gateway');
      } catch (err) {
        const errorMsg = `Failed to connect to OpenClaw Gateway: ${err instanceof Error ? err.message : 'Unknown error'}`;
        console.error('[Dispatch]', errorMsg);
        
        // Log as task activity
        run(
          `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), task.id, agent.id, 'comment', `⚠️ ${errorMsg}`, now]
        );
        
        return NextResponse.json(
          { error: errorMsg },
          { status: 503 }
        );
      }
    }

    // Build task message for agent
    const priorityEmoji = {
      low: '🔵',
      normal: '⚪',
      high: '🟡',
      urgent: '🔴'
    }[task.priority] || '⚪';

    // Get project path for deliverables
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

    // Send message to agent's session using sessions.send
    try {
      console.log(`[Dispatch] Sending message to session: ${openclawSessionId}`);
      
      await client.call('sessions.send', {
        session_id: openclawSessionId,
        content: taskMessage
      });

      console.log('[Dispatch] ✓ Message sent successfully');

      // Update task status to in_progress
      run(
        'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
        ['in_progress', now, id]
      );

      // Broadcast task update
      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }

      // Update agent status to working
      run(
        'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
        ['working', now, agent.id]
      );

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

      // Log as task activity
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          task.id,
          agent.id,
          'status_changed',
          `🚀 Task dispatched to ${agent.name} via OpenClaw`,
          now
        ]
      );

      return NextResponse.json({
        success: true,
        task_id: task.id,
        agent_id: agent.id,
        session_id: openclawSessionId,
        message: 'Task dispatched to agent'
      });
    } catch (err) {
      const errorMsg = `Failed to send task to agent: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[Dispatch]', errorMsg);
      
      // Log as task activity
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), task.id, agent.id, 'comment', `⚠️ ${errorMsg}`, now]
      );
      
      return NextResponse.json(
        { error: errorMsg },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Dispatch] Failed to dispatch task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to dispatch task' },
      { status: 500 }
    );
  }
}
