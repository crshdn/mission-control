import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import type { Agent, CreateAgentRequest } from '@/lib/types';

// GET /api/agents - List all agents
// Status is COMPUTED from active sessions, not stored in the agents table
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspace_id');
    
    // Compute status: 'working' if agent has an active session, 'standby' otherwise
    const baseQuery = `
      SELECT a.*,
        CASE 
          WHEN s.id IS NOT NULL THEN 'working'
          ELSE 'standby'
        END as status
      FROM agents a
      LEFT JOIN openclaw_sessions s 
        ON s.agent_id = a.id 
        AND s.status = 'active'
        AND s.ended_at IS NULL
    `;
    
    let agents: Agent[];
    if (workspaceId) {
      agents = queryAll<Agent>(`
        ${baseQuery}
        WHERE a.workspace_id = ?
        GROUP BY a.id
        ORDER BY a.is_master DESC, a.name ASC
      `, [workspaceId]);
    } else {
      agents = queryAll<Agent>(`
        ${baseQuery}
        GROUP BY a.id
        ORDER BY a.is_master DESC, a.name ASC
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

    const id = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, soul_md, user_md, agents_md, model, created_at, updated_at)
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
        body.model || null,
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
