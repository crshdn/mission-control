import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run, getDb, queryAll } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import { extractJSON, getMessagesFromOpenClaw } from '@/lib/planning-utils';
import { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';
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

function parsePlanningPayload(content: string): {
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
} | null {
  const parsed = extractJSON(content) as {
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

  if (parsed) return parsed;

  const normalized = content
    .replace(/<\/?think>/gi, ' ')
    .replace(/<\/?final>/gi, ' ')
    .trim();
  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(normalized.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

// Helper to handle planning completion with proper error handling
async function handlePlanningCompletion(taskId: string, parsed: any, messages: any[]) {
  const db = getDb();
  let dispatchError: string | null = null;
  let firstAgentId: string | null = null;

  // Transaction 1: Save planning data, create agents, AND assign agent to task
  // (Assigning before dispatch fixes the chicken-and-egg bug where dispatch
  // checks assigned_agent_id and fails because it wasn't set yet)
  const transaction = db.transaction(() => {
    const allowDynamicAgents = process.env.ALLOW_DYNAMIC_AGENTS !== 'false';

    if (allowDynamicAgents && parsed.agents && parsed.agents.length > 0) {
      // Get the master agent's session_key_prefix to use for new agents
      const task = db.prepare('SELECT workspace_id FROM tasks WHERE id = ?').get(taskId) as { workspace_id: string } | undefined;
      const masterAgent = task ? db.prepare(
        `SELECT session_key_prefix FROM agents WHERE is_master = 1 AND workspace_id = ? ORDER BY created_at ASC LIMIT 1`
      ).get(task.workspace_id) as { session_key_prefix?: string } | undefined : undefined;
      
      const sessionKeyPrefix = masterAgent?.session_key_prefix || 'agent:main:';

      const insertAgent = db.prepare(`
        INSERT INTO agents (id, workspace_id, name, role, description, avatar_emoji, status, soul_md, session_key_prefix, created_at, updated_at)
        VALUES (?, (SELECT workspace_id FROM tasks WHERE id = ?), ?, ?, ?, ?, 'standby', ?, ?, datetime('now'), datetime('now'))
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
          agent.soul_md || '',
          sessionKeyPrefix
        );
      }
    } else if (!allowDynamicAgents && parsed.agents && parsed.agents.length > 0) {
      console.log(`[Planning Poll] Dynamic agent generation disabled (ALLOW_DYNAMIC_AGENTS=false), skipping creation of ${parsed.agents.length} agent(s)`);
    }

    // Save planning data + assign the first agent + mark complete in one atomic step
    db.prepare(`
      UPDATE tasks
      SET planning_messages = ?,
          planning_spec = ?,
          planning_agents = ?,
          planning_complete = 1,
          assigned_agent_id = ?,
          status = 'assigned',
          planning_dispatch_error = NULL,
          updated_at = datetime('now')
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

  firstAgentId = transaction();

  // Re-check for other orchestrators before dispatching
  if (firstAgentId) {
    const task = queryOne<{ workspace_id: string }>('SELECT workspace_id FROM tasks WHERE id = ?', [taskId]);
    if (task) {
      const defaultMaster = queryOne<{ id: string }>(
        `SELECT id FROM agents WHERE is_master = 1 AND workspace_id = ? ORDER BY created_at ASC LIMIT 1`,
        [task.workspace_id]
      );
      const otherOrchestrators = queryAll<{ id: string; name: string }>(
        `SELECT id, name FROM agents WHERE is_master = 1 AND id != ? AND workspace_id = ? AND status != 'offline'`,
        [defaultMaster?.id ?? '', task.workspace_id]
      );

      if (otherOrchestrators.length > 0) {
        dispatchError = `Cannot auto-dispatch: ${otherOrchestrators.length} other orchestrator(s) available in workspace`;
        console.warn(`[Planning Poll] ${dispatchError}:`, otherOrchestrators.map(o => o.name).join(', '));
        firstAgentId = null;
      }
    }
  }

  // Idempotency check — only skip dispatch if the agent has actually started working.
  // A task stuck in 'in_progress' with no recent activity means a prior dispatch was
  // silently lost (e.g. broken WebSocket) and MUST be retried.
  let skipDispatch = false;
  if (firstAgentId) {
    const currentTask = queryOne<{ status: string; updated_at: string }>('SELECT status, updated_at FROM tasks WHERE id = ?', [taskId]);
    if (currentTask?.status === 'in_progress') {
      // Check for any agent activity since dispatch — if none, allow re-dispatch
      const recentActivity = queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM task_activities WHERE task_id = ? AND created_at > datetime('now', '-2 minutes')`,
        [taskId]
      );
      if (recentActivity && recentActivity.cnt > 0) {
        console.log('[Planning Poll] Task in progress with recent agent activity, skipping dispatch');
        skipDispatch = true;
      } else {
        console.log('[Planning Poll] Task in_progress but no recent agent activity — retrying dispatch (likely lost message)');
        // Reset to assigned so dispatch can proceed cleanly
        run('UPDATE tasks SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['assigned', taskId]);
      }
    }
  }

  // Trigger dispatch using proper URL resolution
  if (firstAgentId && !skipDispatch) {
    const missionControlUrl = getMissionControlUrl();
    const dispatchUrl = `${missionControlUrl}/api/tasks/${taskId}/dispatch`;
    console.log(`[Planning Poll] Triggering dispatch: ${dispatchUrl}`);

    try {
      const dispatchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.MC_API_TOKEN) {
        dispatchHeaders['Authorization'] = `Bearer ${process.env.MC_API_TOKEN}`;
      }

      const dispatchRes = await fetch(dispatchUrl, {
        method: 'POST',
        headers: dispatchHeaders,
        signal: AbortSignal.timeout(30_000),
      });

      if (dispatchRes.ok) {
        console.log(`[Planning Poll] Dispatch successful`);
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

  // On dispatch failure: keep planning data intact, just record the error.
  // Task stays in 'assigned' so user can retry dispatch without re-planning.
  if (dispatchError) {
    run(
      `UPDATE tasks SET planning_dispatch_error = ?, status_reason = ?, updated_at = datetime('now') WHERE id = ?`,
      [dispatchError, 'Dispatch failed: ' + dispatchError, taskId]
    );
    console.log(`[Planning Poll] Dispatch failed for task ${taskId}, planning data preserved: ${dispatchError}`);
  } else if (!firstAgentId) {
    // No agent created — move to inbox for manual assignment
    run(
      `UPDATE tasks SET status = 'inbox', planning_dispatch_error = NULL, updated_at = datetime('now') WHERE id = ?`,
      [taskId]
    );
  }

  // Broadcast task update
  const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (updatedTask) {
    broadcast({ type: 'task_updated', payload: updatedTask });
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
          const parsed = parsePlanningPayload(msg.content);

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

          // Extract current question if present (be tolerant if options are missing)
          if (parsed && parsed.question) {
            const normalizedOptions = Array.isArray(parsed.options) && parsed.options.length > 0
              ? parsed.options
              : [
                  { id: 'continue', label: 'Continue' },
                  { id: 'other', label: 'Other' },
                ];
            console.log('[Planning Poll] Found question with', normalizedOptions.length, 'options');
            currentQuestion = {
              question: parsed.question,
              options: normalizedOptions,
            };
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

    // FALLBACK: Check if the last stored message is actually a completion that was
    // saved but never processed (race condition where message was stored but
    // extractJSON failed or the completion handler never fired).
    const lastAssistantMsg = [...messages].reverse().find((m: any) => m.role === 'assistant');
    if (lastAssistantMsg) {
      const parsed = parsePlanningPayload(lastAssistantMsg.content);
      if (parsed && parsed.status === 'complete') {
        console.log('[Planning Poll] FALLBACK: Found unprocessed completion in stored messages — handling now');
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
    }

    // Check for stale planning — if no new messages for >10 minutes, flag it
    const lastMsgTimestamp = messages.length > 0 ? messages[messages.length - 1].timestamp : null;
    const stalePlanningMs = 10 * 60 * 1000; // 10 minutes
    const isStalePlanning = lastMsgTimestamp && (Date.now() - lastMsgTimestamp) > stalePlanningMs;

    console.log('[Planning Poll] No new messages found', isStalePlanning ? '(STALE — over 10min since last message)' : '');
    return NextResponse.json({ 
      hasUpdates: false,
      stalePlanning: isStalePlanning || undefined,
      staleSinceMs: isStalePlanning ? (Date.now() - lastMsgTimestamp) : undefined,
    });
  } catch (error) {
    console.error('Failed to poll for updates:', error);
    return NextResponse.json({ error: 'Failed to poll for updates' }, { status: 500 });
  }
}
