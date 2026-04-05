import { logger } from '@/lib/logger';
/**
 * Task Deliverables API
 * Endpoints for managing task deliverables (files, URLs, artifacts)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { CreateDeliverableSchema } from '@/lib/validation';

import type { TaskDeliverable } from '@/lib/types';

export const dynamic = 'force-dynamic';
/**
 * GET /api/tasks/[id]/deliverables
 * Retrieve all deliverables for a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();

    const deliverables = db.prepare(`
      SELECT *
      FROM task_deliverables
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(taskId) as TaskDeliverable[];

    return NextResponse.json(deliverables);
  } catch (error) {
    logger.error('Error fetching deliverables:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deliverables' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/deliverables
 * Add a new deliverable to a task
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body = await request.json();
    
    // Validate input with Zod
    const validation = CreateDeliverableSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const {
      deliverable_type,
      title,
      path: deliverablePath,
      description,
    } = validation.data;

    const db = getDb();
    const id = crypto.randomUUID();

    // Insert deliverable
    db.prepare(`
      INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      taskId,
      deliverable_type,
      title,
      deliverablePath || null,
      description || null
    );

    // Get the created deliverable
    const deliverable = db.prepare(`
      SELECT *
      FROM task_deliverables
      WHERE id = ?
    `).get(id) as TaskDeliverable;

    // Broadcast to SSE clients
    broadcast({
      type: 'deliverable_added',
      payload: deliverable,
    });

    return NextResponse.json(deliverable, { status: 201 });
  } catch (error) {
    logger.error('Error creating deliverable:', error);
    return NextResponse.json(
      { error: 'Failed to create deliverable' },
      { status: 500 }
    );
  }
}
