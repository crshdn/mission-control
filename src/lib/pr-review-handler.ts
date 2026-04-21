/**
 * PR Review Auto-Fix Handler
 *
 * Collects reviewer comments and CI status from GitHub webhook events,
 * formats context for the agent, and re-dispatches the task so the
 * original builder can address the feedback automatically.
 *
 * Flow:
 *   1. Webhook identifies an Autensa-created PR via tasks.pr_url
 *   2. This module formats the review context into an actionable message
 *   3. Task transitions: done → review_fix → in_progress (via dispatch)
 *   4. After max cycles, task goes to 'review' for human intervention
 */

import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getProductSettings } from '@/lib/rollback';
import type { Task, Product } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewComment {
  path?: string;
  line?: number;
  body: string;
  author: string;
}

export interface ReviewFixContext {
  taskId: string;
  taskTitle: string;
  prUrl: string;
  reviewerName: string;
  comments: ReviewComment[];
  ciStatus?: 'pass' | 'fail';
  ciLogs?: string;
  eventType: 'review' | 'comment' | 'ci_failure';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCommentsForAgent(comments: ReviewComment[]): string {
  if (comments.length === 0) return 'No specific comments provided.';

  return comments.map((c, i) => {
    const location = c.path
      ? `  File: ${c.path}${c.line ? `:${c.line}` : ''}`
      : '';
    return `${i + 1}. [${c.author}]${location}\n   ${c.body}`;
  }).join('\n\n');
}

function buildReviewFixMessage(ctx: ReviewFixContext): string {
  const parts: string[] = [
    `PR REVIEW FEEDBACK on "${ctx.taskTitle}"`,
    '',
  ];

  if (ctx.comments.length > 0) {
    parts.push('Reviewer comments:');
    parts.push(formatCommentsForAgent(ctx.comments));
    parts.push('');
  }

  if (ctx.ciStatus) {
    parts.push(`CI Status: ${ctx.ciStatus}`);
    if (ctx.ciStatus === 'fail' && ctx.ciLogs) {
      parts.push('');
      parts.push('CI Logs (last 80 lines):');
      // Truncate CI logs to keep message manageable
      const lines = ctx.ciLogs.split('\n');
      const truncated = lines.slice(-80).join('\n');
      parts.push(truncated);
    }
    parts.push('');
  }

  parts.push('Fix the issues raised, commit, and push to the same branch.');
  parts.push('Do NOT open a new PR.');

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Core handler
// ---------------------------------------------------------------------------

/**
 * Check whether auto-fix is enabled for the product that owns this task.
 * Returns false if the product is supervised or has auto_fix_pr_reviews disabled.
 */
function isAutoFixEnabled(task: Task): boolean {
  if (!task.product_id) return false;

  const product = queryOne<Product>(
    'SELECT * FROM products WHERE id = ?',
    [task.product_id]
  );
  if (!product) return false;

  // Check product-level toggle
  if (product.auto_fix_pr_reviews === 0) return false;

  // Check automation tier — only semi_auto and full_auto get auto-fix
  const settings = getProductSettings(product);
  if (!settings.automation_tier || settings.automation_tier === 'supervised') {
    return false;
  }

  return true;
}

/**
 * Handle a PR review event — determine if we should auto-fix, and if so,
 * transition the task and trigger a re-dispatch with review context.
 *
 * Returns true if auto-fix was triggered, false if skipped.
 */
export async function handlePRReviewFix(ctx: ReviewFixContext): Promise<boolean> {
  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [ctx.taskId]);
  if (!task) {
    console.log(`[PR Review] Task ${ctx.taskId} not found — skipping`);
    return false;
  }

  // Only auto-fix tasks that are in 'done' or already in 'review_fix'
  if (task.status !== 'done' && task.status !== 'review_fix') {
    console.log(`[PR Review] Task ${ctx.taskId} is in '${task.status}', not eligible for auto-fix`);
    return false;
  }

  if (!isAutoFixEnabled(task)) {
    console.log(`[PR Review] Auto-fix disabled for task ${ctx.taskId}`);
    return false;
  }

  const currentCount = task.review_fix_count ?? 0;
  const maxCycles = task.review_fix_max ?? 3;

  // Check if max cycles exceeded — send to human review
  if (currentCount >= maxCycles) {
    console.log(`[PR Review] Task ${ctx.taskId} hit max review-fix cycles (${maxCycles}) — sending to review`);

    run(
      `UPDATE tasks SET status = 'review', status_reason = ?, updated_at = datetime('now') WHERE id = ?`,
      [`Max auto-fix cycles (${maxCycles}) reached — needs human review`, ctx.taskId]
    );

    // Log activity
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        uuidv4(),
        ctx.taskId,
        'status_changed',
        `PR review auto-fix limit reached (${maxCycles} cycles). Moved to human review.`,
        JSON.stringify({ reviewer: ctx.reviewerName, comment_count: ctx.comments.length }),
      ]
    );

    broadcast({
      type: 'task_updated',
      payload: { taskId: ctx.taskId, status: 'review' } as Record<string, unknown>,
    });

    return false;
  }

  // Transition: done/review_fix → review_fix, increment counter
  const newCount = currentCount + 1;
  run(
    `UPDATE tasks SET status = 'review_fix', review_fix_count = ?, updated_at = datetime('now') WHERE id = ?`,
    [newCount, ctx.taskId]
  );

  // Log activity with reviewer name and comment count
  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [
      uuidv4(),
      ctx.taskId,
      'status_changed',
      `PR review feedback from ${ctx.reviewerName} (${ctx.comments.length} comment${ctx.comments.length !== 1 ? 's' : ''}). Auto-fix cycle ${newCount}/${maxCycles}.`,
      JSON.stringify({
        reviewer: ctx.reviewerName,
        comment_count: ctx.comments.length,
        cycle: newCount,
        max_cycles: maxCycles,
        event_type: ctx.eventType,
      }),
    ]
  );

  broadcast({
    type: 'task_updated',
    payload: { taskId: ctx.taskId, status: 'review_fix', review_fix_count: newCount } as Record<string, unknown>,
  });

  // Build the review-fix message and dispatch via the server-side dispatch API
  const message = buildReviewFixMessage(ctx);

  // Trigger re-dispatch to the original builder agent
  try {
    const { getMissionControlUrl } = await import('@/lib/config');
    const mcUrl = getMissionControlUrl();

    // First set task to in_progress so dispatch can proceed
    run(
      `UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?`,
      [ctx.taskId]
    );

    const dispatchRes = await fetch(`${mcUrl}/api/tasks/${ctx.taskId}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_fix_message: message }),
    });

    if (!dispatchRes.ok) {
      const errData = await dispatchRes.json().catch(() => ({}));
      console.error(`[PR Review] Dispatch failed for task ${ctx.taskId}:`, errData);
      // Revert to review_fix status so it can be retried
      run(
        `UPDATE tasks SET status = 'review_fix', updated_at = datetime('now') WHERE id = ?`,
        [ctx.taskId]
      );
      return false;
    }

    console.log(`[PR Review] Auto-fix dispatched for task ${ctx.taskId} (cycle ${newCount}/${maxCycles})`);
    return true;
  } catch (err) {
    console.error(`[PR Review] Error dispatching auto-fix for task ${ctx.taskId}:`, err);
    run(
      `UPDATE tasks SET status = 'review_fix', updated_at = datetime('now') WHERE id = ?`,
      [ctx.taskId]
    );
    return false;
  }
}
