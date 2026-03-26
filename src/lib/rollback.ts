/**
 * Automated Rollback Pipeline
 *
 * Monitors post-merge health and CI status. When a merged PR causes failures
 * (health check or CI), automatically creates a revert PR, merges it,
 * notifies via SSE, and pauses the product's automation tier until acknowledged.
 *
 * Product settings JSON fields used:
 *   - health_check_url: string          — URL to poll after merge
 *   - post_merge_monitor_minutes: number — how long to poll (default 5)
 *   - automation_tier: 'supervised' | 'semi_auto' | 'full_auto'
 */

import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Product, Task } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RollbackEvent {
  id: string;
  product_id: string;
  task_id: string | null;
  trigger_type: 'health_check' | 'ci_failure' | 'manual';
  trigger_details: string;
  merged_pr_url: string;
  merged_commit_sha: string;
  revert_pr_url: string | null;
  revert_pr_status: 'pending' | 'created' | 'merged' | 'failed';
  previous_automation_tier: string | null;
  acknowledged: number;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

export interface ProductSettings {
  health_check_url?: string;
  post_merge_monitor_minutes?: number;
  automation_tier?: 'supervised' | 'semi_auto' | 'full_auto';
  [key: string]: unknown;
}

export interface HealthCheckResult {
  healthy: boolean;
  statusCode?: number;
  error?: string;
  responseTime?: number;
}

// ---------------------------------------------------------------------------
// Product settings helpers
// ---------------------------------------------------------------------------

export function getProductSettings(product: Product): ProductSettings {
  if (!product.settings) return {};
  try {
    return JSON.parse(product.settings) as ProductSettings;
  } catch {
    return {};
  }
}

export function updateProductSettings(productId: string, updates: Partial<ProductSettings>): void {
  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [productId]);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const current = getProductSettings(product);
  const merged = { ...current, ...updates };
  const now = new Date().toISOString();

  run(
    'UPDATE products SET settings = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(merged), now, productId]
  );
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export async function checkHealth(url: string): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'MissionControl-RollbackMonitor/1.0' },
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    // Check for error status codes
    if (res.status >= 500) {
      return { healthy: false, statusCode: res.status, responseTime, error: `HTTP ${res.status}` };
    }

    // Check response body for error indicators
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await res.json();
        if (body.error || body.status === 'error' || body.healthy === false) {
          return {
            healthy: false,
            statusCode: res.status,
            responseTime,
            error: body.error || body.message || 'Response indicates error state',
          };
        }
      } catch {
        // JSON parse failure is not itself an error indicator
      }
    }

    return { healthy: res.status < 400, statusCode: res.status, responseTime };
  } catch (err) {
    return {
      healthy: false,
      error: err instanceof Error ? err.message : 'Health check failed',
      responseTime: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

function parseGitHubPrUrl(prUrl: string): { owner: string; repo: string; number: number } | null {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}

type GitHubContentResponse = {
  sha: string;
  content?: string;
  encoding?: string;
};

type GitHubCompareFile = {
  filename: string;
  previous_filename?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | string;
};

async function fetchGitHubJson<T>(url: string, headers: Record<string, string>, init?: RequestInit): Promise<T | null> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    console.error('[Rollback] GitHub request failed:', response.status, await response.text());
    return null;
  }

  return await response.json() as T;
}

async function fetchContentAtRef(
  apiBase: string,
  headers: Record<string, string>,
  filePath: string,
  ref: string,
): Promise<GitHubContentResponse | null> {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  return fetchGitHubJson<GitHubContentResponse>(
    `${apiBase}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    headers,
  );
}

async function restoreFileOnBranch(params: {
  apiBase: string;
  headers: Record<string, string>;
  branch: string;
  filePath: string;
  sourceRef: string;
  commitMessage: string;
}): Promise<boolean> {
  const source = await fetchContentAtRef(params.apiBase, params.headers, params.filePath, params.sourceRef);
  if (!source?.content) {
    console.error('[Rollback] Missing source content for restore:', params.filePath, params.sourceRef);
    return false;
  }

  const current = await fetchContentAtRef(params.apiBase, params.headers, params.filePath, params.branch);
  const body = {
    message: params.commitMessage,
    content: source.content.replace(/\n/g, ''),
    branch: params.branch,
    sha: current?.sha,
  };

  const response = await fetch(`${params.apiBase}/contents/${params.filePath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    headers: { ...params.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.ok) return true;
  console.error('[Rollback] Failed to restore file on branch:', params.filePath, await response.text());
  return false;
}

async function deleteFileOnBranch(params: {
  apiBase: string;
  headers: Record<string, string>;
  branch: string;
  filePath: string;
  commitMessage: string;
}): Promise<boolean> {
  const current = await fetchContentAtRef(params.apiBase, params.headers, params.filePath, params.branch);
  if (!current?.sha) {
    return true;
  }

  const response = await fetch(`${params.apiBase}/contents/${params.filePath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    headers: { ...params.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.commitMessage,
      branch: params.branch,
      sha: current.sha,
    }),
  });

  if (response.ok) return true;
  console.error('[Rollback] Failed to delete file on branch:', params.filePath, await response.text());
  return false;
}

async function applyRevertChanges(params: {
  apiBase: string;
  headers: Record<string, string>;
  branch: string;
  mergedCommitSha: string;
  parentSha: string;
  prNumber: number;
}): Promise<boolean> {
  const compare = await fetchGitHubJson<{ files?: GitHubCompareFile[] }>(
    `${params.apiBase}/compare/${params.parentSha}...${params.mergedCommitSha}`,
    params.headers,
  );
  const files = compare?.files || [];

  if (files.length === 0) {
    console.error('[Rollback] No changed files found to revert');
    return false;
  }

  for (const file of files) {
    const commitMessage = `Revert PR #${params.prNumber}: ${file.filename}`;

    if (file.status === 'added') {
      const deleted = await deleteFileOnBranch({
        apiBase: params.apiBase,
        headers: params.headers,
        branch: params.branch,
        filePath: file.filename,
        commitMessage,
      });
      if (!deleted) return false;
      continue;
    }

    if (file.status === 'renamed' && file.previous_filename) {
      const deletedRenamedFile = await deleteFileOnBranch({
        apiBase: params.apiBase,
        headers: params.headers,
        branch: params.branch,
        filePath: file.filename,
        commitMessage: `${commitMessage} (remove renamed path)`,
      });
      if (!deletedRenamedFile) return false;

      const restoredPreviousFile = await restoreFileOnBranch({
        apiBase: params.apiBase,
        headers: params.headers,
        branch: params.branch,
        filePath: file.previous_filename,
        sourceRef: params.parentSha,
        commitMessage: `${commitMessage} (restore previous path)`,
      });
      if (!restoredPreviousFile) return false;
      continue;
    }

    const restored = await restoreFileOnBranch({
      apiBase: params.apiBase,
      headers: params.headers,
      branch: params.branch,
      filePath: file.filename,
      sourceRef: params.parentSha,
      commitMessage,
    });
    if (!restored) return false;
  }

  return true;
}

export async function createRevertPR(
  mergedPrUrl: string,
  mergedCommitSha: string,
  reason: string,
  defaultBranch: string = 'main'
): Promise<{ url: string; number: number } | null> {
  const token = getGitHubToken();
  if (!token) {
    console.error('[Rollback] No GitHub token available for revert PR creation');
    return null;
  }

  const parsed = parseGitHubPrUrl(mergedPrUrl);
  if (!parsed) {
    console.error('[Rollback] Cannot parse PR URL:', mergedPrUrl);
    return null;
  }

  const { owner, repo, number: prNumber } = parsed;
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MissionControl-Rollback/1.0',
  };

  try {
    // 1. Create a revert branch from the default branch
    const revertBranch = `revert/auto-rollback-${prNumber}-${Date.now()}`;

    // Get the ref for default branch
    const refRes = await fetch(`${apiBase}/git/ref/heads/${defaultBranch}`, { headers });
    if (!refRes.ok) {
      console.error('[Rollback] Failed to get default branch ref:', await refRes.text());
      return null;
    }
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // Create the revert branch
    const createRefRes = await fetch(`${apiBase}/git/refs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: `refs/heads/${revertBranch}`,
        sha: baseSha,
      }),
    });
    if (!createRefRes.ok) {
      console.error('[Rollback] Failed to create revert branch:', await createRefRes.text());
      return null;
    }

    // 2. Recreate the parent version of every changed file on the revert branch.
    const commitData = await fetchGitHubJson<{ parents?: Array<{ sha?: string }> }>(
      `${apiBase}/commits/${mergedCommitSha}`,
      headers,
    );
    const parentSha = commitData?.parents?.[0]?.sha;
    if (!parentSha) {
      console.error('[Rollback] Failed to resolve parent commit for rollback:', mergedCommitSha);
      return null;
    }

    const reverted = await applyRevertChanges({
      apiBase,
      headers,
      branch: revertBranch,
      mergedCommitSha,
      parentSha,
      prNumber,
    });
    if (!reverted) {
      console.error('[Rollback] Failed to apply revert changes for PR:', prNumber);
      return null;
    }

    // 3. Create the revert PR
    const prRes = await fetch(`${apiBase}/pulls`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `🔄 Auto-Rollback: Revert PR #${prNumber}`,
        head: revertBranch,
        base: defaultBranch,
        body: [
          `## Automated Rollback`,
          ``,
          `**Trigger:** ${reason}`,
          `**Original PR:** #${prNumber}`,
          `**Reverted Commit:** ${mergedCommitSha}`,
          ``,
          `This revert was automatically created by Mission Control's rollback pipeline.`,
          `The product's automation tier has been paused to \`supervised\` until acknowledged.`,
          ``,
          `---`,
          `*Auto-generated by Mission Control Rollback Pipeline*`,
        ].join('\n'),
      }),
    });

    if (!prRes.ok) {
      const errText = await prRes.text();
      console.error('[Rollback] Failed to create revert PR:', errText);
      return null;
    }

    const prData = await prRes.json();
    console.log(`[Rollback] Revert PR created: ${prData.html_url}`);

    return { url: prData.html_url, number: prData.number };
  } catch (err) {
    console.error('[Rollback] Error creating revert PR:', err);
    return null;
  }
}

export async function mergeRevertPR(prUrl: string): Promise<boolean> {
  const token = getGitHubToken();
  if (!token) return false;

  const parsed = parseGitHubPrUrl(prUrl);
  if (!parsed) return false;

  const { owner, repo, number: prNumber } = parsed;

  let retries = 5;
  while (retries > 0) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commit_title: `Auto-merge rollback: Revert PR #${prNumber}`,
            merge_method: 'merge',
          }),
        }
      );

      if (res.ok) {
        console.log(`[Rollback] Revert PR #${prNumber} merged successfully`);
        return true;
      }

      const resBody = await res.text();
      
      if (res.status === 405 && resBody.includes('Base branch was modified')) {
        console.warn(`[Rollback] Revert PR #${prNumber} hit 405 mergeability delay, retrying (${retries - 1} left)...`);
        retries--;
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      console.error('[Rollback] Failed to merge revert PR:', resBody);
      return false;
    } catch (err) {
      console.error('[Rollback] Error merging revert PR:', err);
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rollback event recording
// ---------------------------------------------------------------------------

export function recordRollbackEvent(event: {
  product_id: string;
  task_id?: string;
  trigger_type: 'health_check' | 'ci_failure' | 'manual';
  trigger_details: string;
  merged_pr_url: string;
  merged_commit_sha: string;
  revert_pr_url?: string;
  revert_pr_status: 'pending' | 'created' | 'merged' | 'failed';
  previous_automation_tier?: string;
}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  run(
    `INSERT INTO rollback_history
     (id, product_id, task_id, trigger_type, trigger_details, merged_pr_url, merged_commit_sha,
      revert_pr_url, revert_pr_status, previous_automation_tier, acknowledged, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      event.product_id,
      event.task_id || null,
      event.trigger_type,
      event.trigger_details,
      event.merged_pr_url,
      event.merged_commit_sha,
      event.revert_pr_url || null,
      event.revert_pr_status,
      event.previous_automation_tier || null,
      now,
    ]
  );

  return id;
}

export function updateRollbackEvent(id: string, updates: Partial<{
  revert_pr_url: string;
  revert_pr_status: string;
}>): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return;
  values.push(id);
  run(`UPDATE rollback_history SET ${fields.join(', ')} WHERE id = ?`, values);
}

export function acknowledgeRollback(id: string, acknowledgedBy: string = 'user'): void {
  const now = new Date().toISOString();
  run(
    'UPDATE rollback_history SET acknowledged = 1, acknowledged_at = ?, acknowledged_by = ? WHERE id = ?',
    [now, acknowledgedBy, id]
  );
}

export function listRollbackHistory(productId?: string, limit: number = 50): RollbackEvent[] {
  if (productId) {
    return queryAll<RollbackEvent>(
      'SELECT * FROM rollback_history WHERE product_id = ? ORDER BY created_at DESC LIMIT ?',
      [productId, limit]
    );
  }
  return queryAll<RollbackEvent>(
    'SELECT * FROM rollback_history ORDER BY created_at DESC LIMIT ?',
    [limit]
  );
}

export function getUnacknowledgedRollbacks(productId?: string): RollbackEvent[] {
  if (productId) {
    return queryAll<RollbackEvent>(
      'SELECT * FROM rollback_history WHERE product_id = ? AND acknowledged = 0 ORDER BY created_at DESC',
      [productId]
    );
  }
  return queryAll<RollbackEvent>(
    'SELECT * FROM rollback_history WHERE acknowledged = 0 ORDER BY created_at DESC'
  );
}

// ---------------------------------------------------------------------------
// Core rollback pipeline
// ---------------------------------------------------------------------------

/**
 * Execute the full rollback pipeline:
 * 1. Record event
 * 2. Create revert PR
 * 3. Auto-merge the revert
 * 4. Pause automation tier → supervised
 * 5. Emit SSE notification
 */
export async function executeRollback(params: {
  productId: string;
  taskId?: string;
  triggerType: 'health_check' | 'ci_failure' | 'manual';
  triggerDetails: string;
  mergedPrUrl: string;
  mergedCommitSha: string;
}): Promise<{ rollbackId: string; revertPrUrl: string | null; success: boolean }> {
  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [params.productId]);
  if (!product) throw new Error(`Product not found: ${params.productId}`);

  const settings = getProductSettings(product);
  const previousTier = settings.automation_tier || null;
  const defaultBranch = product.default_branch || 'main';

  // 1. Record the rollback event
  const rollbackId = recordRollbackEvent({
    product_id: params.productId,
    task_id: params.taskId,
    trigger_type: params.triggerType,
    trigger_details: params.triggerDetails,
    merged_pr_url: params.mergedPrUrl,
    merged_commit_sha: params.mergedCommitSha,
    revert_pr_status: 'pending',
    previous_automation_tier: previousTier || undefined,
  });

  // 2. Create revert PR
  const revertPr = await createRevertPR(
    params.mergedPrUrl,
    params.mergedCommitSha,
    params.triggerDetails,
    defaultBranch
  );

  let revertPrUrl: string | null = null;
  let success = false;

  if (revertPr) {
    revertPrUrl = revertPr.url;
    updateRollbackEvent(rollbackId, {
      revert_pr_url: revertPr.url,
      revert_pr_status: 'created',
    });

    // 3. Auto-merge the revert PR
    const merged = await mergeRevertPR(revertPr.url);
    if (merged) {
      updateRollbackEvent(rollbackId, { revert_pr_status: 'merged' });
      success = true;
    } else {
      updateRollbackEvent(rollbackId, { revert_pr_status: 'failed' });
    }
  } else {
    updateRollbackEvent(rollbackId, { revert_pr_status: 'failed' });
  }

  // 4. Pause automation tier → supervised
  if (settings.automation_tier && settings.automation_tier !== 'supervised') {
    updateProductSettings(params.productId, { automation_tier: 'supervised' });
    console.log(`[Rollback] Product ${product.name}: automation tier paused to supervised (was: ${settings.automation_tier})`);
  }

  // 5. Broadcast SSE event
  broadcast({
    type: 'task_updated',
    payload: {
      event: 'rollback_triggered',
      rollbackId,
      productId: params.productId,
      productName: product.name,
      triggerType: params.triggerType,
      triggerDetails: params.triggerDetails,
      mergedPrUrl: params.mergedPrUrl,
      revertPrUrl,
      revertStatus: revertPr ? (success ? 'merged' : 'created') : 'failed',
      automationTierPaused: !!previousTier && previousTier !== 'supervised',
      previousTier,
    },
  });

  // 6. Log event in events table for audit trail
  run(
    `INSERT INTO events (id, type, task_id, message, metadata, created_at)
     VALUES (?, 'system', ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      params.taskId || null,
      `Rollback triggered: ${params.triggerType} — ${params.triggerDetails}`,
      JSON.stringify({
        rollbackId,
        productId: params.productId,
        revertPrUrl,
        success,
      }),
      new Date().toISOString(),
    ]
  );

  console.log(`[Rollback] Pipeline complete for product ${product.name}: success=${success}, revertPR=${revertPrUrl || 'none'}`);

  return { rollbackId, revertPrUrl, success };
}

// ---------------------------------------------------------------------------
// Post-merge health monitor (background polling)
// ---------------------------------------------------------------------------

// Track active monitors to prevent duplicates
const activeMonitors = new Map<string, AbortController>();

export function startPostMergeMonitor(params: {
  productId: string;
  taskId?: string;
  healthCheckUrl: string;
  mergedPrUrl: string;
  mergedCommitSha: string;
  monitorMinutes?: number;
  pollIntervalSeconds?: number;
}): void {
  const {
    productId,
    taskId,
    healthCheckUrl,
    mergedPrUrl,
    mergedCommitSha,
    monitorMinutes = 5,
    pollIntervalSeconds = 30,
  } = params;

  // Cancel any existing monitor for this product
  const existingController = activeMonitors.get(productId);
  if (existingController) {
    existingController.abort();
    activeMonitors.delete(productId);
  }

  const controller = new AbortController();
  activeMonitors.set(productId, controller);

  const monitorKey = `${productId}:${mergedCommitSha.slice(0, 7)}`;
  console.log(`[Rollback Monitor] Starting health monitor for ${monitorKey} — polling ${healthCheckUrl} every ${pollIntervalSeconds}s for ${monitorMinutes}min`);

  const totalMs = monitorMinutes * 60 * 1000;
  const intervalMs = pollIntervalSeconds * 1000;
  const startTime = Date.now();
  let consecutiveFailures = 0;
  const FAILURE_THRESHOLD = 3; // Require 3 consecutive failures before rollback

  const poll = async () => {
    if (controller.signal.aborted) {
      console.log(`[Rollback Monitor] Monitor ${monitorKey} aborted`);
      return;
    }

    if (Date.now() - startTime > totalMs) {
      console.log(`[Rollback Monitor] Monitor ${monitorKey} completed — no issues detected`);
      activeMonitors.delete(productId);
      return;
    }

    const result = await checkHealth(healthCheckUrl);

    if (result.healthy) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      console.warn(
        `[Rollback Monitor] Health check failed (${consecutiveFailures}/${FAILURE_THRESHOLD}) for ${monitorKey}: ${result.error || `HTTP ${result.statusCode}`}`
      );

      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        console.error(`[Rollback Monitor] Triggering rollback for ${monitorKey} after ${FAILURE_THRESHOLD} consecutive failures`);
        activeMonitors.delete(productId);

        await executeRollback({
          productId,
          taskId,
          triggerType: 'health_check',
          triggerDetails: `Health check failed ${FAILURE_THRESHOLD} consecutive times: ${result.error || `HTTP ${result.statusCode}`}`,
          mergedPrUrl,
          mergedCommitSha,
        });

        return; // Stop monitoring after rollback
      }
    }

    // Schedule next poll
    setTimeout(poll, intervalMs);
  };

  // Initial delay: wait 30 seconds after merge before first health check
  // to allow deployment to propagate
  setTimeout(poll, 30_000);
}

export function stopMonitor(productId: string): boolean {
  const controller = activeMonitors.get(productId);
  if (controller) {
    controller.abort();
    activeMonitors.delete(productId);
    return true;
  }
  return false;
}

export function getActiveMonitors(): string[] {
  return Array.from(activeMonitors.keys());
}
