import { NextRequest, NextResponse } from 'next/server';
import { createConvoy, getConvoy, updateConvoyStatus, deleteConvoy } from '@/lib/convoy';
import { queryOne, queryAll } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { extractJSON, getMessagesFromOpenClaw } from '@/lib/planning-utils';
import {
  getAgentRoster,
  formatRosterForPrompt,
  verifyAgentInWorkspace,
  MAX_CONVOY_SUBTASKS,
  MAX_TASKS_PER_AGENT,
  MIN_NEW_AGENT_RATIONALE_LENGTH,
  type RosterAgent,
} from '@/lib/agent-resolver';
import type { Task, Agent, ConvoyStatus, DecompositionStrategy } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DECOMPOSE_TIMEOUT_MS = 60000; // 60s timeout for AI decomposition
const DECOMPOSE_POLL_INTERVAL_MS = 2000; // Poll every 2s

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ParsedSubtask {
  title: string;
  description?: string;
  suggested_role?: string;
  agent_id?: string | null;
  agent_name?: string;
  rationale?: string;
  depends_on?: string[];
}

/**
 * Build the AI decomposition prompt from the task's spec and description,
 * injecting the current agent roster so the LLM can assign sub-tasks to
 * existing agents by id instead of silently producing ghosts.
 */
function buildDecompositionPrompt(task: Task, roster: RosterAgent[]): string {
  const specSection = task.description || 'No description provided.';
  const rosterBlock = formatRosterForPrompt(roster);
  const createPolicy = roster.length === 0
    ? 'No existing agents. Set agent_id to null for every sub-task.'
    : 'Prefer assigning sub-tasks to agents in the roster above. Only set agent_id to null when no listed agent is a reasonable fit; in that case you MUST provide a specific rationale naming the capability or capacity gap.';

  return `TASK DECOMPOSITION REQUEST

You are decomposing a task into parallel sub-tasks for a convoy (multi-agent parallel execution).

**Parent Task:** ${task.title}
**Description/Spec:**
${specSection}

AVAILABLE AGENTS (workspace roster):
${rosterBlock}

${createPolicy}

Rules:
- Plan no more than ${MAX_CONVOY_SUBTASKS} sub-tasks. If the task is too big for that, plan the first ${MAX_CONVOY_SUBTASKS} and describe what was left out in "deferred".
- Each sub-task must have a clear, actionable title and description.
- Identify dependencies: if sub-task C requires output from A and B, declare it.
- Dependencies reference other sub-tasks by their zero-based index (e.g. "subtask-0", "subtask-1").
- Sub-tasks WITHOUT dependencies run in parallel immediately.
- Do not assign more than ${MAX_TASKS_PER_AGENT} sub-tasks to the same agent_id; if more work exists for a role, prefer creating a new agent over overloading.
- Prefer agents with status "standby" over "working".
- For each sub-task include "agent_id" (from the roster above) OR null, plus "suggested_role" (human-readable), and a "rationale" explaining the choice.
- If agent_id is null, "rationale" must name the specific capability gap — "no suitable agent" is not acceptable.

Respond with ONLY valid JSON — no markdown fences, no commentary — in this exact shape:
{
  "reasoning": "Brief explanation of how you decomposed this task",
  "deferred": "optional — what was left out when capped at ${MAX_CONVOY_SUBTASKS} sub-tasks",
  "subtasks": [
    {
      "title": "Sub-task title",
      "description": "Detailed description of what this sub-task should accomplish",
      "suggested_role": "researcher",
      "agent_id": "<existing agent id from roster, or null>",
      "agent_name": "<name for new agent, only when agent_id is null>",
      "rationale": "Why this agent was chosen, or why a new agent is required",
      "depends_on": []
    }
  ]
}`;
}

/**
 * Validate the LLM's plan against the guardrails (subtask cap, per-agent load
 * limit, hallucinated agent ids, required rationale for new agents). Mutates
 * each subtask's agent_id to null when validation fails for that subtask, so
 * the caller falls back to creating a new agent rather than assigning to a
 * non-existent one. Returns any validation problems for logging.
 */
function validateConvoyPlan(
  subtasks: ParsedSubtask[],
  workspaceId: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (subtasks.length > MAX_CONVOY_SUBTASKS) {
    errors.push(`Plan has ${subtasks.length} sub-tasks, exceeds cap of ${MAX_CONVOY_SUBTASKS}`);
  }

  const assignmentCounts = new Map<string, number>();

  for (const subtask of subtasks) {
    if (subtask.agent_id) {
      const agent = verifyAgentInWorkspace(workspaceId, subtask.agent_id);
      if (!agent) {
        warnings.push(
          `LLM returned unknown agent_id ${subtask.agent_id} for sub-task "${subtask.title}" — will fall back to role-based pick`,
        );
        subtask.agent_id = null;
      } else {
        const next = (assignmentCounts.get(subtask.agent_id) ?? 0) + 1;
        assignmentCounts.set(subtask.agent_id, next);
        if (next > MAX_TASKS_PER_AGENT) {
          warnings.push(
            `Agent ${agent.name} (${subtask.agent_id}) assigned ${next} sub-tasks, exceeds per-agent load limit of ${MAX_TASKS_PER_AGENT} — dropping this assignment`,
          );
          subtask.agent_id = null;
        }
      }
    }

    if (subtask.agent_id == null) {
      const rationale = (subtask.rationale ?? '').trim();
      if (rationale.length < MIN_NEW_AGENT_RATIONALE_LENGTH) {
        warnings.push(
          `Sub-task "${subtask.title}" requests a new agent without a specific rationale (got "${rationale}") — dispatch will fall back to the role-based pick instead of auto-creating`,
        );
      }
    }
  }

  return { errors, warnings };
}

/**
 * Run AI decomposition via OpenClaw: send prompt, poll for response, parse sub-tasks.
 */
async function runAIDecomposition(task: Task): Promise<{
  subtasks: Array<{
    title: string;
    description?: string;
    depends_on?: string[];
    suggested_role?: string;
    agent_id?: string | null;
  }>;
  reasoning: string;
  deferred?: string;
  warnings: string[];
}> {
  // Find master agent for this workspace
  const masterAgent = queryOne<Agent>(
    `SELECT * FROM agents WHERE is_master = 1 AND workspace_id = ? AND status != 'offline' ORDER BY created_at ASC LIMIT 1`,
    [task.workspace_id]
  );

  if (!masterAgent) {
    throw new Error('No master agent available for AI decomposition');
  }

  const roster = getAgentRoster(task.workspace_id);

  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }

  // Create a unique session key for this decomposition
  const prefix = masterAgent.session_key_prefix || 'agent:main:';
  const sessionKey = `${prefix}decompose:${task.id}`;

  const prompt = buildDecompositionPrompt(task, roster);

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
        deferred?: string;
        subtasks?: ParsedSubtask[];
      } | null;

      if (parsed?.subtasks && Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0) {
        const subtasks = parsed.subtasks.slice(0, MAX_CONVOY_SUBTASKS);
        const { errors, warnings } = validateConvoyPlan(subtasks, task.workspace_id);
        if (errors.length > 0) {
          throw new Error(`Convoy plan rejected: ${errors.join('; ')}`);
        }
        for (const w of warnings) console.warn(`[Convoy Decomposition] ${w}`);

        return {
          subtasks: subtasks.map(st => ({
            title: st.title,
            description: st.description,
            depends_on: st.depends_on,
            suggested_role: st.suggested_role,
            // Pass the LLM's validated agent choice through to createConvoy so
            // the sub-task row is pre-assigned. Null means "let dispatch pick
            // by role" — which is the non-breaking fallback for empty rosters.
            agent_id: st.agent_id ?? null,
          })),
          reasoning: parsed.reasoning || 'AI decomposition',
          deferred: parsed.deferred,
          warnings,
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
          decompositionSpec: JSON.stringify({
            reasoning: result.reasoning,
            deferred: result.deferred,
            warnings: result.warnings,
          }),
          subtasks: result.subtasks,
        });

        return NextResponse.json(
          { ...convoy, ai_reasoning: result.reasoning, ai_deferred: result.deferred, warnings: result.warnings },
          { status: 201 },
        );
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
