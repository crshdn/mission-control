import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { CostCap, Product } from '@/lib/types';

export function createCostCap(input: {
  workspace_id?: string;
  product_id?: string | null;
  cap_type: string;
  limit_usd: number;
  period_start?: string;
  period_end?: string;
}): CostCap {
  const id = uuidv4();
  const workspaceId = input.workspace_id || 'default';
  const now = new Date().toISOString();

  run(
    `INSERT INTO cost_caps (id, workspace_id, product_id, cap_type, limit_usd, period_start, period_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workspaceId, input.product_id || null, input.cap_type, input.limit_usd, input.period_start || null, input.period_end || null, now, now]
  );

  return queryOne<CostCap>('SELECT * FROM cost_caps WHERE id = ?', [id])!;
}

export function listCostCaps(workspaceId?: string, productId?: string): CostCap[] {
  if (productId) {
    return queryAll<CostCap>(
      'SELECT * FROM cost_caps WHERE product_id = ? ORDER BY created_at DESC',
      [productId]
    );
  }
  const wsId = workspaceId || 'default';
  return queryAll<CostCap>(
    'SELECT * FROM cost_caps WHERE workspace_id = ? ORDER BY created_at DESC',
    [wsId]
  );
}

export function updateCostCap(id: string, updates: Partial<{
  limit_usd: number;
  status: string;
  current_spend_usd: number;
  period_start: string;
  period_end: string;
}>): CostCap | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return queryOne<CostCap>('SELECT * FROM cost_caps WHERE id = ?', [id]);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  run(`UPDATE cost_caps SET ${fields.join(', ')} WHERE id = ?`, values);
  return queryOne<CostCap>('SELECT * FROM cost_caps WHERE id = ?', [id]);
}

export function deleteCostCap(id: string): boolean {
  return run('DELETE FROM cost_caps WHERE id = ?', [id]).changes > 0;
}

/** Check all active caps for a workspace/product. Returns warnings and exceeded caps. */
export function checkCaps(workspaceId: string, productId?: string): {
  warnings: CostCap[];
  exceeded: CostCap[];
  ok: boolean;
} {
  const caps = queryAll<CostCap>(
    `SELECT * FROM cost_caps
     WHERE workspace_id = ?
       AND status != 'paused'
       AND (? IS NULL OR product_id IS NULL OR product_id = ?)`,
    [workspaceId, productId || null, productId || null]
  );

  const warnings: CostCap[] = [];
  const exceeded: CostCap[] = [];

  for (const cap of caps) {
    if (!productId && cap.product_id) continue;

    // Calculate current spend based on cap type
    let currentSpend = 0;
    const now = new Date();
    const spendParams: unknown[] = [];
    let spendScope = 'workspace_id = ?';
    if (cap.product_id) {
      spendScope = 'product_id = ?';
      spendParams.push(cap.product_id);
    } else {
      spendParams.push(workspaceId);
    }

    if (cap.cap_type === 'daily') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const result = queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events WHERE ${spendScope} AND created_at >= ?`,
        [...spendParams, todayStart]
      );
      currentSpend = result?.total || 0;
    } else if (cap.cap_type === 'monthly') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const result = queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events WHERE ${spendScope} AND created_at >= ?`,
        [...spendParams, monthStart]
      );
      currentSpend = result?.total || 0;
    } else if (cap.cap_type === 'per_product_monthly' && (cap.product_id || productId)) {
      const pid = cap.product_id || productId;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const result = queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events WHERE product_id = ? AND created_at >= ?`,
        [pid, monthStart]
      );
      currentSpend = result?.total || 0;
    } else {
      currentSpend = cap.current_spend_usd;
    }

    // Update current_spend_usd
    run('UPDATE cost_caps SET current_spend_usd = ? WHERE id = ?', [currentSpend, cap.id]);

    const ratio = currentSpend / cap.limit_usd;

    if (ratio >= 1) {
      exceeded.push({ ...cap, current_spend_usd: currentSpend });
      if (cap.status !== 'exceeded') {
        run(`UPDATE cost_caps SET status = 'exceeded', updated_at = ? WHERE id = ?`, [new Date().toISOString(), cap.id]);
        broadcast({ type: 'cost_cap_exceeded', payload: { capId: cap.id, capType: cap.cap_type, currentSpend, limit: cap.limit_usd } });
      }
    } else if (ratio >= 0.8) {
      warnings.push({ ...cap, current_spend_usd: currentSpend });
      if (cap.status !== 'active') {
        run(`UPDATE cost_caps SET status = 'active', updated_at = ? WHERE id = ?`, [new Date().toISOString(), cap.id]);
      }
      broadcast({ type: 'cost_cap_warning', payload: { capId: cap.id, capType: cap.cap_type, currentSpend, limit: cap.limit_usd, ratio } });
    } else if (cap.status !== 'active') {
      run(`UPDATE cost_caps SET status = 'active', updated_at = ? WHERE id = ?`, [new Date().toISOString(), cap.id]);
    }
  }

  return { warnings, exceeded, ok: exceeded.length === 0 };
}

export function evaluateProductCostGuards(product: Pick<Product, 'id' | 'name' | 'workspace_id' | 'cost_cap_monthly' | 'cost_cap_per_task'>, estimatedTaskCostUsd?: number): {
  warnings: string[];
  exceeded: string[];
  ok: boolean;
} {
  const warnings: string[] = [];
  const exceeded: string[] = [];

  const capStatus = checkCaps(product.workspace_id, product.id);
  warnings.push(...capStatus.warnings.map((cap) => `${cap.cap_type} cap at $${cap.current_spend_usd.toFixed(2)}/$${cap.limit_usd.toFixed(2)}`));
  exceeded.push(...capStatus.exceeded.map((cap) => `${cap.cap_type} cap exceeded at $${cap.current_spend_usd.toFixed(2)}/$${cap.limit_usd.toFixed(2)}`));

  if (product.cost_cap_monthly) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlySpend = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events
       WHERE product_id = ? AND created_at >= ?`,
      [product.id, monthStart.toISOString()]
    );
    const total = monthlySpend?.total || 0;
    if (total >= product.cost_cap_monthly) {
      exceeded.push(`legacy monthly product cap exceeded at $${total.toFixed(2)}/$${product.cost_cap_monthly.toFixed(2)}`);
    } else if (total >= product.cost_cap_monthly * 0.8) {
      warnings.push(`legacy monthly product cap at $${total.toFixed(2)}/$${product.cost_cap_monthly.toFixed(2)}`);
    }
  }

  if (product.cost_cap_per_task && estimatedTaskCostUsd !== undefined && estimatedTaskCostUsd > product.cost_cap_per_task) {
    exceeded.push(
      `legacy per-task product cap exceeded by estimate $${estimatedTaskCostUsd.toFixed(2)}/$${product.cost_cap_per_task.toFixed(2)}`,
    );
  }

  return {
    warnings,
    exceeded,
    ok: exceeded.length === 0,
  };
}
