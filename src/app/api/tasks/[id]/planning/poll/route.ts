import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run, getDb } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';

// Helper to extract JSON from a response that might have markdown code blocks or surrounding text
function extractJSON(text: string): object | null {
  // First, try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {
    // Continue to other methods
  }

  // Try to extract from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // Try to find JSON object in the text (first { to last })
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue
    }
  }

  return null;
}

// Helper to get messages from OpenClaw API
async function getMessagesFromOpenClaw(sessionKey: string): Promise<Array<{ role: string; content: string }>> {
  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    // Use chat.history API to get session messages
    const result = await client.call<{ messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }> }>('chat.history', {
      sessionKey,
      limit: 50,
    });

    console.log('[Planning Poll] OpenClaw returned', result.messages?.length || 0, 'total messages');

    const messages: Array<{ role: string; content: string }> = [];

    for (const msg of result.messages || []) {
      if (msg.role === 'assistant') {
        const textContent = msg.content?.find((c) => c.type === 'text');
        if (textContent?.text) {
          console.log('[Planning Poll] Found assistant message, length:', textContent.text.length);
          messages.push({
            role: 'assistant',
            content: textContent.text
          });
        }
      }
    }

    console.log('[Planning Poll] Extracted', messages.length, 'assistant messages');
    return messages;
  } catch (err) {
    console.error('[Planning Poll] Failed to get messages from OpenClaw:', err);
    return [];
  }
}

// Helper to handle planning completion
async function handlePlanningCompletion(taskId: string, parsed: any, messages: any[]) {
  const db = getDb();

  // Wrap all database operations in a transaction for atomicity
  const transaction = db.transaction(() => {
    // Update task with completion data
    db.prepare(`
      UPDATE tasks
      SET planning_messages = ?,
          planning_complete = 1,
          planning_spec = ?,
          planning_agents = ?,
          status = 'inbox'
      WHERE id = ?
    `).run(
      JSON.stringify(messages),
      JSON.stringify(parsed.spec),
      JSON.stringify(parsed.agents),
      taskId
    );

    // Create the agents in the workspace and track first agent for auto-assign
    let firstAgentId: string | null = null;

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

    // AUTO-DISPATCH: Assign to first agent
    if (firstAgentId) {
      db.prepare(`
        UPDATE tasks SET assigned_agent_id = ? WHERE id = ?
      `).run(firstAgentId, taskId);

      console.log(`[Planning Poll] Auto-assigned task ${taskId} to agent ${firstAgentId}`);
    }

    return firstAgentId;
  });

  // Execute the transaction
  const firstAgentId = transaction();

  // Trigger dispatch - use localhost since we're in the same process
  // (Outside transaction since it's an HTTP call)
  if (firstAgentId) {
    const dispatchUrl = `http://localhost:${process.env.PORT || 3000}/api/tasks/${taskId}/dispatch`;
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
        console.error(`[Planning Poll] Dispatch failed (${dispatchRes.status}):`, errorText);
      }
    } catch (err) {
      console.error('[Planning Poll] Auto-dispatch error:', err);
    }
  }

  // Broadcast task update
  const updatedTask = queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (updatedTask) {
    broadcast({
      type: 'task_updated',
      payload: updatedTask,
    });
  }

  return { firstAgentId, parsed };
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
    }>('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task || !task.planning_session_key) {
      return NextResponse.json({ error: 'Planning session not found' }, { status: 404 });
    }

    if (task.planning_complete) {
      return NextResponse.json({ hasUpdates: false, isComplete: true });
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
            const { firstAgentId, parsed: fullParsed } = await handlePlanningCompletion(taskId, parsed, messages);

            return NextResponse.json({
              hasUpdates: true,
              complete: true,
              spec: fullParsed.spec,
              agents: fullParsed.agents,
              executionPlan: fullParsed.execution_plan,
              messages,
              autoDispatched: !!firstAgentId,
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
