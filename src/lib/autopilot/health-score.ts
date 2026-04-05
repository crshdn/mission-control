import { logger } from '@/lib/logger';
/**
 * Product Health Score Computation Engine
 *
 * Calculates a composite 0-100 health score per product by aggregating:
 * 1. Research Freshness — days since last completed research cycle
 * 2. Pipeline Depth — number of pending ideas
 * 3. Swipe Velocity — ideas reviewed per day (7-day rolling average)
 * 4. Build Success Rate — merged PRs / total dispatched tasks
 * 5. Cost Efficiency — cost per merged PR (lower is better)
 *
 * Each component is normalized to 0-100 using sensible ranges.
 * Weights are configurable per product; missing/disabled components
 * redistribute their weight proportionally across available ones.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type {
  HealthWeightConfig,
  HealthComponentScore,
  ProductHealthScore,
  HealthScoreResponse,
  HealthComponent,
  Product,
} from '@/lib/types';

// ── Default weights (equal 20% each) ─────────────────────────────────────

export const DEFAULT_WEIGHTS: HealthWeightConfig = {
  research: 20,
  pipeline: 20,
  swipe: 20,
  build: 20,
  cost: 20,
  disabled: [],
};

// ── Weight helpers ────────────────────────────────────────────────────────

export function getWeights(product: Product): HealthWeightConfig {
  if (product.health_weight_config) {
    try {
      const parsed = JSON.parse(product.health_weight_config);
      return {
        research: parsed.research ?? 20,
        pipeline: parsed.pipeline ?? 20,
        swipe: parsed.swipe ?? 20,
        build: parsed.build ?? 20,
        cost: parsed.cost ?? 20,
        disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
      };
    } catch {
      return { ...DEFAULT_WEIGHTS };
    }
  }
  return { ...DEFAULT_WEIGHTS };
}

/**
 * Compute effective weights after redistributing disabled/missing components.
 * Returns a map of component -> effective weight (0-100).
 */
export function computeEffectiveWeights(
  weights: HealthWeightConfig,
  availableComponents: HealthComponent[]
): Record<HealthComponent, number> {
  const allComponents: HealthComponent[] = ['research', 'pipeline', 'swipe', 'build', 'cost'];
  const active = allComponents.filter(
    (c) => availableComponents.includes(c) && !weights.disabled.includes(c)
  );

  if (active.length === 0) {
    // Edge case: everything disabled → equal zero
    return { research: 0, pipeline: 0, swipe: 0, build: 0, cost: 0 };
  }

  const totalActiveWeight = active.reduce((sum, c) => sum + (weights[c] || 0), 0);

  const result: Record<HealthComponent, number> = { research: 0, pipeline: 0, swipe: 0, build: 0, cost: 0 };
  for (const c of active) {
    result[c] = totalActiveWeight > 0 ? ((weights[c] || 0) / totalActiveWeight) * 100 : 100 / active.length;
  }

  return result;
}

// ── Sub-score computations ────────────────────────────────────────────────

/**
 * Research Freshness: 0-100
 * 100 = completed cycle within last day
 * 0   = no cycle in 30+ days (or never)
 */
function computeResearchFreshness(productId: string): { score: number; rawValue: number; hasData: boolean } {
  const latest = queryOne<{ completed_at: string }>(
    `SELECT completed_at FROM research_cycles
     WHERE product_id = ? AND status = 'completed' AND completed_at IS NOT NULL
     ORDER BY completed_at DESC LIMIT 1`,
    [productId]
  );

  if (!latest?.completed_at) return { score: 0, rawValue: -1, hasData: false };

  const daysSince = (Date.now() - new Date(latest.completed_at).getTime()) / (1000 * 60 * 60 * 24);
  // Linear decay: 100 at 0 days, 0 at 30 days
  const score = Math.max(0, Math.min(100, 100 - (daysSince / 30) * 100));
  return { score: Math.round(score * 10) / 10, rawValue: Math.round(daysSince * 10) / 10, hasData: true };
}

/**
 * Pipeline Depth: 0-100
 * 100 = 10+ pending ideas (healthy pipeline)
 * 0   = no pending ideas
 */
function computePipelineDepth(productId: string): { score: number; rawValue: number; hasData: boolean } {
  const result = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ideas WHERE product_id = ? AND status = 'pending'`,
    [productId]
  );
  const count = result?.count || 0;
  // 10+ ideas = 100, linear scale below
  const score = Math.min(100, (count / 10) * 100);
  return { score: Math.round(score * 10) / 10, rawValue: count, hasData: true };
}

/**
 * Swipe Velocity: 0-100
 * 100 = 5+ ideas reviewed per day (7-day rolling avg)
 * 0   = no swipes
 */
function computeSwipeVelocity(productId: string): { score: number; rawValue: number; hasData: boolean } {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM swipe_history WHERE product_id = ? AND created_at >= ?`,
    [productId, sevenDaysAgo]
  );
  const totalSwipes = result?.count || 0;
  if (totalSwipes === 0) return { score: 0, rawValue: 0, hasData: false };

  const perDay = totalSwipes / 7;
  // 5+/day = 100
  const score = Math.min(100, (perDay / 5) * 100);
  return { score: Math.round(score * 10) / 10, rawValue: Math.round(perDay * 100) / 100, hasData: true };
}

/**
 * Build Success Rate: 0-100
 * 100 = all dispatched tasks resulted in merged PRs
 * 0   = no merges (or no tasks)
 */
function computeBuildSuccess(productId: string): { score: number; rawValue: number; hasData: boolean } {
  const dispatched = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks WHERE product_id = ? AND status != 'inbox' AND status != 'planning' AND pr_status IS NOT NULL`,
    [productId]
  );
  const merged = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks WHERE product_id = ? AND pr_status = 'merged'`,
    [productId]
  );

  const total = dispatched?.count || 0;
  const mergedCount = merged?.count || 0;

  if (total === 0) return { score: 0, rawValue: 0, hasData: false };

  const rate = mergedCount / total;
  const score = rate * 100;
  return { score: Math.round(score * 10) / 10, rawValue: Math.round(rate * 1000) / 10, hasData: true };
}

/**
 * Cost Efficiency: 0-100
 * 100 = $0/merged PR (or very low)
 * 0   = $50+/merged PR
 * Inverse relationship — lower cost = higher score
 */
function computeCostEfficiency(productId: string): { score: number; rawValue: number; hasData: boolean } {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const totalCost = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events WHERE product_id = ? AND created_at >= ?`,
    [productId, thirtyDaysAgo]
  );

  const mergedCount = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks WHERE product_id = ? AND pr_status = 'merged' AND updated_at >= ?`,
    [productId, thirtyDaysAgo]
  );

  const cost = totalCost?.total || 0;
  const merged = mergedCount?.count || 0;

  if (cost === 0 && merged === 0) return { score: 0, rawValue: 0, hasData: false };
  if (merged === 0) return { score: 0, rawValue: cost, hasData: true };

  const costPerMerge = cost / merged;
  // $0 = 100, $50+ = 0, linear
  const score = Math.max(0, Math.min(100, 100 - (costPerMerge / 50) * 100));
  return { score: Math.round(score * 10) / 10, rawValue: Math.round(costPerMerge * 100) / 100, hasData: true };
}

// ── Main computation ──────────────────────────────────────────────────────

export function computeHealthScore(productId: string): {
  overallScore: number;
  components: HealthComponentScore[];
  weights: HealthWeightConfig;
} {
  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [productId]);
  if (!product) throw new Error(`Product ${productId} not found`);

  const weights = getWeights(product);

  // Compute raw sub-scores
  const research = computeResearchFreshness(productId);
  const pipeline = computePipelineDepth(productId);
  const swipe = computeSwipeVelocity(productId);
  const build = computeBuildSuccess(productId);
  const cost = computeCostEfficiency(productId);

  // Determine which components have data
  const available: HealthComponent[] = [];
  if (research.hasData) available.push('research');
  if (pipeline.hasData) available.push('pipeline');
  if (swipe.hasData) available.push('swipe');
  if (build.hasData) available.push('build');
  if (cost.hasData) available.push('cost');

  // If no components have data, all get listed as available so weights redistribute
  // (they'll all score 0)
  const effectiveAvailable = available.length > 0 ? available : (['research', 'pipeline', 'swipe', 'build', 'cost'] as HealthComponent[]);
  const effectiveWeights = computeEffectiveWeights(weights, effectiveAvailable);

  const components: HealthComponentScore[] = [
    {
      name: 'research',
      label: 'Research Freshness',
      score: research.score,
      weight: weights.research,
      effectiveWeight: effectiveWeights.research,
      rawValue: research.rawValue,
      unit: 'days since last cycle',
      description: research.hasData ? `Last research completed ${research.rawValue} days ago` : 'No completed research cycles',
    },
    {
      name: 'pipeline',
      label: 'Pipeline Depth',
      score: pipeline.score,
      weight: weights.pipeline,
      effectiveWeight: effectiveWeights.pipeline,
      rawValue: pipeline.rawValue,
      unit: 'pending ideas',
      description: `${pipeline.rawValue} pending ideas in pipeline`,
    },
    {
      name: 'swipe',
      label: 'Swipe Velocity',
      score: swipe.score,
      weight: weights.swipe,
      effectiveWeight: effectiveWeights.swipe,
      rawValue: swipe.rawValue,
      unit: 'ideas/day (7d avg)',
      description: swipe.hasData ? `${swipe.rawValue} ideas reviewed per day` : 'No swipes in last 7 days',
    },
    {
      name: 'build',
      label: 'Build Success',
      score: build.score,
      weight: weights.build,
      effectiveWeight: effectiveWeights.build,
      rawValue: build.rawValue,
      unit: '% merge rate',
      description: build.hasData ? `${build.rawValue}% of dispatched tasks merged` : 'No build tasks with PR status',
    },
    {
      name: 'cost',
      label: 'Cost Efficiency',
      score: cost.score,
      weight: weights.cost,
      effectiveWeight: effectiveWeights.cost,
      rawValue: cost.rawValue,
      unit: '$/merged PR',
      description: cost.hasData ? `$${cost.rawValue} per merged PR` : 'No cost data available',
    },
  ];

  // Weighted average
  let overallScore = 0;
  for (const comp of components) {
    overallScore += (comp.score * comp.effectiveWeight) / 100;
  }
  overallScore = Math.round(overallScore * 10) / 10;

  return { overallScore, components, weights };
}

// ── Persist + cache ───────────────────────────────────────────────────────

/**
 * Calculate and persist the current health score (live cache, not a snapshot).
 * Replaces any existing non-snapshot row for this product.
 */
export function calculateAndPersist(productId: string): ProductHealthScore {
  const { overallScore, components } = computeHealthScore(productId);
  const now = new Date().toISOString();

  // Upsert: delete old live (non-snapshot) entry and insert fresh
  return transaction(() => {
    run(
      `DELETE FROM product_health_scores WHERE product_id = ? AND snapshot_date IS NULL`,
      [productId]
    );

    const id = uuidv4();
    run(
      `INSERT INTO product_health_scores
       (id, product_id, overall_score, research_freshness_score, pipeline_depth_score,
        swipe_velocity_score, build_success_score, cost_efficiency_score, component_data, calculated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        productId,
        overallScore,
        components.find((c) => c.name === 'research')?.score ?? 0,
        components.find((c) => c.name === 'pipeline')?.score ?? 0,
        components.find((c) => c.name === 'swipe')?.score ?? 0,
        components.find((c) => c.name === 'build')?.score ?? 0,
        components.find((c) => c.name === 'cost')?.score ?? 0,
        JSON.stringify(components),
        now,
      ]
    );

    return queryOne<ProductHealthScore>(
      'SELECT * FROM product_health_scores WHERE id = ?',
      [id]
    )!;
  });
}

/**
 * Recalculate health score and broadcast SSE update.
 */
export function recalculateAndBroadcast(productId: string): void {
  try {
    const score = calculateAndPersist(productId);
    broadcast({
      type: 'health_score_updated',
      payload: { productId, score: score.overall_score },
    });
  } catch (err) {
    logger.error(`[HealthScore] Failed to recalculate for product ${productId}:`, err);
  }
}

/**
 * Take a daily snapshot of health scores for trend charts.
 * Idempotent: skips if today's snapshot already exists.
 */
export function takeDailySnapshot(productId: string): void {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const existing = queryOne<{ id: string }>(
    `SELECT id FROM product_health_scores WHERE product_id = ? AND snapshot_date = ?`,
    [productId, today]
  );
  if (existing) return; // Already snapshotted today

  const { overallScore, components } = computeHealthScore(productId);
  const now = new Date().toISOString();

  run(
    `INSERT INTO product_health_scores
     (id, product_id, overall_score, research_freshness_score, pipeline_depth_score,
      swipe_velocity_score, build_success_score, cost_efficiency_score, component_data, snapshot_date, calculated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      productId,
      overallScore,
      components.find((c) => c.name === 'research')?.score ?? 0,
      components.find((c) => c.name === 'pipeline')?.score ?? 0,
      components.find((c) => c.name === 'swipe')?.score ?? 0,
      components.find((c) => c.name === 'build')?.score ?? 0,
      components.find((c) => c.name === 'cost')?.score ?? 0,
      JSON.stringify(components),
      today,
      now,
    ]
  );
}

/**
 * Take daily snapshots for ALL active products.
 */
export function takeAllDailySnapshots(): void {
  const products = queryAll<{ id: string }>(
    `SELECT id FROM products WHERE status = 'active'`
  );
  for (const p of products) {
    try {
      takeDailySnapshot(p.id);
    } catch (err) {
      logger.error(`[HealthScore] Snapshot failed for product ${p.id}:`, err);
    }
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────

/**
 * Get the latest cached health score (live, non-snapshot).
 */
export function getLatestScore(productId: string): ProductHealthScore | undefined {
  return queryOne<ProductHealthScore>(
    `SELECT * FROM product_health_scores WHERE product_id = ? AND snapshot_date IS NULL
     ORDER BY calculated_at DESC LIMIT 1`,
    [productId]
  );
}

/**
 * Get 30-day snapshot history.
 */
export function getScoreHistory(productId: string, days = 30): ProductHealthScore[] {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return queryAll<ProductHealthScore>(
    `SELECT * FROM product_health_scores
     WHERE product_id = ? AND snapshot_date IS NOT NULL AND snapshot_date >= ?
     ORDER BY snapshot_date ASC`,
    [productId, since]
  );
}

/**
 * Get the full health response for a product (score + components + weights + history).
 */
export function getHealthResponse(productId: string): HealthScoreResponse {
  // Compute fresh score
  const { overallScore, components, weights } = computeHealthScore(productId);

  // Get or create cached score
  let score = getLatestScore(productId);
  if (!score) {
    score = calculateAndPersist(productId);
  }

  // Get history
  const history = getScoreHistory(productId);

  return {
    score: { ...score, overall_score: overallScore },
    components,
    weights,
    history,
  };
}

/**
 * Update weight configuration for a product.
 */
export function updateWeights(productId: string, newWeights: Partial<HealthWeightConfig>): HealthWeightConfig {
  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [productId]);
  if (!product) throw new Error(`Product ${productId} not found`);

  const current = getWeights(product);
  const updated: HealthWeightConfig = {
    research: newWeights.research ?? current.research,
    pipeline: newWeights.pipeline ?? current.pipeline,
    swipe: newWeights.swipe ?? current.swipe,
    build: newWeights.build ?? current.build,
    cost: newWeights.cost ?? current.cost,
    disabled: newWeights.disabled ?? current.disabled,
  };

  run(
    'UPDATE products SET health_weight_config = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(updated), new Date().toISOString(), productId]
  );

  // Recalculate with new weights
  recalculateAndBroadcast(productId);

  return updated;
}

/**
 * Get all product health scores (for the product listing page badges).
 */
export function getAllProductScores(): Record<string, number> {
  const scores: Record<string, number> = {};
  const products = queryAll<{ id: string }>(`SELECT id FROM products WHERE status = 'active'`);
  for (const p of products) {
    const cached = getLatestScore(p.id);
    if (cached) {
      scores[p.id] = cached.overall_score;
    } else {
      // Compute fresh
      try {
        const { overallScore } = computeHealthScore(p.id);
        scores[p.id] = overallScore;
      } catch {
        scores[p.id] = 0;
      }
    }
  }
  return scores;
}
