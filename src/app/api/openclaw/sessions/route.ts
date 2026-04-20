import { NextRequest, NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { logDebugEvent } from '@/lib/debug-log';
import { resolveAgentSessionKeyPrefix } from '@/lib/openclaw/session-key';
import type { Agent, OpenClawSession } from '@/lib/types';

export const dynamic = 'force-dynamic';
// GET /api/openclaw/sessions - List OpenClaw sessions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionType = searchParams.get('session_type');
    const status = searchParams.get('status');

    // If filtering by database fields, query the database
    if (sessionType || status) {
      let sql = 'SELECT * FROM openclaw_sessions WHERE 1=1';
      const params: unknown[] = [];

      if (sessionType) {
        sql += ' AND session_type = ?';
        params.push(sessionType);
      }

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';

      const sessions = queryAll<OpenClawSession>(sql, params);
      return NextResponse.json(sessions);
    }

    // Otherwise, query OpenClaw Gateway for live sessions
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

    const sessions = await client.listSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Failed to list OpenClaw sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/openclaw/sessions - Create a new OpenClaw session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel, peer } = body;

    if (!channel) {
      return NextResponse.json(
        { error: 'channel is required' },
        { status: 400 }
      );
    }

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

    const session = await client.createSession(channel, peer);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error('Failed to create OpenClaw session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/openclaw/sessions - Reset all sessions, both MC-side and gateway-side.
// Used by the sidebar's "Reset all sessions" action so the operator can
// clear stale/zombie sessions in one click — typically after persona-file
// edits (SOUL.md / AGENTS.md / MESSAGING-PROTOCOL.md) that need agents to
// reload, or when sessionKey routing has drifted.
//
// Two phases:
//   1. Wipe MC's `openclaw_sessions` table + clean up legacy Sub-Agent rows.
//   2. Send `/reset` via chat.send to each gateway-synced agent's main
//      session, which forces the gateway to re-init that session — the
//      agent's next message reloads SOUL.md/AGENTS.md/etc. `/reset` and
//      `/new` are OpenClaw's built-in session-init commands.
//
// Either phase can fail independently; the response reports both so the
// operator can see what landed. `agents_reset` entries with `ok: false`
// usually mean the gateway didn't route the command (agent offline,
// allow-list restriction, etc.) — operator can fall back to `/reset` in
// that agent's chat manually.
export async function DELETE() {
  try {
    const sessions = queryAll<OpenClawSession>('SELECT * FROM openclaw_sessions');
    const count = sessions.length;

    transaction(() => {
      // Same cleanup as the per-session DELETE in [id]/route.ts: remove
      // any auto-created Sub-Agent rows whose session is being dropped.
      // With ALLOW_DYNAMIC_AGENTS=false this is a no-op, but we keep the
      // cleanup so resets stay safe in legacy workspaces where ghost
      // Sub-Agent rows may still exist.
      for (const s of sessions) {
        if (s.agent_id) {
          const agent = queryOne<{ id: string; role: string }>(
            'SELECT id, role FROM agents WHERE id = ?',
            [s.agent_id]
          );
          if (agent?.role === 'Sub-Agent') {
            run('DELETE FROM agents WHERE id = ?', [agent.id]);
          } else if (agent) {
            run('UPDATE agents SET status = ? WHERE id = ?', ['standby', agent.id]);
          }
        }
      }
      run('DELETE FROM openclaw_sessions');
    });

    for (const s of sessions) {
      logDebugEvent({
        type: 'session.end',
        direction: 'internal',
        agentId: s.agent_id,
        taskId: s.task_id,
        sessionKey: s.openclaw_session_id,
        metadata: { reason: 'bulk_reset' },
      });
    }

    // Phase 2: tell each gateway-synced agent to re-init its session so
    // SOUL.md / AGENTS.md / MESSAGING-PROTOCOL.md get re-injected on the
    // next turn. Done sequentially because the OpenClawClient serializes
    // on a single WebSocket — parallel would interleave but gain little
    // at the typical roster size.
    const gatewayAgents = queryAll<Agent>(
      `SELECT * FROM agents
         WHERE gateway_agent_id IS NOT NULL
           AND COALESCE(is_active, 1) = 1
           AND COALESCE(status, 'standby') != 'offline'`
    );

    const agentsReset: Array<{ agent_id: string; name: string; sessionKey: string; ok: boolean; error?: string }> = [];

    if (gatewayAgents.length > 0) {
      const client = getOpenClawClient();
      try {
        if (!client.isConnected()) await client.connect();
      } catch (err) {
        // If we can't even connect, return what we have and let the
        // operator fall back to `/reset` in the chat. MC-side phase 1
        // already succeeded.
        return NextResponse.json({
          success: true,
          deleted: count,
          agents_reset: [],
          gateway_error: (err as Error).message,
        });
      }

      for (const agent of gatewayAgents) {
        const prefix = resolveAgentSessionKeyPrefix(agent);
        const sessionKey = `${prefix}main`;
        try {
          await client.call('chat.send', {
            sessionKey,
            message: '/reset',
            idempotencyKey: `reset-${agent.id}-${Date.now()}`,
          });
          agentsReset.push({ agent_id: agent.id, name: agent.name, sessionKey, ok: true });
        } catch (err) {
          agentsReset.push({
            agent_id: agent.id,
            name: agent.name,
            sessionKey,
            ok: false,
            error: (err as Error).message,
          });
        }
      }
    }

    broadcast({
      type: 'agent_completed',
      payload: { reset: true, count, agents_reset: agentsReset.length, deleted: true },
    });

    return NextResponse.json({
      success: true,
      deleted: count,
      agents_reset: agentsReset,
    });
  } catch (error) {
    console.error('Failed to reset OpenClaw sessions:', error);
    return NextResponse.json(
      { error: `Failed to reset sessions: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
