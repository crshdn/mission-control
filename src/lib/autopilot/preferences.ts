import { logger } from '@/lib/logger';
/**
 * Preference Learning — Karpathy AutoResearch pattern.
 * Analyzes swipe history to build a preference model that steers future research & ideation.
 * The learned_preferences_md is injected into LLM prompts as context.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';

interface SwipeRow {
  action: string;
  category: string;
  tags: string | null;
  impact_score: number | null;
  feasibility_score: number | null;
  complexity: string | null;
  user_notes: string | null;
}

interface IdeaRow {
  title: string;
  description: string;
  category: string;
  status: string;
  user_notes: string | null;
}

/**
 * Rebuild the preference model for a product from its swipe history.
 * Call after swipes or on a schedule.
 */
export function rebuildPreferenceModel(productId: string): void {
  const swipes = queryAll<SwipeRow>(
    `SELECT action, category, tags, impact_score, feasibility_score, complexity, user_notes
     FROM swipe_history WHERE product_id = ? ORDER BY created_at DESC`,
    [productId]
  );

  if (swipes.length < 3) return; // not enough data

  // --- Category analysis ---
  const catStats: Record<string, { approved: number; rejected: number; maybe: number; total: number }> = {};
  for (const s of swipes) {
    if (!catStats[s.category]) catStats[s.category] = { approved: 0, rejected: 0, maybe: 0, total: 0 };
    catStats[s.category].total++;
    if (s.action === 'approve' || s.action === 'fire') catStats[s.category].approved++;
    else if (s.action === 'reject') catStats[s.category].rejected++;
    else if (s.action === 'maybe') catStats[s.category].maybe++;
  }

  const categoryWeights: Record<string, number> = {};
  const lovedCategories: string[] = [];
  const dislikedCategories: string[] = [];
  for (const [cat, stats] of Object.entries(catStats)) {
    const rate = stats.total > 0 ? stats.approved / stats.total : 0;
    categoryWeights[cat] = Math.round(rate * 100);
    if (rate >= 0.7 && stats.total >= 2) lovedCategories.push(cat);
    if (rate <= 0.2 && stats.total >= 2) dislikedCategories.push(cat);
  }

  // --- Complexity analysis ---
  const compStats: Record<string, { approved: number; total: number }> = {};
  for (const s of swipes) {
    const c = s.complexity || 'unknown';
    if (!compStats[c]) compStats[c] = { approved: 0, total: 0 };
    compStats[c].total++;
    if (s.action === 'approve' || s.action === 'fire') compStats[c].approved++;
  }

  const complexityWeights: Record<string, number> = {};
  const preferredComplexity: string[] = [];
  for (const [comp, stats] of Object.entries(compStats)) {
    if (comp === 'unknown') continue;
    const rate = stats.total > 0 ? stats.approved / stats.total : 0;
    complexityWeights[comp] = Math.round(rate * 100);
    if (rate >= 0.6 && stats.total >= 2) preferredComplexity.push(comp);
  }

  // --- Score threshold analysis ---
  const approvedScores: number[] = [];
  const rejectedScores: number[] = [];
  for (const s of swipes) {
    if (s.impact_score != null) {
      if (s.action === 'approve' || s.action === 'fire') approvedScores.push(s.impact_score);
      else if (s.action === 'reject') rejectedScores.push(s.impact_score);
    }
  }
  const avgApprovedImpact = approvedScores.length > 0 ? approvedScores.reduce((a, b) => a + b, 0) / approvedScores.length : null;
  const avgRejectedImpact = rejectedScores.length > 0 ? rejectedScores.reduce((a, b) => a + b, 0) / rejectedScores.length : null;

  // --- Tag analysis ---
  const tagApproval: Record<string, { approved: number; total: number }> = {};
  for (const s of swipes) {
    if (!s.tags) continue;
    try {
      const tags: string[] = JSON.parse(s.tags);
      for (const tag of tags) {
        if (!tagApproval[tag]) tagApproval[tag] = { approved: 0, total: 0 };
        tagApproval[tag].total++;
        if (s.action === 'approve' || s.action === 'fire') tagApproval[tag].approved++;
      }
    } catch { /* skip invalid */ }
  }

  const hotTags: string[] = [];
  const coldTags: string[] = [];
  for (const [tag, stats] of Object.entries(tagApproval)) {
    if (stats.total < 2) continue;
    const rate = stats.approved / stats.total;
    if (rate >= 0.7) hotTags.push(tag);
    if (rate <= 0.2) coldTags.push(tag);
  }

  // --- User notes patterns ---
  const approvedIdeas = queryAll<IdeaRow>(
    `SELECT title, description, category, status, user_notes FROM ideas
     WHERE product_id = ? AND status IN ('approved', 'building', 'built', 'shipped')
     ORDER BY created_at DESC LIMIT 20`,
    [productId]
  );
  const rejectedIdeas = queryAll<IdeaRow>(
    `SELECT title, description, category, status, user_notes FROM ideas
     WHERE product_id = ? AND status = 'rejected'
     ORDER BY created_at DESC LIMIT 20`,
    [productId]
  );

  // --- Build the markdown ---
  const totalSwipes = swipes.length;
  const totalApproved = swipes.filter(s => s.action === 'approve' || s.action === 'fire').length;
  const approvalRate = Math.round((totalApproved / totalSwipes) * 100);

  const lines: string[] = [
    `## Learned Preferences (${totalSwipes} swipes, ${approvalRate}% approval rate)`,
    '',
  ];

  // Category preferences
  if (lovedCategories.length > 0 || dislikedCategories.length > 0) {
    lines.push('### Category Preferences');
    if (lovedCategories.length > 0) lines.push(`- **Strongly favors:** ${lovedCategories.join(', ')}`);
    if (dislikedCategories.length > 0) lines.push(`- **Tends to reject:** ${dislikedCategories.join(', ')}`);
    lines.push(`- Approval rates: ${Object.entries(categoryWeights).sort((a, b) => b[1] - a[1]).map(([c, r]) => `${c} (${r}%)`).join(', ')}`);
    lines.push('');
  }

  // Complexity preferences
  if (preferredComplexity.length > 0) {
    lines.push('### Complexity Preferences');
    lines.push(`- **Preferred sizes:** ${preferredComplexity.join(', ')}`);
    lines.push(`- Rates: ${Object.entries(complexityWeights).sort((a, b) => b[1] - a[1]).map(([c, r]) => `${c} (${r}%)`).join(', ')}`);
    lines.push('');
  }

  // Score insights
  if (avgApprovedImpact != null && avgRejectedImpact != null) {
    lines.push('### Impact Score Patterns');
    lines.push(`- Average impact of approved ideas: ${avgApprovedImpact.toFixed(1)}`);
    lines.push(`- Average impact of rejected ideas: ${avgRejectedImpact.toFixed(1)}`);
    if (avgApprovedImpact > avgRejectedImpact + 1) {
      lines.push(`- User favors high-impact ideas (threshold ~${Math.round(avgApprovedImpact - 1)}+)`);
    }
    lines.push('');
  }

  // Tag preferences
  if (hotTags.length > 0 || coldTags.length > 0) {
    lines.push('### Tag Preferences');
    if (hotTags.length > 0) lines.push(`- **Hot tags (high approval):** ${hotTags.join(', ')}`);
    if (coldTags.length > 0) lines.push(`- **Cold tags (low approval):** ${coldTags.join(', ')}`);
    lines.push('');
  }

  // Approved examples
  if (approvedIdeas.length > 0) {
    lines.push('### Examples of Approved Ideas');
    for (const idea of approvedIdeas.slice(0, 5)) {
      lines.push(`- **${idea.title}** [${idea.category}]${idea.user_notes ? ` — "${idea.user_notes}"` : ''}`);
    }
    lines.push('');
  }

  // Rejected examples
  if (rejectedIdeas.length > 0) {
    lines.push('### Examples of Rejected Ideas');
    for (const idea of rejectedIdeas.slice(0, 5)) {
      lines.push(`- **${idea.title}** [${idea.category}]${idea.user_notes ? ` — "${idea.user_notes}"` : ''}`);
    }
    lines.push('');
  }

  // Guidance
  lines.push('### Guidance for Next Cycle');
  lines.push(`Generate more ideas in categories the user favors. Avoid patterns seen in rejected ideas.`);
  if (lovedCategories.length > 0) lines.push(`Focus on: ${lovedCategories.join(', ')}.`);
  if (dislikedCategories.length > 0) lines.push(`De-emphasize: ${dislikedCategories.join(', ')}.`);
  if (preferredComplexity.length > 0) lines.push(`Preferred complexity: ${preferredComplexity.join(', ')}.`);

  const learnedMd = lines.join('\n');

  // --- Upsert preference model ---
  const existing = queryOne<{ id: string }>(
    'SELECT id FROM preference_models WHERE product_id = ?',
    [productId]
  );

  const now = new Date().toISOString();

  if (existing) {
    run(
      `UPDATE preference_models SET
        category_weights = ?, tag_weights = ?, complexity_weights = ?,
        learned_preferences_md = ?, total_swipes = ?, approval_rate = ?,
        last_updated = ?
       WHERE id = ?`,
      [
        JSON.stringify(categoryWeights),
        JSON.stringify(tagApproval),
        JSON.stringify(complexityWeights),
        learnedMd,
        totalSwipes,
        approvalRate / 100,
        now,
        existing.id,
      ]
    );
  } else {
    run(
      `INSERT INTO preference_models (id, product_id, model_type, category_weights, tag_weights, complexity_weights, learned_preferences_md, total_swipes, approval_rate, last_updated, created_at)
       VALUES (?, ?, 'simple', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), productId,
        JSON.stringify(categoryWeights),
        JSON.stringify(tagApproval),
        JSON.stringify(complexityWeights),
        learnedMd,
        totalSwipes,
        approvalRate / 100,
        now, now,
      ]
    );
  }

  broadcast({ type: 'preference_updated', payload: { productId, totalSwipes, approvalRate } });
  logger.info(`[Preferences] Rebuilt model for product ${productId}: ${totalSwipes} swipes, ${approvalRate}% approval`);
}

/**
 * Backfill preference models for all products with swipe history.
 */
export function backfillAllPreferences(): number {
  const products = queryAll<{ product_id: string; count: number }>(
    `SELECT product_id, COUNT(*) as count FROM swipe_history GROUP BY product_id HAVING count >= 3`
  );

  let rebuilt = 0;
  for (const { product_id } of products) {
    try {
      rebuildPreferenceModel(product_id);
      rebuilt++;
    } catch (err) {
      logger.error(`[Preferences] Failed to rebuild for ${product_id}:`, err);
    }
  }

  logger.info(`[Preferences] Backfilled ${rebuilt} product(s)`);
  return rebuilt;
}
