import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Product } from '@/lib/types';

export function createProduct(input: {
  workspace_id?: string;
  name: string;
  description?: string;
  repo_url?: string;
  live_url?: string;
  product_program?: string;
  icon?: string;
  settings?: string;
  build_mode?: string;
  default_branch?: string;
}): Product {
  const id = uuidv4();
  const now = new Date().toISOString();
  const workspaceId = input.workspace_id || 'default';

  run(
    `INSERT INTO products (id, workspace_id, name, description, repo_url, live_url, product_program, icon, settings, build_mode, default_branch, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workspaceId, input.name, input.description || null, input.repo_url || null, input.live_url || null, input.product_program || null, input.icon || '🚀', input.settings || null, input.build_mode || 'plan_first', input.default_branch || 'main', now, now]
  );

  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [id])!;
  return product;
}

export function getProduct(id: string): Product | undefined {
  return queryOne<Product>('SELECT * FROM products WHERE id = ?', [id]);
}

export function listProducts(workspaceId?: string): Product[] {
  if (workspaceId) {
    return queryAll<Product>('SELECT * FROM products WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId]);
  }
  return queryAll<Product>('SELECT * FROM products ORDER BY created_at DESC');
}

export function updateProduct(id: string, updates: Partial<{
  name: string;
  description: string | null;
  repo_url: string | null;
  live_url: string | null;
  product_program: string;
  icon: string;
  status: string;
  settings: string;
  build_mode: string;
  default_branch: string;
  cost_cap_per_task: number | null;
  cost_cap_monthly: number | null;
  batch_review_threshold: number;
  max_parallel_agents: number | null;
}>): Product | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getProduct(id);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
  return getProduct(id);
}

export function archiveProduct(id: string): boolean {
  const result = run(
    `UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
  return result.changes > 0;
}

export function hardDeleteProduct(id: string): boolean {
  const result = run(`DELETE FROM products WHERE id = ?`, [id]);
  return result.changes > 0;
}
