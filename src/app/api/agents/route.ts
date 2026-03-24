import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { normalizeSessionKeyPrefix } from '@/lib/openclaw/routing';
import type { Agent, CreateAgentRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';
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

    // Reconcile status badges from real active-task state so stale DB flags don't keep agents green forever
    const activeRows = queryAll<{ assigned_agent_id: string; c: number }>(
      `SELECT assigned_agent_id, COUNT(*) as c
       FROM tasks
       WHERE assigned_agent_id IS NOT NULL
         AND status IN ('assigned', 'in_progress', 'testing', 'verification')
       GROUP BY assigned_agent_id`
    );
    const activeMap = new Map(activeRows.map(r => [r.assigned_agent_id, r.c]));

    const reconciledAgents = agents.map((agent) => {
      if (agent.status === 'offline') return agent;
      const isActive = (activeMap.get(agent.id) || 0) > 0;
      return {
        ...agent,
        status: isActive ? 'working' : 'standby',
      } as Agent;
    });

    return NextResponse.json(reconciledAgents);
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

// POST /api/agents - Create a new agent
export async function POST(request: NextRequest) {
  try {
    const body: CreateAgentRequest = await request.json();
    const normalizedPrefix = normalizeSessionKeyPrefix(body.session_key_prefix);

    if (!body.name || !body.role) {
      return NextResponse.json({ error: 'Name and role are required' }, { status: 400 });
    }
    if (!body.is_master && !normalizedPrefix) {
      return NextResponse.json(
        { error: 'Trusted non-master agents require an explicit session_key_prefix' },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, soul_md, user_md, agents_md, model, session_key_prefix, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        null,
        normalizedPrefix,
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
