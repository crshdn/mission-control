/**
 * Task Activities API
 * Endpoints for logging and retrieving task activities
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { CreateActivitySchema } from '@/lib/validation';
import type { TaskActivity } from '@/lib/types';

/**
 * GET /api/tasks/[id]/activities
 * Retrieve all activities for a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const db = getDb();

    // Get activities with agent info
    const activities = db.prepare(`
      SELECT 
        a.*,
        ag.id as agent_id,
        ag.name as agent_name,
        ag.avatar_emoji as agent_avatar_emoji
      FROM task_activities a
      LEFT JOIN agents ag ON a.agent_id = ag.id
      WHERE a.task_id = ?
      ORDER BY a.created_at DESC
    `).all(taskId) as any[];

    // Transform to include agent object
    const result: TaskActivity[] = activities.map(row => ({
      id: row.id,
      task_id: row.task_id,
      agent_id: row.agent_id,
      activity_type: row.activity_type,
      message: row.message,
      metadata: row.metadata,
      created_at: row.created_at,
      agent: row.agent_id ? {
        id: row.agent_id,
        name: row.agent_name,
        avatar_emoji: row.agent_avatar_emoji,
        role: '',
        status: 'working' as const,
        is_master: false,
        workspace_id: 'default',
        description: '',
        created_at: '',
        updated_at: '',
      } : undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/activities
 * Log a new activity for a task
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const body = await request.json();
    
    // Validate input with Zod
    const validation = CreateActivitySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { activity_type, message, agent_id, metadata } = validation.data;

    const db = getDb();
    const id = crypto.randomUUID();

    // Insert activity
    db.prepare(`
      INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      taskId,
      agent_id || null,
      activity_type,
      message,
      metadata ? JSON.stringify(metadata) : null
    );

    // Get the created activity with agent info
    const activity = db.prepare(`
      SELECT 
        a.*,
        ag.id as agent_id,
        ag.name as agent_name,
        ag.avatar_emoji as agent_avatar_emoji
      FROM task_activities a
      LEFT JOIN agents ag ON a.agent_id = ag.id
      WHERE a.id = ?
    `).get(id) as any;

    const result: TaskActivity = {
      id: activity.id,
      task_id: activity.task_id,
      agent_id: activity.agent_id,
      activity_type: activity.activity_type,
      message: activity.message,
      metadata: activity.metadata,
      created_at: activity.created_at,
      agent: activity.agent_id ? {
        id: activity.agent_id,
        name: activity.agent_name,
        avatar_emoji: activity.agent_avatar_emoji,
        role: '',
        status: 'working' as const,
        is_master: false,
        workspace_id: 'default',
        description: '',
        created_at: '',
        updated_at: '',
      } : undefined,
    };

    // Broadcast to SSE clients
    broadcast({
      type: 'activity_logged',
      payload: result,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating activity:', error);
    return NextResponse.json(
      { error: 'Failed to create activity' },
      { status: 500 }
    );
  }
}
