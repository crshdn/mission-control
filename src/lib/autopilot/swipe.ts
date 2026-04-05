import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import { rebuildPreferenceModel } from './preferences';
import { recalculateAndBroadcast } from './health-score';
import type { Idea, Task, Product, SwipeHistoryEntry } from '@/lib/types';

interface SwipeInput {
  idea_id: string;
  action: 'approve' | 'reject' | 'maybe' | 'fire';
  notes?: string;
}

/**
 * Record a swipe action and perform the corresponding operation.
 * Returns the swipeId so the frontend can reference it for undo.
 */
export function recordSwipe(productId: string, input: SwipeInput): { idea: Idea; task?: Task; swipeId: string } {
  const idea = queryOne<Idea>('SELECT * FROM ideas WHERE id = ? AND product_id = ?', [input.idea_id, productId]);
  if (!idea) throw new Error(`Idea ${input.idea_id} not found`);

  const swipeId = uuidv4();

  const result = transaction(() => {
    const now = new Date().toISOString();

    // Record swipe history
    run(
      `INSERT INTO swipe_history (id, idea_id, product_id, action, category, tags, impact_score, feasibility_score, complexity, user_notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        swipeId, idea.id, productId, input.action,
        idea.category, idea.tags, idea.impact_score,
        idea.feasibility_score, idea.complexity,
        input.notes || null, now
      ]
    );

    let task: Task | undefined;

    switch (input.action) {
      case 'approve': {
        run(`UPDATE ideas SET status = 'approved', swiped_at = ?, user_notes = COALESCE(?, user_notes), updated_at = ? WHERE id = ?`,
          [now, input.notes, now, idea.id]);
        task = createTaskFromIdea(idea, { notes: input.notes });
        break;
      }
      case 'fire': {
        run(`UPDATE ideas SET status = 'approved', swiped_at = ?, user_notes = COALESCE(?, user_notes), updated_at = ? WHERE id = ?`,
          [now, input.notes, now, idea.id]);
        task = createTaskFromIdea(idea, { urgent: true, notes: input.notes });
        break;
      }
      case 'maybe': {
        run(`UPDATE ideas SET status = 'maybe', swiped_at = ?, user_notes = COALESCE(?, user_notes), updated_at = ? WHERE id = ?`,
          [now, input.notes, now, idea.id]);
        // Add to maybe pool
        const nextEval = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week
        run(
          `INSERT INTO maybe_pool (id, idea_id, product_id, next_evaluate_at, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), idea.id, productId, nextEval, now]
        );
        break;
      }
      case 'reject': {
        run(`UPDATE ideas SET status = 'rejected', swiped_at = ?, user_notes = COALESCE(?, user_notes), updated_at = ? WHERE id = ?`,
          [now, input.notes, now, idea.id]);
        break;
      }
    }

    const updatedIdea = queryOne<Idea>('SELECT * FROM ideas WHERE id = ?', [idea.id])!;
    broadcast({ type: 'idea_swiped', payload: { productId, ideaId: idea.id, action: input.action } });

    return { idea: updatedIdea, task, swipeId };
  });

  // Rebuild preference model after each swipe (non-blocking)
  try { rebuildPreferenceModel(productId); } catch (err) {
    logger.error('[Swipe] Failed to rebuild preferences:', err);
  }

  // Recalculate health score after swipe (non-blocking)
  try { recalculateAndBroadcast(productId); } catch (err) {
    logger.error('[Swipe] Failed to recalculate health score:', err);
  }

  return result;
}

/**
 * Undo a swipe action — full rollback of all side effects.
 * Server validates the 10-second window.
 */
export function undoSwipe(productId: string, swipeId: string): { idea: Idea } {
  const UNDO_WINDOW_MS = 10_000;

  const swipe = queryOne<SwipeHistoryEntry>(
    'SELECT * FROM swipe_history WHERE id = ? AND product_id = ?',
    [swipeId, productId]
  );
  if (!swipe) throw new Error(`Swipe ${swipeId} not found`);

  // Server-side 10-second validation
  const swipeAge = Date.now() - new Date(swipe.created_at).getTime();
  if (swipeAge > UNDO_WINDOW_MS) {
    throw new Error('Undo window has expired (10 seconds)');
  }

  const result = transaction(() => {
    const now = new Date().toISOString();
    const idea = queryOne<Idea>('SELECT * FROM ideas WHERE id = ?', [swipe.idea_id]);
    if (!idea) throw new Error(`Idea ${swipe.idea_id} not found`);

    // Restore idea to pending FIRST (clears task_id FK before task deletion)
    run(
      `UPDATE ideas SET status = 'pending', swiped_at = NULL, task_id = NULL, user_notes = NULL, updated_at = ? WHERE id = ?`,
      [now, swipe.idea_id]
    );

    // Rollback side effects based on original action
    switch (swipe.action) {
      case 'approve':
      case 'fire': {
        // Delete the task that was created (if any)
        if (idea.task_id) {
          // Clear any FK references from other tables pointing to this task
          run('DELETE FROM task_activities WHERE task_id = ?', [idea.task_id]);
          run('DELETE FROM task_deliverables WHERE task_id = ?', [idea.task_id]);
          run('DELETE FROM task_roles WHERE task_id = ?', [idea.task_id]);
          run('DELETE FROM task_notes WHERE task_id = ?', [idea.task_id]);
          run('DELETE FROM planning_questions WHERE task_id = ?', [idea.task_id]);
          run('DELETE FROM planning_specs WHERE task_id = ?', [idea.task_id]);
          // Clear any other ideas that might reference this task
          run('UPDATE ideas SET task_id = NULL WHERE task_id = ? AND id != ?', [idea.task_id, swipe.idea_id]);
          // Clear workspace ports
          run('DELETE FROM workspace_ports WHERE task_id = ?', [idea.task_id]);
          // Clear workspace merges
          run('DELETE FROM workspace_merges WHERE task_id = ?', [idea.task_id]);
          // Clear events referencing this task
          run('UPDATE events SET task_id = NULL WHERE task_id = ?', [idea.task_id]);
          // Clear openclaw_sessions referencing this task
          run('UPDATE openclaw_sessions SET task_id = NULL WHERE task_id = ?', [idea.task_id]);
          // Now safe to delete the task
          run('DELETE FROM tasks WHERE id = ?', [idea.task_id]);
        }
        break;
      }
      case 'maybe': {
        // Remove from maybe pool
        run('DELETE FROM maybe_pool WHERE idea_id = ? AND product_id = ?', [swipe.idea_id, productId]);
        break;
      }
      case 'reject': {
        // No extra side effects to undo
        break;
      }
    }

    // Delete the swipe history record
    run('DELETE FROM swipe_history WHERE id = ?', [swipeId]);

    const restoredIdea = queryOne<Idea>('SELECT * FROM ideas WHERE id = ?', [swipe.idea_id])!;
    broadcast({ type: 'idea_swiped', payload: { productId, ideaId: swipe.idea_id, action: 'undo' } });

    return { idea: restoredIdea };
  });

  // Rebuild preference model after undo
  try { rebuildPreferenceModel(productId); } catch (err) {
    logger.error('[Swipe] Failed to rebuild preferences after undo:', err);
  }

  // Recalculate health score after undo
  try { recalculateAndBroadcast(productId); } catch (err) {
    logger.error('[Swipe] Failed to recalculate health score after undo:', err);
  }

  return result;
}

/**
 * Process a batch of swipe actions in a single transaction.
 * All-or-nothing: if any idea fails, entire batch rolls back.
 */
export function batchSwipe(
  productId: string,
  actions: Array<{ idea_id: string; action: 'approve' | 'reject' | 'maybe' | 'fire'; notes?: string }>
): Array<{ idea_id: string; action: string; idea: Idea; task?: Task; swipeId: string }> {
  const results = transaction(() => {
    const batchResults: Array<{ idea_id: string; action: string; idea: Idea; task?: Task; swipeId: string }> = [];

    for (const item of actions) {
      // Verify idea is still pending before processing
      const idea = queryOne<Idea>(
        `SELECT * FROM ideas WHERE id = ? AND product_id = ? AND status = 'pending'`,
        [item.idea_id, productId]
      );
      if (!idea) {
        throw new Error(`Idea ${item.idea_id} is not in pending status — may have been swiped by a concurrent session`);
      }

      const now = new Date().toISOString();
      const swipeId = uuidv4();

      // Record swipe history
      run(
        `INSERT INTO swipe_history (id, idea_id, product_id, action, category, tags, impact_score, feasibility_score, complexity, user_notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          swipeId, idea.id, productId, item.action,
          idea.category, idea.tags, idea.impact_score,
          idea.feasibility_score, idea.complexity,
          item.notes || null, now
        ]
      );

      let task: Task | undefined;

      switch (item.action) {
        case 'approve': {
          run(`UPDATE ideas SET status = 'approved', swiped_at = ?, user_notes = COALESCE(?, user_notes), updated_at = ? WHERE id = ?`,
            [now, item.notes, now, idea.id]);
          task = createTaskFromIdea(idea, { notes: item.notes });
          break;
        }
        case 'fire': {
          run(`UPDATE ideas SET status = 'approved', swiped_at = ?, user_notes = COALESCE(?, user_notes), updated_at = ? WHERE id = ?`,
            [now, item.notes, now, idea.id]);
          task = createTaskFromIdea(idea, { urgent: true, notes: item.notes });
          break;
        }
        case 'maybe': {
          run(`UPDATE ideas SET status = 'maybe', swiped_at = ?, user_notes = COALESCE(?, user_notes), updated_at = ? WHERE id = ?`,
            [now, item.notes, now, idea.id]);
          const nextEval = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          run(
            `INSERT INTO maybe_pool (id, idea_id, product_id, next_evaluate_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), idea.id, productId, nextEval, now]
          );
          break;
        }
        case 'reject': {
          run(`UPDATE ideas SET status = 'rejected', swiped_at = ?, user_notes = COALESCE(?, user_notes), updated_at = ? WHERE id = ?`,
            [now, item.notes, now, idea.id]);
          break;
        }
      }

      const updatedIdea = queryOne<Idea>('SELECT * FROM ideas WHERE id = ?', [idea.id])!;
      batchResults.push({ idea_id: item.idea_id, action: item.action, idea: updatedIdea, task, swipeId });
    }

    return batchResults;
  });

  // Rebuild preference model once after entire batch
  try { rebuildPreferenceModel(productId); } catch (err) {
    logger.error('[Swipe] Failed to rebuild preferences after batch:', err);
  }

  broadcast({ type: 'idea_swiped', payload: { productId, action: 'batch', count: results.length } });

  return results;
}

/**
 * Get count of pending ideas for a product.
 */
export function getPendingCount(productId: string): number {
  const result = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ideas WHERE product_id = ? AND status = 'pending'`,
    [productId]
  );
  return result?.count || 0;
}

/**
 * Create a Autensa task from an approved idea.
 */
function createTaskFromIdea(idea: Idea, opts?: { urgent?: boolean; notes?: string }): Task {
  const taskId = uuidv4();
  const now = new Date().toISOString();
  const priority = opts?.urgent ? 'urgent' : (idea.complexity === 'XL' || idea.complexity === 'L' ? 'high' : 'normal');

  // Get full product for repo context + build mode
  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [idea.product_id]);
  const workspaceId = product?.workspace_id || 'default';

  // Build mode determines initial status
  const buildMode = product?.build_mode || 'plan_first';
  let status: string;
  if (buildMode === 'auto_build') {
    status = 'assigned'; // will trigger auto-dispatch
  } else {
    status = opts?.urgent ? 'inbox' : 'planning';
  }

  // Check cost cap before auto-dispatch
  if (status === 'assigned' && product?.cost_cap_monthly) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlySpend = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events
       WHERE product_id = ? AND created_at >= ?`,
      [idea.product_id, monthStart.toISOString()]
    );
    if (monthlySpend && monthlySpend.total >= product.cost_cap_monthly) {
      // Cap exceeded — queue to inbox instead of auto-dispatching
      status = 'inbox';
      logger.warn(`[AutoBuild] Monthly cap exceeded for product ${product.name}: $${monthlySpend.total}/$${product.cost_cap_monthly} — queuing to inbox`);
    }
  }

  // Get default workflow template
  const template = queryOne<{ id: string }>(`SELECT id FROM workflow_templates WHERE workspace_id = ? AND is_default = 1`, [workspaceId]);

  const description = [
    idea.description,
    idea.technical_approach ? `\n\n## Technical Approach\n${idea.technical_approach}` : '',
    idea.research_backing ? `\n\n## Research Backing\n${idea.research_backing}` : '',
    opts?.notes ? `\n\n## User Notes\n${opts.notes}` : '',
  ].join('');

  // Estimate cost based on complexity
  const costEstimates: Record<string, number> = { S: 3, M: 10, L: 25, XL: 60 };
  const estimatedCost = idea.complexity ? costEstimates[idea.complexity] || 10 : 10;

  run(
    `INSERT INTO tasks (id, title, description, status, priority, workspace_id, workflow_template_id, product_id, idea_id, estimated_cost_usd, repo_url, repo_branch, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [taskId, idea.title, description, status, priority, workspaceId, template?.id || null, idea.product_id, idea.id, estimatedCost, product?.repo_url || null, product?.default_branch || 'main', now, now]
  );

  // Link idea to task
  run('UPDATE ideas SET task_id = ?, status = ?, updated_at = ? WHERE id = ?', [taskId, 'building', now, idea.id]);

  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId])!;

  broadcast({ type: 'task_created', payload: task });
  broadcast({ type: 'idea_building', payload: { productId: idea.product_id, ideaId: idea.id, taskId } });

  // Auto-dispatch if build mode assigned the task directly
  if (status === 'assigned') {
    queueDispatch(taskId);
  }

  return task;
}

/**
 * Queue an async dispatch — fire-and-forget internal fetch to the dispatch endpoint.
 */
function queueDispatch(taskId: string): void {
  const url = getMissionControlUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.AUTENSA_API_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.AUTENSA_API_TOKEN}`;
  }
  fetch(`${url}/api/tasks/${taskId}/dispatch`, { method: 'POST', headers, signal: AbortSignal.timeout(30_000) })
    .then(res => { if (!res.ok) logger.error('[AutoDispatch] Failed:', res.status); })
    .catch(err => logger.error('[AutoDispatch] Error:', err));
}

/**
 * Get the swipe deck — pending ideas ordered for review.
 */
export function getSwipeDeck(productId: string): Idea[] {
  return queryAll<Idea>(
    `SELECT * FROM ideas WHERE product_id = ? AND status = 'pending'
     ORDER BY COALESCE(impact_score, 5) DESC, created_at ASC`,
    [productId]
  );
}

/**
 * Get swipe history.
 */
export function getSwipeHistory(productId: string, limit = 100): SwipeHistoryEntry[] {
  return queryAll<SwipeHistoryEntry>(
    'SELECT * FROM swipe_history WHERE product_id = ? ORDER BY created_at DESC LIMIT ?',
    [productId, limit]
  );
}

/**
 * Get swipe statistics.
 */
export function getSwipeStats(productId: string): {
  total: number;
  approved: number;
  rejected: number;
  maybe: number;
  fired: number;
  approval_rate: number;
  by_category: Array<{ category: string; approved: number; rejected: number; total: number; rate: number }>;
} {
  const total = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM swipe_history WHERE product_id = ?', [productId])?.count || 0;
  const approved = queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM swipe_history WHERE product_id = ? AND action = 'approve'`, [productId])?.count || 0;
  const rejected = queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM swipe_history WHERE product_id = ? AND action = 'reject'`, [productId])?.count || 0;
  const maybe = queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM swipe_history WHERE product_id = ? AND action = 'maybe'`, [productId])?.count || 0;
  const fired = queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM swipe_history WHERE product_id = ? AND action = 'fire'`, [productId])?.count || 0;

  const by_category = queryAll<{ category: string; approved: number; rejected: number; total: number; rate: number }>(
    `SELECT
       category,
       SUM(CASE WHEN action IN ('approve', 'fire') THEN 1 ELSE 0 END) as approved,
       SUM(CASE WHEN action = 'reject' THEN 1 ELSE 0 END) as rejected,
       COUNT(*) as total,
       ROUND(CAST(SUM(CASE WHEN action IN ('approve', 'fire') THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*), 2) as rate
     FROM swipe_history WHERE product_id = ?
     GROUP BY category ORDER BY rate DESC`,
    [productId]
  );

  return {
    total,
    approved: approved + fired,
    rejected,
    maybe,
    fired,
    approval_rate: total > 0 ? (approved + fired) / total : 0,
    by_category,
  };
}
