/**
 * Single Comment API
 * Endpoints for updating and deleting individual comments
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { UpdateCommentSchema } from '@/lib/validation';
import type { TaskComment, Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/tasks/[id]/comments/[commentId]
 * Update a comment
 * 
 * Request body:
 * {
 *   content: string (optional)
 *   is_rejection: boolean (optional)
 *   move_to_review: boolean (optional) - if true, moves task back to REVIEW
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id: taskId, commentId } = await params;
    const body = await request.json();
    
    // Validate input with Zod
    const validation = UpdateCommentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { content, is_rejection } = validation.data;
    const { move_to_review } = body;
    const db = getDb();
    const now = new Date().toISOString();

    // Verify comment exists
    const existingComment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?').get(commentId, taskId) as { author_agent_id: string | null } | undefined;
    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Build update query
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }
    if (is_rejection !== undefined) {
      updates.push('is_rejection = ?');
      values.push(is_rejection ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(now);
      values.push(commentId);

      db.prepare(`
        UPDATE task_comments SET ${updates.join(', ')} WHERE id = ?
      `).run(...values);
    }

    // Handle move_to_review flag
    if (move_to_review) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
      
      if (task && task.status === 'in_progress') {
        // Move task back to review
        db.prepare(`
          UPDATE tasks SET status = 'review', updated_at = ? WHERE id = ?
        `).run(now, taskId);

        // Log activity
        db.prepare(`
          INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          taskId,
          existingComment.author_agent_id || null,
          'status_changed',
          `Task moved back to review after addressing comments`,
          now
        );

        // Broadcast task update
        const updatedTask = db.prepare(`
          SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji
          FROM tasks t
          LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
          WHERE t.id = ?
        `).get(taskId) as Task;

        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }
    }

    // Get the updated comment with author info
    const comment = db.prepare(`
      SELECT 
        c.*,
        ag.id as author_id,
        ag.name as author_name,
        ag.avatar_emoji as author_avatar_emoji
      FROM task_comments c
      LEFT JOIN agents ag ON c.author_agent_id = ag.id
      WHERE c.id = ?
    `).get(commentId) as any;

    const result: TaskComment = {
      id: comment.id,
      task_id: comment.task_id,
      author_agent_id: comment.author_agent_id,
      parent_comment_id: comment.parent_comment_id,
      content: comment.content,
      is_rejection: Boolean(comment.is_rejection),
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      author: comment.author_agent_id ? {
        id: comment.author_id,
        name: comment.author_name,
        avatar_emoji: comment.author_avatar_emoji,
        role: '',
        status: 'working' as const,
        is_master: false,
        workspace_id: 'default',
        source: 'local' as const,
        description: '',
        created_at: '',
        updated_at: '',
      } : undefined,
      replies: [],
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating comment:', error);
    return NextResponse.json(
      { error: 'Failed to update comment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]/comments/[commentId]
 * Delete a comment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id: taskId, commentId } = await params;
    const db = getDb();

    // Verify comment exists
    const existingComment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?').get(commentId, taskId);
    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Delete comment (will cascade to replies due to FK)
    db.prepare('DELETE FROM task_comments WHERE id = ?').run(commentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
