import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/openclaw/sessions/[id] - Get session details
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    // List sessions and find the one with matching ID
    const sessions = await client.listSessions();
    const session = sessions.find((s) => s.id === id);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Failed to get OpenClaw session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/openclaw/sessions/[id] - Send a message to the session
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'content is required' },
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

    // Prefix message with [Mission Control] so Charlie knows the source
    const prefixedContent = `[Mission Control] ${content}`;
    await client.sendMessage(id, prefixedContent);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send message to OpenClaw session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/openclaw/sessions/[id] - Update session status (for completing sub-agents)
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, ended_at } = body;

    const db = getDb();

    // Find session by openclaw_session_id
    const session = db.prepare('SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ?').get(id) as any;

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found in database' },
        { status: 404 }
      );
    }

    // Update session
    const updates: string[] = [];
    const values: unknown[] = [];

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (ended_at !== undefined) {
      updates.push('ended_at = ?');
      values.push(ended_at);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(session.id);

    db.prepare(`UPDATE openclaw_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updatedSession = db.prepare('SELECT * FROM openclaw_sessions WHERE id = ?').get(session.id);

    // If status changed to completed, update the agent status too
    if (status === 'completed') {
      if (session.agent_id) {
        db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('idle', session.agent_id);
      }
      if (session.task_id) {
        broadcast({
          type: 'agent_completed',
          payload: {
            taskId: session.task_id,
            sessionId: id,
          },
        });
      }
    }

    return NextResponse.json(updatedSession);
  } catch (error) {
    console.error('Failed to update OpenClaw session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/openclaw/sessions/[id] - Delete a session and its associated agent
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();

    // Find session by openclaw_session_id or internal id
    let session = db.prepare('SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ?').get(id) as any;

    if (!session) {
      session = db.prepare('SELECT * FROM openclaw_sessions WHERE id = ?').get(id) as any;
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const taskId = session.task_id;
    const agentId = session.agent_id;

    // Delete the session
    db.prepare('DELETE FROM openclaw_sessions WHERE id = ?').run(session.id);

    // If there's an associated agent that was auto-created (role = 'Sub-Agent'), delete it too
    if (agentId) {
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
      if (agent && agent.role === 'Sub-Agent') {
        db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
      } else if (agent) {
        // Update non-subagent back to idle
        db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('idle', agentId);
      }
    }

    // Broadcast deletion event
    broadcast({
      type: 'agent_completed',
      payload: {
        taskId,
        sessionId: id,
        deleted: true,
      },
    });

    return NextResponse.json({ success: true, deleted: session.id });
  } catch (error) {
    console.error('Failed to delete OpenClaw session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
