import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent, CreateAgentRequest } from '@/lib/types';

// GET /api/agents - List all agents
// Status is COMPUTED from real OpenClaw session data
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspace_id');
    
    // Get agents from database
    let agents: Agent[];
    if (workspaceId) {
      agents = queryAll<Agent>(`
        SELECT * FROM agents 
        WHERE workspace_id = ?
        ORDER BY is_master DESC, name ASC
      `, [workspaceId]);
    } else {
      agents = queryAll<Agent>(`
        SELECT * FROM agents 
        ORDER BY is_master DESC, name ASC
      `);
    }

    // Fetch real OpenClaw session data via WebSocket client
    interface SessionData {
      key: string;
      displayName?: string;
      label?: string;
      channel?: string;
      updatedAt: number;
    }
    let openclawSessions: SessionData[] = [];
    try {
      const client = getOpenClawClient();
      if (!client.isConnected()) {
        await client.connect();
      }
      const sessionsData = await client.listSessions() as unknown as { sessions?: SessionData[] } | SessionData[];
      // Handle both formats: { sessions: [...] } or direct array
      if (Array.isArray(sessionsData)) {
        openclawSessions = sessionsData;
      } else if (sessionsData && typeof sessionsData === 'object' && 'sessions' in sessionsData) {
        openclawSessions = sessionsData.sessions || [];
      }
    } catch (err) {
      // OpenClaw not available - all agents show as standby
      console.log('[AGENTS API] OpenClaw not reachable, showing all as standby');
    }

    // Build a map of gateway_agent_id -> most recent session
    const tenMinAgo = Date.now() - (10 * 60 * 1000);
    const agentActivity: Record<string, { session: string; lastActive: number; channel?: string }> = {};
    
    for (const session of openclawSessions) {
      // Extract agent ID from session key (format: agent:xxx:...)
      const keyParts = session.key.split(':');
      if (keyParts[0] !== 'agent' || keyParts.length < 2) continue;
      
      const gatewayAgentId = keyParts[1];
      const existing = agentActivity[gatewayAgentId];
      
      // Keep the most recent session for each agent
      if (!existing || session.updatedAt > existing.lastActive) {
        agentActivity[gatewayAgentId] = {
          session: session.displayName || session.label || session.key,
          lastActive: session.updatedAt,
          channel: session.channel
        };
      }
    }

    // Get current tasks for each agent (in_progress or assigned)
    const agentTasks: Record<string, { title: string; status: string }> = {};
    const currentTasks = queryAll<{ agent_id: string; title: string; status: string }>(`
      SELECT assigned_agent_id as agent_id, title, status 
      FROM tasks 
      WHERE status IN ('in_progress', 'assigned', 'testing', 'review')
      AND assigned_agent_id IS NOT NULL
    `);
    for (const task of currentTasks) {
      // Keep highest priority status task per agent
      const existing = agentTasks[task.agent_id];
      if (!existing || task.status === 'in_progress') {
        agentTasks[task.agent_id] = { title: task.title, status: task.status };
      }
    }

    // Enrich agents with real status and current work
    const enrichedAgents = agents.map(agent => {
      const activity = agentActivity[agent.gateway_agent_id || ''];
      const isActive = activity && activity.lastActive > tenMinAgo;
      const currentTask = agentTasks[agent.id];
      
      // Determine what they're working on
      let workingOn: string | null = null;
      if (currentTask) {
        workingOn = currentTask.title;
      } else if (isActive && activity) {
        // Parse session for context if no task
        const sessionKey = activity.session;
        if (sessionKey.includes('discord:')) {
          workingOn = 'Discord: ' + (sessionKey.split('#')[1] || 'channel');
        } else if (sessionKey.includes('telegram:')) {
          workingOn = 'Direct chat';
        } else if (sessionKey.includes('cron:')) {
          workingOn = 'Scheduled task';
        } else if (sessionKey.includes('subagent:')) {
          workingOn = 'Sub-agent work';
        }
      }
      
      return {
        ...agent,
        status: isActive ? 'working' : 'standby',
        current_session: isActive ? activity.session : null,
        working_on: workingOn,
        current_task: currentTask?.title || null,
        last_active: activity?.lastActive ? new Date(activity.lastActive).toISOString() : null,
      };
    });

    return NextResponse.json(enrichedAgents);
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
