import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run, getDb, queryAll } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { extractJSON, getMessagesFromOpenClaw } from '@/lib/planning-utils';
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
async function handlePlanningCompletion(taskId: string, parsed: any, messages: any[]) {
  const db = getDb();
  let dispatchError: string | null = null;
  let firstAgentId: string | null = null;

  // Wrap all database operations in a transaction for atomicity
  // Set status to 'pending_dispatch' first - don't mark as complete until dispatch succeeds
  const transaction = db.transaction(() => {
    // Look up existing agents by name - DO NOT create new ones
    // Polly returns agent names like "Mason", "Scout" - we need to find the existing agent records
    if (parsed.agents && parsed.agents.length > 0) {
      const task = db.prepare('SELECT workspace_id FROM tasks WHERE id = ?').get(taskId) as { workspace_id: string } | undefined;
      
      for (const agent of parsed.agents) {
        // Look up by name (case-insensitive) - agents were imported from OpenClaw gateway
        const existingAgent = db.prepare(`
          SELECT id, gateway_agent_id FROM agents 
          WHERE LOWER(name) = LOWER(?) 
          AND (workspace_id = ? OR workspace_id = 'default')
          AND gateway_agent_id IS NOT NULL
          LIMIT 1
        `).get(agent.name, task?.workspace_id || 'default') as { id: string; gateway_agent_id: string } | undefined;

        if (existingAgent) {
          if (!firstAgentId) firstAgentId = existingAgent.id;
          console.log(`[Planning] Found existing agent "${agent.name}" -> ${existingAgent.id} (gateway: ${existingAgent.gateway_agent_id})`);
        } else {
          console.warn(`[Planning] Agent "${agent.name}" not found in database - skipping (agent must be imported from gateway first)`);
        }
      }
    }

    // Update task with completion data AND assign the first agent
    // CRITICAL: assigned_agent_id must be set BEFORE dispatch is attempted,
    // because the dispatch endpoint checks for it and fails if null
    db.prepare(`
      UPDATE tasks
      SET planning_messages = ?,
          planning_spec = ?,
          planning_agents = ?,
          assigned_agent_id = ?,
          status = 'pending_dispatch',
          planning_dispatch_error = NULL
      WHERE id = ?
    `).run(
      JSON.stringify(messages),
      JSON.stringify(parsed.spec),
      JSON.stringify(parsed.agents),
      firstAgentId,
      taskId
    );

    return firstAgentId;
  });

  // Execute the transaction to create agents, assign agent, and set pending_dispatch status
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

  // Check if task was already dispatched (idempotency - prevents duplicate dispatches from multiple polls)
  // Use execution_state as the indicator - it's only set by the dispatch endpoint after successful dispatch
  let skipDispatch = false;
  if (firstAgentId) {
    const currentTask = queryOne<{ execution_state?: string }>(
      'SELECT execution_state FROM tasks WHERE id = ?',
      [taskId]
    );
    if (currentTask?.execution_state) {
      console.log('[Planning Poll] Task already dispatched (has execution_state), skipping dispatch');
      dispatchError = null;
      skipDispatch = true; // Skip the HTTP dispatch call, but still mark as complete
    }
  }

  // Trigger dispatch - use localhost since we're in the same process
  if (firstAgentId && !skipDispatch) {
    // MC runs on port 4000 by default (set in package.json dev script)
    const port = process.env.PORT || process.env.MC_PORT || '4000';
    const dispatchUrl = `http://localhost:${port}/api/tasks/${taskId}/dispatch`;
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
      // Keep assigned_agent_id set so retry-dispatch can work
      db.prepare(`
        UPDATE tasks
        SET planning_dispatch_error = ?,
            status = 'assigned',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(dispatchError, taskId);
    } else if (firstAgentId) {
      // Success - mark complete (agent already assigned in initial transaction)
      db.prepare(`
        UPDATE tasks
        SET planning_complete = 1,
            status = 'in_progress',
            planning_dispatch_error = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(taskId);
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
            hasSkip: !!(parsed as any)?.skip,
            status: parsed?.status,
            question: parsed?.question?.substring(0, 50),
            rawPreview: msg.content?.substring(0, 200)
          });

          // Handle skip response from Polly
          // Format: {"skip": true, "reason": "...", "dispatch_to": "Mason"}
          if (parsed && (parsed as any).skip === true) {
            const skipData = parsed as { skip: boolean; reason?: string; dispatch_to?: string };
            console.log('[Planning Poll] Skip requested:', skipData.reason, '-> dispatch to:', skipData.dispatch_to);

            // Look up agent by name
            let agentId: string | null = null;
            if (skipData.dispatch_to) {
              const agent = queryOne<{ id: string }>(
                `SELECT id FROM agents WHERE LOWER(name) = LOWER(?) AND gateway_agent_id IS NOT NULL LIMIT 1`,
                [skipData.dispatch_to]
              );
              if (agent) {
                agentId = agent.id;
                console.log('[Planning Poll] Found agent:', skipData.dispatch_to, '->', agentId);
              } else {
                console.warn('[Planning Poll] Agent not found:', skipData.dispatch_to);
              }
            }

            // Update task - mark planning complete, assign agent
            run(`
              UPDATE tasks 
              SET planning_complete = 1,
                  planning_messages = ?,
                  assigned_agent_id = ?,
                  status = ?
              WHERE id = ?
            `, [JSON.stringify(messages), agentId, agentId ? 'assigned' : 'inbox', taskId]);

            // Dispatch if we have an agent
            let dispatchError: string | null = null;
            if (agentId) {
              const port = process.env.PORT || process.env.MC_PORT || '4000';
              const dispatchUrl = `http://localhost:${port}/api/tasks/${taskId}/dispatch`;
              try {
                const dispatchRes = await fetch(dispatchUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                });
                if (dispatchRes.ok) {
                  console.log('[Planning Poll] Skip dispatch successful');
                } else {
                  dispatchError = `Dispatch failed: ${await dispatchRes.text()}`;
                  console.error('[Planning Poll]', dispatchError);
                }
              } catch (err) {
                dispatchError = `Dispatch error: ${(err as Error).message}`;
                console.error('[Planning Poll]', dispatchError);
              }
            }

            // Broadcast update
            const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
            if (updatedTask) {
              broadcast({ type: 'task_updated', payload: updatedTask });
            }

            return NextResponse.json({
              hasUpdates: true,
              complete: true,
              skipped: true,
              skipReason: skipData.reason,
              dispatchedTo: skipData.dispatch_to,
              autoDispatched: !!agentId,
              dispatchError,
              messages,
            });
          }

          if (parsed && parsed.status === 'complete') {
            // Handle completion
            console.log('[Planning Poll] Planning complete, handling...');
            const { firstAgentId, parsed: fullParsed, dispatchError } = await handlePlanningCompletion(taskId, parsed, messages);

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
