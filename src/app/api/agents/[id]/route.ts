import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent, UpdateAgentRequest } from '@/lib/types';

function validateOpenClawAgentName(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return 'openclaw_agent_name must be a string';
  }
  if (value.includes(':') || /\s/.test(value)) {
    return 'openclaw_agent_name must not contain colon or whitespace';
  }
  return null;
}

async function fetchRuntimeAgentIds(): Promise<string[]> {
  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const runtime = await client.call('agents.list', {});
  return (runtime as { agents?: Array<{ id: string }> })?.agents?.map((a) => a.id) ?? [];
}

// GET /api/agents/[id] - Get a single agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json(agent);
  } catch (error) {
    console.error('Failed to fetch agent:', error);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}

// PATCH /api/agents/[id] - Update an agent
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateAgentRequest = await request.json();

    const existing = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    const openclawAgentNameError = validateOpenClawAgentName(body.openclaw_agent_name);
    if (openclawAgentNameError) {
      return NextResponse.json({ error: openclawAgentNameError }, { status: 400 });
    }

    if (body.openclaw_agent_name) {
      const validIds = await fetchRuntimeAgentIds();
      if (!validIds.includes(body.openclaw_agent_name)) {
        return NextResponse.json(
          { error: 'Invalid OpenClaw runtime agent' },
          { status: 400 }
        );
      }
    }

    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.role !== undefined) {
      updates.push('role = ?');
      values.push(body.role);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.avatar_emoji !== undefined) {
      updates.push('avatar_emoji = ?');
      values.push(body.avatar_emoji);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);

      // Log status change event
      const now = new Date().toISOString();
      run(
        `INSERT INTO events (id, type, agent_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), 'agent_status_changed', id, `${existing.name} is now ${body.status}`, now]
      );
    }
    if (body.is_master !== undefined) {
      updates.push('is_master = ?');
      values.push(body.is_master ? 1 : 0);
    }
    if (body.soul_md !== undefined) {
      updates.push('soul_md = ?');
      values.push(body.soul_md);
    }
    if (body.user_md !== undefined) {
      updates.push('user_md = ?');
      values.push(body.user_md);
    }
    if (body.agents_md !== undefined) {
      updates.push('agents_md = ?');
      values.push(body.agents_md);
    }
    if (body.openclaw_agent_name !== undefined) {
      updates.push('openclaw_agent_name = ?');
      values.push(body.openclaw_agent_name || 'main');
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    run(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`, values);

    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    return NextResponse.json(agent);
  } catch (error) {
    console.error('Failed to update agent:', error);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}

// DELETE /api/agents/[id] - Delete an agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Delete or nullify related records first (foreign key constraints)
    run('DELETE FROM openclaw_sessions WHERE agent_id = ?', [id]);
    run('DELETE FROM events WHERE agent_id = ?', [id]);
    run('DELETE FROM messages WHERE sender_agent_id = ?', [id]);
    run('DELETE FROM conversation_participants WHERE agent_id = ?', [id]);
    run('UPDATE tasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?', [id]);
    run('UPDATE tasks SET created_by_agent_id = NULL WHERE created_by_agent_id = ?', [id]);
    run('UPDATE task_activities SET agent_id = NULL WHERE agent_id = ?', [id]);

    // Now delete the agent
    run('DELETE FROM agents WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete agent:', error);
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
  }
}
