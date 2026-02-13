import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent, CreateAgentRequest } from '@/lib/types';

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

// GET /api/agents - List all agents
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspace_id');
    
    let agents: Agent[];
    if (workspaceId) {
      agents = queryAll<Agent>(`
        SELECT * FROM agents WHERE workspace_id = ? ORDER BY is_master DESC, name ASC
      `, [workspaceId]);
    } else {
      agents = queryAll<Agent>(`
        SELECT * FROM agents ORDER BY is_master DESC, name ASC
      `);
    }
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

// POST /api/agents - Create a new agent
export async function POST(request: NextRequest) {
  try {
    const body: CreateAgentRequest = await request.json();

    if (!body.name || !body.role) {
      return NextResponse.json({ error: 'Name and role are required' }, { status: 400 });
    }

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

    const id = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, soul_md, user_md, agents_md, openclaw_agent_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.name,
        body.role,
        body.description || null,
        body.avatar_emoji || '🤖',
        body.is_master ? 1 : 0,
        (body as { workspace_id?: string }).workspace_id || 'default',
        body.soul_md || null,
        body.user_md || null,
        body.agents_md || null,
        body.openclaw_agent_name || 'main',
        now,
        now,
      ]
    );

    // Log event
    run(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'agent_joined', id, `${body.name} joined the team`, now]
    );

    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    console.error('Failed to create agent:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}
