import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { extractJSON } from '@/lib/planning-utils';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import { v4 as uuidv4 } from 'uuid';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/planning/force-complete
 * 
 * Force-completes a stuck planning session by scanning stored messages
 * for the completion JSON and triggering dispatch. Used when the normal
 * poll loop fails to detect completion (race condition).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: taskId } = await params;

    const task = queryOne<{
      id: string;
      title: string;
      planning_messages?: string;
      planning_complete?: number;
      planning_session_key?: string;
      workspace_id: string;
    }>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.planning_complete) {
      return NextResponse.json({ error: 'Planning is already complete' }, { status: 400 });
    }

    const messages = task.planning_messages ? JSON.parse(task.planning_messages) : [];
    
    // Scan messages from the end looking for the completion JSON
    let completionParsed: { status?: string; agents?: { name: string; role: string; description: string; instructions?: string; avatar_emoji?: string; soul_md?: string }[]; spec?: Record<string, unknown> } | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const parsed = extractJSON(messages[i].content) as { status?: string; agents?: { name: string; role: string; description: string; instructions?: string; avatar_emoji?: string; soul_md?: string }[]; spec?: Record<string, unknown> } | null;
        if (parsed && parsed.status === 'complete') {
          completionParsed = parsed;
          break;
        }
      }
    }

    if (!completionParsed) {
      // No completion found in stored messages — mark as complete anyway
      // so the user isn't stuck, but skip agent creation
      logger.info(`[Force Complete] No completion JSON found for task ${taskId} — marking complete without spec`);
      run(
        `UPDATE tasks SET planning_complete = 1, status = 'inbox', 
         status_reason = 'Force-completed by user (no completion spec found)', 
         updated_at = datetime('now') WHERE id = ?`,
        [taskId]
      );

      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (updatedTask) broadcast({ type: 'task_updated', payload: updatedTask });

      return NextResponse.json({ 
        success: true, 
        message: 'Planning force-completed. No spec was found — task moved to inbox for manual assignment.',
        dispatched: false,
      });
    }

    // Found completion JSON — create agents, save spec, dispatch
    logger.info(`[Force Complete] Found completion JSON for task ${taskId} — processing`);

    const allowDynamicAgents = process.env.ALLOW_DYNAMIC_AGENTS !== 'false';
    let firstAgentId: string | null = null;

    if (allowDynamicAgents && (completionParsed?.agents?.length ?? 0) > 0) {
      const masterAgent = queryOne<{ session_key_prefix?: string }>(
        `SELECT session_key_prefix FROM agents WHERE is_master = 1 AND workspace_id = ? ORDER BY created_at ASC LIMIT 1`,
        [task.workspace_id]
      );
      const sessionKeyPrefix = masterAgent?.session_key_prefix || 'agent:main:';

      for (const agent of completionParsed?.agents || []) {
        const agentId = crypto.randomUUID();
        if (!firstAgentId) firstAgentId = agentId;

        run(
          `INSERT INTO agents (id, workspace_id, name, role, description, avatar_emoji, status, soul_md, session_key_prefix, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'standby', ?, ?, datetime('now'), datetime('now'))`,
          [agentId, task.workspace_id, agent.name, agent.role, agent.instructions || '', agent.avatar_emoji || '🤖', agent.soul_md || '', sessionKeyPrefix]
        );
      }
    }

    // Update task
    run(
      `UPDATE tasks SET 
         planning_complete = 1,
         planning_spec = ?,
         planning_agents = ?,
         assigned_agent_id = ?,
         status = 'assigned',
         planning_dispatch_error = NULL,
         status_reason = 'Force-completed by user',
         updated_at = datetime('now')
       WHERE id = ?`,
      [
        JSON.stringify(completionParsed.spec || {}),
        JSON.stringify(completionParsed.agents || []),
        firstAgentId,
        taskId,
      ]
    );

    // Log the force-complete
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, 'status_changed', 'Planning force-completed by user — dispatching', datetime('now'))`,
      [uuidv4(), taskId, firstAgentId]
    );

    // Dispatch
    let dispatched = false;
    let dispatchError: string | null = null;

    if (firstAgentId) {
      const missionControlUrl = getMissionControlUrl();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.AUTENSA_API_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.AUTENSA_API_TOKEN}`;
      }

      try {
        const res = await fetch(`${missionControlUrl}/api/tasks/${taskId}/dispatch`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          dispatched = true;
          logger.info(`[Force Complete] Dispatch successful for task ${taskId}`);
        } else {
          dispatchError = await res.text();
          logger.error(`[Force Complete] Dispatch failed: ${dispatchError}`);
          run(
            `UPDATE tasks SET planning_dispatch_error = ?, updated_at = datetime('now') WHERE id = ?`,
            [`Force-complete dispatch failed: ${dispatchError.substring(0, 200)}`, taskId]
          );
        }
      } catch (err) {
        dispatchError = (err as Error).message;
        logger.error(`[Force Complete] Dispatch error: ${dispatchError}`);
      }
    }

    const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (updatedTask) broadcast({ type: 'task_updated', payload: updatedTask });

    return NextResponse.json({
      success: true,
      message: dispatched
        ? 'Planning force-completed and task dispatched.'
        : dispatchError
          ? `Planning force-completed but dispatch failed: ${dispatchError}`
          : 'Planning force-completed. No agent created — task moved to assigned.',
      dispatched,
      dispatchError,
    });
  } catch (error) {
    logger.error('[Force Complete] Error:', error);
    return NextResponse.json({ error: 'Failed to force-complete planning' }, { status: 500 });
  }
}
