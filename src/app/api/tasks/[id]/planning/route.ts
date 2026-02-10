import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
// File system imports removed - using OpenClaw API instead

// Planning session prefix for OpenClaw (must match agent:main: format)
const PLANNING_SESSION_PREFIX = 'agent:main:planning:';

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
      limit: 20,
    });
    
    const messages: Array<{ role: string; content: string }> = [];
    
    for (const msg of result.messages || []) {
      if (msg.role === 'assistant') {
        // Extract text content from assistant messages
        const textContent = msg.content?.find((c) => c.type === 'text');
        if (textContent?.text) {
          messages.push({
            role: 'assistant',
            content: textContent.text
          });
        }
      }
    }
    
    console.log('[Planning] Found', messages.length, 'assistant messages via API');
    return messages;
  } catch (err) {
    console.error('[Planning] Failed to get messages from OpenClaw:', err);
    return [];
  }
}

// GET /api/tasks/[id]/planning - Get planning state
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string;
      title: string;
      description: string;
      status: string;
      planning_session_key?: string;
      planning_messages?: string;
      planning_complete?: number;
      planning_spec?: string;
      planning_agents?: string;
    } | undefined;
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Parse planning messages from JSON
    const messages = task.planning_messages ? JSON.parse(task.planning_messages) : [];
    
    // Find the latest question (last assistant message with question structure)
    let lastAssistantMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'assistant');
    let currentQuestion = null;
    
    // If no assistant response in DB but session exists, check OpenClaw for new messages
    if (!lastAssistantMessage && task.planning_session_key && messages.length > 0) {
      console.log('[Planning GET] No assistant message in DB, checking OpenClaw...');
      const openclawMessages = await getMessagesFromOpenClaw(task.planning_session_key);
      if (openclawMessages.length > 0) {
        const newAssistant = [...openclawMessages].reverse().find(m => m.role === 'assistant');
        if (newAssistant) {
          console.log('[Planning GET] Found assistant message in OpenClaw, syncing to DB');
          messages.push({ role: 'assistant', content: newAssistant.content, timestamp: Date.now() });
          getDb().prepare('UPDATE tasks SET planning_messages = ? WHERE id = ?')
            .run(JSON.stringify(messages), taskId);
          lastAssistantMessage = { role: 'assistant', content: newAssistant.content };
        }
      }
    }
    
    if (lastAssistantMessage) {
      // Use extractJSON to handle code blocks and surrounding text
      const parsed = extractJSON(lastAssistantMessage.content);
      if (parsed && 'question' in parsed) {
        currentQuestion = parsed;
      }
    }

    return NextResponse.json({
      taskId,
      sessionKey: task.planning_session_key,
      messages,
      currentQuestion,
      isComplete: !!task.planning_complete,
      spec: task.planning_spec ? JSON.parse(task.planning_spec) : null,
      agents: task.planning_agents ? JSON.parse(task.planning_agents) : null,
      isStarted: messages.length > 0,
    });
  } catch (error) {
    console.error('Failed to get planning state:', error);
    return NextResponse.json({ error: 'Failed to get planning state' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/planning - Start planning session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string;
      title: string;
      description: string;
      status: string;
      planning_session_key?: string;
      planning_messages?: string;
    } | undefined;
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if planning already started
    if (task.planning_session_key) {
      return NextResponse.json({ error: 'Planning already started', sessionKey: task.planning_session_key }, { status: 400 });
    }

    // Create session key for this planning task
    const sessionKey = `${PLANNING_SESSION_PREFIX}${taskId}`;

    // Build the initial planning prompt
    const planningPrompt = `PLANNING REQUEST

Task Title: ${task.title}
Task Description: ${task.description || 'No description provided'}

You are starting a planning session for this task. Read PLANNING.md for your protocol.

Generate your FIRST question to understand what the user needs. Remember:
- Questions must be multiple choice
- Include an "Other" option
- Be specific to THIS task, not generic

Respond with ONLY valid JSON in this format:
{
  "question": "Your question here?",
  "options": [
    {"id": "A", "label": "First option"},
    {"id": "B", "label": "Second option"},
    {"id": "C", "label": "Third option"},
    {"id": "other", "label": "Other"}
  ]
}`;

    // Connect to OpenClaw and send the planning request
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    // Send planning request to the main session with a special marker
    // The message will be processed by Charlie who will respond with questions
    await client.call('chat.send', {
      sessionKey: sessionKey,
      message: planningPrompt,
      idempotencyKey: `planning-start-${taskId}-${Date.now()}`,
    });

    // Store the session key and initial message
    const messages = [{ role: 'user', content: planningPrompt, timestamp: Date.now() }];
    
    getDb().prepare(`
      UPDATE tasks 
      SET planning_session_key = ?, planning_messages = ?, status = 'planning'
      WHERE id = ?
    `).run(sessionKey, JSON.stringify(messages), taskId);

    // Poll for response (give OpenClaw time to process)
    // Use OpenClaw API to get messages
    let response = null;
    for (let i = 0; i < 30; i++) { // Poll for up to 30 seconds
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get messages via OpenClaw API
      const transcriptMessages = await getMessagesFromOpenClaw(sessionKey);
      console.log('[Planning] API messages:', transcriptMessages.length);
      
      if (transcriptMessages.length > 0) {
        // Get the last assistant message
        const lastAssistant = [...transcriptMessages].reverse().find(m => m.role === 'assistant');
        if (lastAssistant) {
          response = lastAssistant.content;
          console.log('[Planning] Found response in transcript');
          break;
        }
      }
    }

    if (response) {
      // Parse and store the response using extractJSON to handle code blocks
      messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      
      getDb().prepare(`
        UPDATE tasks SET planning_messages = ? WHERE id = ?
      `).run(JSON.stringify(messages), taskId);

      const parsed = extractJSON(response);
      if (parsed && 'question' in parsed) {
        return NextResponse.json({
          success: true,
          sessionKey,
          currentQuestion: parsed,
          messages,
        });
      } else {
        return NextResponse.json({
          success: true,
          sessionKey,
          rawResponse: response,
          messages,
        });
      }
    }

    return NextResponse.json({
      success: true,
      sessionKey,
      messages,
      note: 'Planning started, waiting for response. Poll GET endpoint for updates.',
    });
  } catch (error) {
    console.error('Failed to start planning:', error);
    return NextResponse.json({ error: 'Failed to start planning: ' + (error as Error).message }, { status: 500 });
  }
}
