import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent, OpenClawSession } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function truncate(input: string | null | undefined, max = 3500): string {
  if (!input) return '';
  if (input.length <= max) return input;
  return `${input.slice(0, max)}\n\n[truncated]`;
}

function buildLinkBootstrapMessage(agent: Agent): string {
  const soul = truncate(agent.soul_md);
  const user = truncate(agent.user_md);
  const chunks = [
    '🧭 [Mission Control Link Bootstrap]',
    `Agent: ${agent.name}`,
    `Role: ${agent.role}`,
    '',
    'You are linked to Mission Control.',
    'Completion format: TASK_COMPLETE: <summary>',
    'Progress format: PROGRESS_UPDATE: <what changed> | next: <next step> | eta: <time>',
    'Blocked format: BLOCKED: <what is blocked> | need: <specific input> | meanwhile: <fallback work>',
  ];
  if (soul) chunks.push('', 'SOUL.md (injected):', soul);
  if (user) chunks.push('', 'USER.md (injected):', user);
  return chunks.join('\n');
}

// GET /api/agents/[id]/openclaw - Get the agent's OpenClaw session
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [id, 'active']
    );

    if (!session) {
      return NextResponse.json({ linked: false, session: null });
    }

    return NextResponse.json({ linked: true, session });
  } catch (error) {
    console.error('Failed to get OpenClaw session:', error);
    return NextResponse.json(
      { error: 'Failed to get OpenClaw session' },
      { status: 500 }
    );
  }
}

// POST /api/agents/[id]/openclaw - Link agent to OpenClaw (creates session)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Connect to OpenClaw Gateway
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Check if already linked
    const existingSession = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [id, 'active']
    );
    if (existingSession) {
      // Best effort bootstrap ping so existing links are immediately usable.
      try {
        const sessionKey = `agent:main:${existingSession.openclaw_session_id}`;
        await client.call('chat.send', {
          sessionKey,
          message: buildLinkBootstrapMessage(agent),
          idempotencyKey: `mc-link-bootstrap-existing-${id}-${Date.now()}`,
        });
      } catch (err) {
        console.warn('Failed to send bootstrap to existing OpenClaw session:', err);
      }

      return NextResponse.json(
        { linked: true, session: existingSession, reused: true }
      );
    }

    // OpenClaw creates sessions automatically when messages are sent
    // Just verify connection works by listing sessions
    try {
      await client.listSessions();
    } catch (err) {
      console.error('Failed to verify OpenClaw connection:', err);
      return NextResponse.json(
        { error: 'Connected but failed to communicate with OpenClaw Gateway' },
        { status: 503 }
      );
    }

    // Store the link in our database - session ID will be set when first message is sent
    // For now, use agent name as the session identifier
    const sessionId = uuidv4();
    const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
    const now = new Date().toISOString();

    const conflictingSession = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ? AND status = ?',
      [openclawSessionId, 'active']
    );
    if (conflictingSession && conflictingSession.agent_id !== id) {
      return NextResponse.json(
        {
          error: 'Session key already linked to another active agent',
          session_id: openclawSessionId,
          conflicting_agent_id: conflictingSession.agent_id,
        },
        { status: 409 }
      );
    }

    run(
      `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, id, openclawSessionId, 'mission-control', 'active', now, now]
    );

    // Log event
    run(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'agent_status_changed', id, `${agent.name} connected to OpenClaw Gateway`, now]
    );

    const session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE id = ?',
      [sessionId]
    );

    // Best effort bootstrap ping to initialize persistent session context.
    try {
      const sessionKey = `agent:main:${openclawSessionId}`;
      await client.call('chat.send', {
        sessionKey,
        message: buildLinkBootstrapMessage(agent),
        idempotencyKey: `mc-link-bootstrap-new-${id}-${Date.now()}`,
      });
    } catch (err) {
      console.warn('Failed to send bootstrap to new OpenClaw session:', err);
    }

    return NextResponse.json({ linked: true, session }, { status: 201 });
  } catch (error) {
    console.error('Failed to link agent to OpenClaw:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/agents/[id]/openclaw - Unlink agent from OpenClaw
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const existingSession = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [id, 'active']
    );

    if (!existingSession) {
      return NextResponse.json(
        { error: 'Agent is not linked to an OpenClaw session' },
        { status: 404 }
      );
    }

    // Mark the session as inactive
    const now = new Date().toISOString();
    run(
      'UPDATE openclaw_sessions SET status = ?, updated_at = ? WHERE id = ?',
      ['inactive', now, existingSession.id]
    );

    // Log event
    run(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'agent_status_changed', id, `${agent.name} disconnected from OpenClaw Gateway`, now]
    );

    return NextResponse.json({ linked: false, success: true });
  } catch (error) {
    console.error('Failed to unlink agent from OpenClaw:', error);
    return NextResponse.json(
      { error: 'Failed to unlink agent from OpenClaw' },
      { status: 500 }
    );
  }
}
