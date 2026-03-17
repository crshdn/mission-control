/**
 * Task Comments API
 * Endpoints for creating and retrieving task comments
 * 
 * Comments are used for review rejection feedback:
 * - Reviewer adds a rejection comment -> task moves to IN_PROGRESS for original assignee
 * - Assignee can reply to comment -> can move task back to REVIEW
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { CreateCommentSchema } from '@/lib/validation';
import type { TaskComment, Agent, Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tasks/[id]/comments
 * Retrieve all comments for a task (nested with replies)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();

    // Get all comments for this task
    const comments = db.prepare(`
      SELECT 
        c.*,
        ag.id as author_id,
        ag.name as author_name,
        ag.avatar_emoji as author_avatar_emoji
      FROM task_comments c
      LEFT JOIN agents ag ON c.author_agent_id = ag.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(taskId) as any[];

    // Transform to include author object
    const transformedComments: TaskComment[] = comments.map(row => ({
      id: row.id,
      task_id: row.task_id,
      author_agent_id: row.author_agent_id,
      parent_comment_id: row.parent_comment_id,
      content: row.content,
      is_rejection: Boolean(row.is_rejection),
      created_at: row.created_at,
      updated_at: row.updated_at,
      author: row.author_agent_id ? {
        id: row.author_id,
        name: row.author_name,
        avatar_emoji: row.author_avatar_emoji,
        role: '',
        status: 'working' as const,
        is_master: false,
        workspace_id: 'default',
        source: 'local' as const,
        description: '',
        created_at: '',
        updated_at: '',
      } : undefined,
    }));

    // Build nested structure (replies under parent)
    const commentMap = new Map<string, TaskComment>();
    const topLevelComments: TaskComment[] = [];

    // First pass: add all comments to map
    transformedComments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: build tree structure
    transformedComments.forEach(comment => {
      const commentWithReplies = commentMap.get(comment.id)!;
      if (comment.parent_comment_id) {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) {
          parent.replies = parent.replies || [];
          parent.replies.push(commentWithReplies);
        } else {
          // Parent not found, treat as top-level
          topLevelComments.push(commentWithReplies);
        }
      } else {
        topLevelComments.push(commentWithReplies);
      }
    });

    // Sort replies by created_at
    const sortReplies = (comments: TaskComment[]): TaskComment[] => {
      return comments.map(comment => ({
        ...comment,
        replies: comment.replies ? sortReplies(comment.replies) : []
      })).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    };

    return NextResponse.json(sortReplies(topLevelComments));
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/comments
 * Create a new comment
 * 
 * Request body:
 * {
 *   content: string (required)
 *   author_agent_id: string (optional)
 *   parent_comment_id: string (optional, for replies)
 *   is_rejection: boolean (optional, default false)
 * }
 * 
 * Side effects:
 * - If is_rejection is true, the task status changes to IN_PROGRESS
 *   and assigned_agent_id is set to the original assignee
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body = await request.json();
    
    // Validate input with Zod
    const validation = CreateCommentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { content, author_agent_id, parent_comment_id, is_rejection } = validation.data;
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Verify task exists
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Verify parent comment exists if provided
    if (parent_comment_id) {
      const parentComment = db.prepare('SELECT id FROM task_comments WHERE id = ? AND task_id = ?').get(parent_comment_id, taskId);
      if (!parentComment) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      }
    }

    // Insert comment
    db.prepare(`
      INSERT INTO task_comments (id, task_id, author_agent_id, parent_comment_id, content, is_rejection, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      taskId,
      author_agent_id || null,
      parent_comment_id || null,
      content,
      is_rejection ? 1 : 0,
      now,
      now
    );

    // If this is a rejection comment, handle the status transition
    if (is_rejection) {
      // Get current task state
      const currentTask = db.prepare(`
        SELECT t.*, aa.name as assignee_name 
        FROM tasks t 
        LEFT JOIN agents aa ON t.assigned_agent_id = aa.id 
        WHERE t.id = ?
      `).get(taskId) as any;

      if (currentTask && ['review', 'verification'].includes(currentTask.status)) {
        // Keep the current assignee (they need to fix the issues)
        // Move task back to in_progress
        db.prepare(`
          UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ?
        `).run(now, taskId);

        // Log activity for status change
        db.prepare(`
          INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          taskId,
          author_agent_id || null,
          'status_changed',
          `Task sent back to in progress: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
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

    // Get the created comment with author info
    const comment = db.prepare(`
      SELECT 
        c.*,
        ag.id as author_id,
        ag.name as author_name,
        ag.avatar_emoji as author_avatar_emoji
      FROM task_comments c
      LEFT JOIN agents ag ON c.author_agent_id = ag.id
      WHERE c.id = ?
    `).get(id) as any;

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

    // Broadcast to SSE clients
    broadcast({
      type: 'activity_logged',
      payload: result,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
