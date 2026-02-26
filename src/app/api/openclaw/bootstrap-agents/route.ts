import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent, OpenClawSession } from '@/lib/types';

const DEFAULT_AGENT_IDS = [
  '72e5814f-3932-4249-81bb-049cda09d7cf', // Developer
  '1354b64e-8a51-4773-aab9-ee88612e7768', // Researcher
  '74f764ae-f22c-47b1-a766-5ae9d7a37155', // Writer
  '813008d4-26dd-4c7a-b303-fb04c9ba511b', // Blueprint
  '39b73ae6-124c-42fd-accf-9adb27b84b41', // SEO Content Editor
  '0d6529a4-22e5-4182-b82c-15654c0ac0f6', // Orchestrator
];
const MAX_BOOTSTRAP_AGENTS = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toSessionLabel(agentName: string): string {
  return `mission-control-${agentName.toLowerCase().trim().replace(/\s+/g, '-')}`;
}

function truncate(input: string | null | undefined, max = 3500): string {
  if (!input) return '';
  if (input.length <= max) return input;
  return `${input.slice(0, max)}\n\n[truncated]`;
}

function buildBootstrapMessage(agent: Agent): string {
  const soul = truncate(agent.soul_md);
  const user = truncate(agent.user_md);

  const sections = [
    '🧭 [Mission Control Bootstrap]',
    `Agent: ${agent.name}`,
    `Role: ${agent.role}`,
    '',
    'You are now connected to Mission Control as a persistent agent session.',
    'Protocol:',
    '- Use PROGRESS_UPDATE for meaningful milestones.',
    '- Use BLOCKED when awaiting input and continue fallback work.',
    '- Before completion: log activities + deliverables, then set task status to review.',
    '- Completion must be: TASK_COMPLETE: <summary>',
    '',
    'Mission Control APIs:',
    '- POST /api/tasks/:id/activities',
    '- POST /api/tasks/:id/deliverables',
    '- PATCH /api/tasks/:id {"status":"review"}',
  ];

  if (soul) {
    sections.push('', 'SOUL.md (injected):', soul);
  }
  if (user) {
    sections.push('', 'USER.md (injected):', user);
  }

  return sections.join('\n');
}

/**
 * POST /api/openclaw/bootstrap-agents
 *
 * Ensures Mission Control persistent agent sessions exist in DB and sends
 * bootstrap messages into each agent session.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedAgentIds: unknown[] = Array.isArray(body.agent_ids) ? body.agent_ids : [];

    if (requestedAgentIds.length > MAX_BOOTSTRAP_AGENTS) {
      return NextResponse.json(
        { error: `agent_ids exceeds max allowed (${MAX_BOOTSTRAP_AGENTS})` },
        { status: 400 },
      );
    }

    if (requestedAgentIds.some((id: unknown) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
      return NextResponse.json(
        { error: 'agent_ids must contain valid UUID strings' },
        { status: 400 },
      );
    }

    const agentIds: string[] = requestedAgentIds.length > 0
      ? requestedAgentIds as string[]
      : DEFAULT_AGENT_IDS;

    const agents = queryAll<Agent>(
      `SELECT * FROM agents WHERE id IN (${agentIds.map(() => '?').join(',')})`,
      agentIds,
    );

    if (agents.length === 0) {
      return NextResponse.json({ error: 'No agents found for bootstrap' }, { status: 404 });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    const now = new Date().toISOString();
    const results: Array<{
      agent_id: string;
      agent_name: string;
      session_id: string;
      linked: boolean;
      bootstrapped: boolean;
      error?: string;
    }> = [];

    for (const agent of agents) {
      try {
        let session = queryOne<OpenClawSession>(
          'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
          [agent.id, 'active'],
        );

        if (!session) {
          const internalId = uuidv4();
          const openclawSessionId = toSessionLabel(agent.name);
          const conflictingSession = queryOne<OpenClawSession>(
            'SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ? AND status = ?',
            [openclawSessionId, 'active'],
          );

          if (conflictingSession && conflictingSession.agent_id !== agent.id) {
            throw new Error(
              `Session key conflict for ${openclawSessionId} (active agent ${conflictingSession.agent_id})`,
            );
          }

          run(
            `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, session_type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [internalId, agent.id, openclawSessionId, 'mission-control', 'active', 'persistent', now, now],
          );

          session = queryOne<OpenClawSession>('SELECT * FROM openclaw_sessions WHERE id = ?', [internalId]);
        }

        if (!session) {
          throw new Error('Unable to create/find session');
        }

        const sessionKey = `agent:main:${session.openclaw_session_id}`;
        await client.call('chat.send', {
          sessionKey,
          message: buildBootstrapMessage(agent),
          idempotencyKey: `mc-bootstrap-${agent.id}-${Date.now()}`,
        });

        run(
          'UPDATE openclaw_sessions SET updated_at = ? WHERE id = ?',
          [now, session.id],
        );

        results.push({
          agent_id: agent.id,
          agent_name: agent.name,
          session_id: session.openclaw_session_id,
          linked: true,
          bootstrapped: true,
        });
      } catch (error) {
        results.push({
          agent_id: agent.id,
          agent_name: agent.name,
          session_id: toSessionLabel(agent.name),
          linked: true,
          bootstrapped: false,
          error: error instanceof Error ? error.message : 'Unknown bootstrap error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Failed to bootstrap Mission Control agent sessions:', error);
    return NextResponse.json(
      { error: 'Failed to bootstrap agent sessions' },
      { status: 500 },
    );
  }
}
