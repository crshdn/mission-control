/**
 * Subagent Registration API
 * Register OpenClaw sub-agent sessions for tasks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';

export const dynamic = 'force-dynamic';
/**
 * POST /api/tasks/[id]/subagent
 * Register a sub-agent session for a task
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const body = await request.json();
    
    const { openclaw_session_id, agent_name } = body;

    if (!openclaw_session_id) {
      return NextResponse.json(
        { error: 'openclaw_session_id is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const sessionId = crypto.randomUUID();

    // Create a placeholder agent if agent_name is provided
    // Otherwise, we'll need to link to an existing agent
    let agentId = null;
    
    if (agent_name) {
      // Check if agent already exists
      const existingAgent = db.prepare('SELECT id FROM agents WHERE name = ?').get(agent_name) as any;
      
      if (existingAgent) {
        agentId = existingAgent.id;
      } else {
        // Create temporary sub-agent record
        agentId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO agents (id, name, role, description, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          agentId,
          agent_name,
          'Sub-Agent',
          'Automatically created sub-agent',
          'working'
        );
      }
    }

    // Insert OpenClaw session record
    db.prepare(`
      INSERT INTO openclaw_sessions 
        (id, agent_id, openclaw_session_id, session_type, task_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      agentId,
      openclaw_session_id,
      'subagent',
      taskId,
      'active'
    );

    // Get the created session
    const session = db.prepare(`
      SELECT * FROM openclaw_sessions WHERE id = ?
    `).get(sessionId);

    // Broadcast agent spawned event
    broadcast({
      type: 'agent_spawned',
      payload: {
        taskId,
        sessionId: openclaw_session_id,
        agentName: agent_name,
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error('Error registering sub-agent:', error);
    return NextResponse.json(
      { error: 'Failed to register sub-agent' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tasks/[id]/subagent
 * Get all sub-agent sessions for a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const db = getDb();

    const sessions = db.prepare(`
      SELECT 
        s.*,
        a.name as agent_name,
        a.avatar_emoji as agent_avatar_emoji
      FROM openclaw_sessions s
      LEFT JOIN agents a ON s.agent_id = a.id
      WHERE s.task_id = ? AND s.session_type = 'subagent'
      ORDER BY s.created_at DESC
    `).all(taskId);

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching sub-agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sub-agents' },
      { status: 500 }
    );
  }
}
