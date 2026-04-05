import { logger } from '@/lib/logger';
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
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
      const existingAgent = db.prepare('SELECT id FROM agents WHERE name = ?').get(agent_name) as { id: string } | undefined;

      if (existingAgent) {
        agentId = existingAgent.id;
      } else if (process.env.ALLOW_DYNAMIC_AGENTS !== 'false') {
        // Create temporary sub-agent record (skipped when ALLOW_DYNAMIC_AGENTS=false)
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
      } else {
        logger.info(`[Subagent] Dynamic agent generation disabled (ALLOW_DYNAMIC_AGENTS=false), skipping creation of sub-agent "${agent_name}"`);
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
    logger.error('Error registering sub-agent:', error);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
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
    logger.error('Error fetching sub-agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sub-agents' },
      { status: 500 }
    );
  }
}
