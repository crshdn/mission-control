import { NextRequest, NextResponse } from 'next/server';
import { createConvoy, getConvoy, updateConvoyStatus, deleteConvoy } from '@/lib/convoy';
import { queryOne, queryAll } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { extractJSON, getMessagesFromOpenClaw } from '@/lib/planning-utils';
import type { Task, Agent, ConvoyStatus, DecompositionStrategy } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DECOMPOSE_TIMEOUT_MS = 60000; // 60s timeout for AI decomposition
const DECOMPOSE_POLL_INTERVAL_MS = 2000; // Poll every 2s

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Build the AI decomposition prompt from the task's spec and description.
 */
function buildDecompositionPrompt(task: Task): string {
  const specSection = task.description || 'No description provided.';

  return `TASK DECOMPOSITION REQUEST

You are decomposing a task into parallel sub-tasks for a convoy (multi-agent parallel execution).

**Parent Task:** ${task.title}
**Description/Spec:**
${specSection}

Analyze this task and break it into independent sub-tasks that can be worked on in parallel by different agents. Each sub-task should be a self-contained unit of work.

Rules:
- Create 2-6 sub-tasks (prefer fewer, larger sub-tasks over many tiny ones)
- Each sub-task must have a clear, actionable title and description
- Identify dependencies: if sub-task C requires output from A and B, declare it
- Dependencies reference other sub-tasks by their zero-based index (e.g. "subtask-0", "subtask-1")
- Sub-tasks WITHOUT dependencies will run in parallel immediately
- Sub-tasks WITH dependencies wait until all dependencies complete
- Suggest a role for each sub-task (e.g. "developer", "designer", "writer")

Respond with ONLY valid JSON in this exact format:
{
  "reasoning": "Brief explanation of how you decomposed this task",
  "subtasks": [
    {
      "title": "Sub-task title",
      "description": "Detailed description of what this sub-task should accomplish",
      "suggested_role": "developer",
      "depends_on": []
    },
    {
      "title": "Another sub-task",
      "description": "Description...",
      "suggested_role": "developer",
      "depends_on": ["subtask-0"]
    }
  ]
}`;
}

/**
 * Run AI decomposition via OpenClaw: send prompt, poll for response, parse sub-tasks.
 */
async function runAIDecomposition(task: Task): Promise<{
  subtasks: Array<{ title: string; description?: string; depends_on?: string[]; suggested_role?: string }>;
  reasoning: string;
}> {
  // Find master agent for this workspace
  const masterAgent = queryOne<Agent>(
    `SELECT * FROM agents WHERE is_master = 1 AND workspace_id = ? AND status != 'offline' ORDER BY created_at ASC LIMIT 1`,
    [task.workspace_id]
  );

  if (!masterAgent) {
    throw new Error('No master agent available for AI decomposition');
  }

  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }

  // Create a unique session key for this decomposition
  const prefix = masterAgent.session_key_prefix || 'agent:main:';
  const sessionKey = `${prefix}decompose:${task.id}`;

  const prompt = buildDecompositionPrompt(task);

  // Send the decomposition prompt
  await client.call('chat.send', {
    sessionKey,
    message: prompt,
    idempotencyKey: `decompose-${task.id}-${Date.now()}`,
  });

  // Poll for the response
  const startTime = Date.now();
  while (Date.now() - startTime < DECOMPOSE_TIMEOUT_MS) {
    await new Promise(resolve => setTimeout(resolve, DECOMPOSE_POLL_INTERVAL_MS));

    const messages = await getMessagesFromOpenClaw(sessionKey);
    if (messages.length === 0) continue;

    // Look for the latest assistant message with valid JSON
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;

      const parsed = extractJSON(msg.content) as {
        reasoning?: string;
        subtasks?: Array<{
          title: string;
          description?: string;
          suggested_role?: string;
          depends_on?: string[];
        }>;
      } | null;

      if (parsed?.subtasks && Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0) {
        // Convert subtask index references (e.g. "subtask-0") to task IDs later
        // For now, keep them as-is — they'll be resolved during convoy creation
        return {
          subtasks: parsed.subtasks.map(st => ({
            title: st.title,
            description: st.description,
            depends_on: st.depends_on,
            // Preserve the AI's per-sub-task role hint so convoy dispatch can
            // route researcher/writer/reviewer work to the right agent. Before
            // this, the role was dropped here and dispatch fell back to the
            // hardcoded 'builder' in convoy/dispatch/route.ts — every sub-task
            // landed on whichever agent had role='builder'.
            suggested_role: st.suggested_role,
          })),
          reasoning: parsed.reasoning || 'AI decomposition',
        };
      }
    }
  }

  throw new Error('AI decomposition timed out — no valid response received');
}

// POST /api/tasks/[id]/convoy — Create a convoy from a task
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { strategy = 'manual', name, subtasks, decomposition_spec } = body as {
      strategy?: DecompositionStrategy;
      name?: string;
      subtasks?: Array<{ title: string; description?: string; agent_id?: string; depends_on?: string[]; suggested_role?: string }>;
      decomposition_spec?: string;
    };

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // AI decomposition: call OpenClaw to auto-generate sub-tasks
    if (strategy === 'ai') {
      try {
        const result = await runAIDecomposition(task);

        const convoy = createConvoy({
          parentTaskId: id,
          name: name || task.title,
          strategy: 'ai',
          decompositionSpec: JSON.stringify({ reasoning: result.reasoning }),
          subtasks: result.subtasks,
        });

        return NextResponse.json({ ...convoy, ai_reasoning: result.reasoning }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI decomposition failed';
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // Manual or planning strategy
    const convoy = createConvoy({
      parentTaskId: id,
      name: name || task.title,
      strategy,
      decompositionSpec: decomposition_spec,
      subtasks: subtasks || [],
    });

    return NextResponse.json(convoy, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create convoy';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// GET /api/tasks/[id]/convoy — Get convoy details with subtasks
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const convoy = getConvoy(id);

    if (!convoy) {
      return NextResponse.json({ error: 'No convoy found for this task' }, { status: 404 });
    }

    return NextResponse.json(convoy);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch convoy' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id]/convoy — Update convoy (pause, resume, cancel)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body as { status: ConvoyStatus };

    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const convoy = getConvoy(id);
    if (!convoy) {
      return NextResponse.json({ error: 'No convoy found for this task' }, { status: 404 });
    }

    const updated = updateConvoyStatus(convoy.id, status);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update convoy';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// DELETE /api/tasks/[id]/convoy — Cancel convoy and all sub-tasks
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const convoy = getConvoy(id);

    if (!convoy) {
      return NextResponse.json({ error: 'No convoy found for this task' }, { status: 404 });
    }

    deleteConvoy(convoy.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete convoy';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
