import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run, getDb, queryAll } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { extractJSON, getMessagesFromOpenClaw } from '@/lib/planning-utils';
import { getMissionControlUrl } from '@/lib/config';
import { Task } from '@/lib/types';

// Planning timeout and poll interval configuration with validation
const PLANNING_TIMEOUT_MS = parseInt(process.env.PLANNING_TIMEOUT_MS || '30000', 10);
const PLANNING_POLL_INTERVAL_MS = parseInt(process.env.PLANNING_POLL_INTERVAL_MS || '2000', 10);

// Validate environment variables
if (isNaN(PLANNING_TIMEOUT_MS) || PLANNING_TIMEOUT_MS < 1000) {
  throw new Error('PLANNING_TIMEOUT_MS must be a valid number >= 1000ms');
}
if (isNaN(PLANNING_POLL_INTERVAL_MS) || PLANNING_POLL_INTERVAL_MS < 100) {
  throw new Error('PLANNING_POLL_INTERVAL_MS must be a valid number >= 100ms');
}

// Helper to handle planning completion with proper error handling and rollback
async function handlePlanningCompletion(
  taskId: string,
  parsed: any,
  messages: any[],
  requestOrigin?: string,
) {
  const db = getDb();
  let dispatchError: string | null = null;
  let firstAgentId: string | null = null;

  // Wrap all database operations in a transaction for atomicity
  // Set status to 'pending_dispatch' first - don't mark as complete until dispatch succeeds
  const transaction = db.transaction(() => {
    // Update task with completion data but keep planning_complete = 0 until dispatch succeeds
    db.prepare(`
      UPDATE tasks
      SET planning_messages = ?,
          planning_spec = ?,
          planning_agents = ?,
          status = 'pending_dispatch',
          planning_dispatch_error = NULL
      WHERE id = ?
    `).run(
      JSON.stringify(messages),
      JSON.stringify(parsed.spec),
      JSON.stringify(parsed.agents),
      taskId
    );

    // Create the agents in the workspace and track first agent for auto-assign
    if (parsed.agents && parsed.agents.length > 0) {
      const insertAgent = db.prepare(`
        INSERT INTO agents (id, workspace_id, name, role, description, avatar_emoji, status, soul_md, created_at, updated_at)
        VALUES (?, (SELECT workspace_id FROM tasks WHERE id = ?), ?, ?, ?, ?, 'standby', ?, datetime('now'), datetime('now'))
      `);

      for (const agent of parsed.agents) {
        const agentId = crypto.randomUUID();
        if (!firstAgentId) firstAgentId = agentId;

        insertAgent.run(
          agentId,
          taskId,
          agent.name,
          agent.role,
          agent.instructions || '',
          agent.avatar_emoji || '🤖',
          agent.soul_md || ''
        );
      }
    }

    // Pre-assign the first generated agent so /dispatch can resolve assigned_agent_id.
    // If dispatch fails, status remains pending_dispatch and can be retried safely.
    if (firstAgentId) {
      db.prepare(`
        UPDATE tasks
        SET assigned_agent_id = ?
        WHERE id = ?
      `).run(firstAgentId, taskId);
    }

    return firstAgentId;
  });

  // Execute the transaction to create agents and set pending_dispatch status
  firstAgentId = transaction();

  // Re-check for other orchestrators before dispatching (prevents race condition)
  if (firstAgentId) {
    const task = queryOne<{ workspace_id: string }>('SELECT workspace_id FROM tasks WHERE id = ?', [taskId]);
    if (task) {
      const defaultMaster = queryOne<{ id: string }>(
        `SELECT id FROM agents WHERE is_master = 1 AND workspace_id = ? ORDER BY created_at ASC LIMIT 1`,
        [task.workspace_id]
      );
      const otherOrchestrators = queryAll<{ id: string; name: string }>(
        `SELECT id, name
         FROM agents
         WHERE is_master = 1
         AND id != ?
         AND workspace_id = ?
         AND status != 'offline'`,
        [defaultMaster?.id ?? '', task.workspace_id]
      );

      if (otherOrchestrators.length > 0) {
        dispatchError = `Cannot auto-dispatch: ${otherOrchestrators.length} other orchestrator(s) available in workspace`;
        console.warn(`[Planning Poll] ${dispatchError}:`, otherOrchestrators.map(o => o.name).join(', '));
        firstAgentId = null; // Don't dispatch
      }
    }
  }

  // Check if task is already assigned (idempotency - prevents duplicate dispatches from multiple polls)
  let skipDispatch = false;
  if (firstAgentId) {
    const currentTask = queryOne<{ assigned_agent_id?: string }>(
      'SELECT assigned_agent_id FROM tasks WHERE id = ?',
      [taskId]
    );
    if (currentTask?.assigned_agent_id) {
      console.log('[Planning Poll] Task already assigned to', currentTask.assigned_agent_id, ', skipping dispatch');
      firstAgentId = currentTask.assigned_agent_id;
      dispatchError = null;
      skipDispatch = true; // Skip the HTTP dispatch call, but still mark as complete
    }
  }

  // Trigger dispatch - use localhost since we're in the same process
  if (firstAgentId && !skipDispatch) {
    const baseUrl = requestOrigin || getMissionControlUrl();
    const dispatchUrl = `${baseUrl}/api/tasks/${taskId}/dispatch`;
    console.log(`[Planning Poll] Triggering dispatch: ${dispatchUrl}`);

    try {
      const dispatchRes = await fetch(dispatchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (dispatchRes.ok) {
        const dispatchData = await dispatchRes.json();
        console.log(`[Planning Poll] Dispatch successful:`, dispatchData);
      } else {
        const errorText = await dispatchRes.text();
        dispatchError = `Dispatch failed (${dispatchRes.status}): ${errorText}`;
        console.error(`[Planning Poll] ${dispatchError}`);
      }
    } catch (err) {
      dispatchError = `Dispatch error: ${(err as Error).message}`;
      console.error(`[Planning Poll] ${dispatchError}`);
    }
  }

  // Final transaction: mark as complete or store error for retry
  db.transaction(() => {
    if (dispatchError) {
      // Store the error but don't mark as complete - user can retry
      db.prepare(`
        UPDATE tasks
        SET planning_dispatch_error = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(dispatchError, taskId);
    } else if (firstAgentId) {
      // Success - mark complete and assign
      db.prepare(`
        UPDATE tasks
        SET planning_complete = 1,
            assigned_agent_id = ?,
            status = 'inbox',
            planning_dispatch_error = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(firstAgentId, taskId);
      console.log(`[Planning Poll] Planning complete and dispatched to agent ${firstAgentId}`);
    } else {
      // No agent to dispatch to, but planning is complete
      db.prepare(`
        UPDATE tasks
        SET planning_complete = 1,
            status = 'inbox',
            planning_dispatch_error = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(taskId);
    }
  })();

  // Broadcast task update
  const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (updatedTask) {
    broadcast({
      type: 'task_updated',
      payload: updatedTask,
    });
  }

  return { firstAgentId, parsed, dispatchError };
}

// GET /api/tasks/[id]/planning/poll - Check for new messages from OpenClaw
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const task = queryOne<{
      id: string;
      planning_session_key?: string;
      planning_messages?: string;
      planning_complete?: number;
      planning_dispatch_error?: string;
    }>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task || !task.planning_session_key) {
      return NextResponse.json({ error: 'Planning session not found' }, { status: 404 });
    }

    if (task.planning_complete) {
      return NextResponse.json({ hasUpdates: false, isComplete: true });
    }

    // Return dispatch error if present (allows user to see/ retry failed dispatch)
    if (task.planning_dispatch_error) {
      return NextResponse.json({
        hasUpdates: true,
        dispatchError: task.planning_dispatch_error,
      });
    }

    const messages = task.planning_messages ? JSON.parse(task.planning_messages) : [];
    // Count only assistant messages for comparison, since OpenClaw only returns assistant messages
    const initialAssistantCount = messages.filter((m: any) => m.role === 'assistant').length;

    console.log('[Planning Poll] Task', taskId, 'has', messages.length, 'total messages,', initialAssistantCount, 'assistant messages');

    // Check OpenClaw for new messages (lightweight check, not a loop)
    const openclawMessages = await getMessagesFromOpenClaw(task.planning_session_key);

    console.log('[Planning Poll] Comparison: stored_assistant=', initialAssistantCount, 'openclaw_assistant=', openclawMessages.length);

    if (openclawMessages.length > initialAssistantCount) {
      let currentQuestion = null;
      const newMessages = openclawMessages.slice(initialAssistantCount);
      console.log('[Planning Poll] Processing', newMessages.length, 'new messages');

      // Find new assistant messages
      for (const msg of newMessages) {
        console.log('[Planning Poll] Processing new message, role:', msg.role, 'content length:', msg.content?.length || 0);

        if (msg.role === 'assistant') {
          const lastMessage = { role: 'assistant', content: msg.content, timestamp: Date.now() };
          messages.push(lastMessage);

          // Check if this message contains completion status or a question
          const parsed = extractJSON(msg.content) as {
            status?: string;
            question?: string;
            options?: Array<{ id: string; label: string }>;
            spec?: object;
            agents?: Array<{
              name: string;
              role: string;
              avatar_emoji?: string;
              soul_md?: string;
              instructions?: string;
            }>;
            execution_plan?: object;
          } | null;

          console.log('[Planning Poll] Parsed message content:', {
            hasStatus: !!parsed?.status,
            hasQuestion: !!parsed?.question,
            hasOptions: !!parsed?.options,
            status: parsed?.status,
            question: parsed?.question?.substring(0, 50),
            rawPreview: msg.content?.substring(0, 200)
          });

          if (parsed && parsed.status === 'complete') {
            // Handle completion
            console.log('[Planning Poll] Planning complete, handling...');
            const { firstAgentId, parsed: fullParsed, dispatchError } = await handlePlanningCompletion(
              taskId,
              parsed,
              messages,
              request.nextUrl.origin,
            );

            return NextResponse.json({
              hasUpdates: true,
              complete: true,
              spec: fullParsed.spec,
              agents: fullParsed.agents,
              executionPlan: fullParsed.execution_plan,
              messages,
              autoDispatched: !!firstAgentId,
              dispatchError,
            });
          }

          // Extract current question if present
          if (parsed && parsed.question && parsed.options) {
            console.log('[Planning Poll] Found question with', parsed.options.length, 'options');
            currentQuestion = parsed;
          }
        }
      }

      console.log('[Planning Poll] Returning updates: currentQuestion =', currentQuestion ? 'YES' : 'NO');

      // Update database
      run('UPDATE tasks SET planning_messages = ? WHERE id = ?', [JSON.stringify(messages), taskId]);

      return NextResponse.json({
        hasUpdates: true,
        complete: false,
        messages,
        currentQuestion,
      });
    }

    console.log('[Planning Poll] No new messages found');
    return NextResponse.json({ hasUpdates: false });
  } catch (error) {
    console.error('Failed to poll for updates:', error);
    return NextResponse.json({ error: 'Failed to poll for updates' }, { status: 500 });
  }
}
