import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { recalculateAndBroadcast } from '@/lib/autopilot/health-score';
import type { CostEvent } from '@/lib/types';

export function recordCostEvent(input: {
  product_id?: string | null;
  workspace_id?: string;
  task_id?: string | null;
  cycle_id?: string | null;
  agent_id?: string | null;
  event_type: string;
  provider?: string;
  model?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd: number;
  source_id?: string | null;
  metadata?: string;
}): CostEvent {
  const id = uuidv4();
  const workspaceId = input.workspace_id || 'default';

  run(
    `INSERT INTO cost_events (id, product_id, workspace_id, task_id, cycle_id, agent_id, event_type, provider, model, tokens_input, tokens_output, cost_usd, source_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.product_id || null, workspaceId, input.task_id || null,
      input.cycle_id || null, input.agent_id || null, input.event_type,
      input.provider || null, input.model || null,
      input.tokens_input || 0, input.tokens_output || 0,
      input.cost_usd, input.source_id || null, input.metadata || null
    ]
  );

  // Update task actual_cost_usd if task_id provided
  if (input.task_id) {
    run(
      `UPDATE tasks SET actual_cost_usd = COALESCE(actual_cost_usd, 0) + ? WHERE id = ?`,
      [input.cost_usd, input.task_id]
    );
  }

  // Update agent total_cost_usd if agent_id provided
  if (input.agent_id) {
    run(
      `UPDATE agents SET total_cost_usd = COALESCE(total_cost_usd, 0) + ?, total_tokens_used = COALESCE(total_tokens_used, 0) + ? WHERE id = ?`,
      [input.cost_usd, (input.tokens_input || 0) + (input.tokens_output || 0), input.agent_id]
    );
  }

  const event = queryOne<CostEvent>('SELECT * FROM cost_events WHERE id = ?', [id])!;

  // Recalculate health score when cost event is for a product (non-blocking)
  if (input.product_id) {
    try { recalculateAndBroadcast(input.product_id); } catch (err) {
      console.error('[CostTracker] Health score recalc failed:', err);
    }
  }

  return event;
}

export function getTaskCosts(taskId: string): CostEvent[] {
  return queryAll<CostEvent>(
    'SELECT * FROM cost_events WHERE task_id = ? ORDER BY created_at DESC',
    [taskId]
  );
}

export function getProductCosts(productId: string): CostEvent[] {
  return queryAll<CostEvent>(
    'SELECT * FROM cost_events WHERE product_id = ? ORDER BY created_at DESC',
    [productId]
  );
}
