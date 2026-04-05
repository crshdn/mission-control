import { logger } from '@/lib/logger';
/**
 * Product Skills — structured, executable playbooks that agents create, consume, and improve.
 * Karpathy AutoResearch pattern: agents learn reusable procedures that compound over time.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';

// --- Types ---

export interface SkillStep {
  order: number;
  description: string;
  command?: string;
  code?: string;
  file_path?: string;
  expected_output?: string;
  fallback?: string;
  notes?: string;
}

export interface ProductSkill {
  id: string;
  product_id: string;
  skill_type: 'build' | 'deploy' | 'test' | 'fix' | 'config' | 'pattern';
  title: string;
  trigger_keywords: string | null; // JSON array of keywords
  prerequisites: string | null; // JSON
  steps: string; // JSON array of SkillStep
  verification: string | null; // JSON
  confidence: number;
  times_used: number;
  times_succeeded: number;
  last_used_at: string | null;
  created_by_task_id: string | null;
  created_by_agent_id: string | null;
  supersedes_skill_id: string | null;
  status: 'active' | 'deprecated' | 'draft';
  created_at: string;
  updated_at: string;
}

export interface SkillReport {
  id: string;
  skill_id: string;
  task_id: string;
  used: number;
  succeeded: number;
  deviation: string | null;
  suggested_update: string | null;
  created_at: string;
}

// --- Confidence ---

// Bayesian confidence: uses a prior of 0.5 with weight of 2 "virtual" observations.
// This means a skill needs real usage data to move meaningfully above or below 0.5.
// 1 success / 1 use = 0.6 (not 1.0), 5/5 = 0.83, 8/10 = 0.75
const PRIOR = 0.5;
const PRIOR_WEIGHT = 2;

function bayesianConfidence(succeeded: number, used: number): number {
  if (used === 0) return PRIOR;
  return (succeeded + PRIOR * PRIOR_WEIGHT) / (used + PRIOR_WEIGHT);
}

// --- CRUD ---

export function createSkill(input: {
  productId: string;
  skillType: ProductSkill['skill_type'];
  title: string;
  triggerKeywords?: string[];
  prerequisites?: unknown;
  steps: SkillStep[];
  verification?: unknown;
  createdByTaskId?: string;
  createdByAgentId?: string;
}): ProductSkill {
  const id = uuidv4();
  const now = new Date().toISOString();

  run(
    `INSERT INTO product_skills (id, product_id, skill_type, title, trigger_keywords, prerequisites, steps, verification, confidence, created_by_task_id, created_by_agent_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.5, ?, ?, 'draft', ?, ?)`,
    [
      id, input.productId, input.skillType, input.title,
      input.triggerKeywords ? JSON.stringify(input.triggerKeywords) : null,
      input.prerequisites ? JSON.stringify(input.prerequisites) : null,
      JSON.stringify(input.steps),
      input.verification ? JSON.stringify(input.verification) : null,
      input.createdByTaskId || null,
      input.createdByAgentId || null,
      now, now,
    ]
  );

  broadcast({ type: 'skill_created', payload: { productId: input.productId, skillId: id, title: input.title } });
  logger.info(`[Skills] Created: "${input.title}" [${input.skillType}] for product ${input.productId}`);

  return queryOne<ProductSkill>('SELECT * FROM product_skills WHERE id = ?', [id])!;
}

export function getSkillsForProduct(productId: string, filters?: {
  status?: string;
  skillType?: string;
}): ProductSkill[] {
  let sql = 'SELECT * FROM product_skills WHERE product_id = ?';
  const params: unknown[] = [productId];

  if (filters?.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.skillType) {
    sql += ' AND skill_type = ?';
    params.push(filters.skillType);
  }

  sql += ' ORDER BY confidence DESC, times_used DESC';
  return queryAll<ProductSkill>(sql, params);
}

export function updateSkill(skillId: string, updates: Partial<{
  title: string;
  triggerKeywords: string[];
  prerequisites: unknown;
  steps: SkillStep[];
  verification: unknown;
  status: string;
}>): ProductSkill | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.triggerKeywords !== undefined) { fields.push('trigger_keywords = ?'); values.push(JSON.stringify(updates.triggerKeywords)); }
  if (updates.prerequisites !== undefined) { fields.push('prerequisites = ?'); values.push(JSON.stringify(updates.prerequisites)); }
  if (updates.steps !== undefined) { fields.push('steps = ?'); values.push(JSON.stringify(updates.steps)); }
  if (updates.verification !== undefined) { fields.push('verification = ?'); values.push(JSON.stringify(updates.verification)); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }

  if (fields.length === 0) return queryOne<ProductSkill>('SELECT * FROM product_skills WHERE id = ?', [skillId]);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(skillId);

  run(`UPDATE product_skills SET ${fields.join(', ')} WHERE id = ?`, values);
  return queryOne<ProductSkill>('SELECT * FROM product_skills WHERE id = ?', [skillId]);
}

// --- Matching ---

const ROLE_TO_SKILL_TYPES: Record<string, string[]> = {
  builder: ['build', 'config', 'pattern', 'fix'],
  tester: ['test', 'config'],
  reviewer: ['pattern', 'config'],
  verifier: ['test', 'pattern'],
};

/**
 * Match skills for a task dispatch. Uses keyword matching + role filtering.
 * Returns top skills sorted by relevance, limited to avoid prompt bloat.
 */
export function getMatchedSkills(
  productId: string,
  taskTitle: string,
  taskDescription: string,
  agentRole?: string,
  limit = 5
): ProductSkill[] {
  // Get all active skills with confidence >= 0.5
  const skills = queryAll<ProductSkill>(
    `SELECT * FROM product_skills WHERE product_id = ? AND status = 'active' AND confidence >= 0.5 ORDER BY confidence DESC`,
    [productId]
  );

  if (skills.length === 0) return [];

  const taskText = `${taskTitle} ${taskDescription}`.toLowerCase();

  // Score each skill
  const scored = skills.map(skill => {
    let score = skill.confidence;

    // Role match bonus
    if (agentRole) {
      const allowedTypes = ROLE_TO_SKILL_TYPES[agentRole] || [];
      if (allowedTypes.includes(skill.skill_type)) score += 0.2;
    }

    // Keyword match bonus
    if (skill.trigger_keywords) {
      try {
        const keywords: string[] = JSON.parse(skill.trigger_keywords);
        const matches = keywords.filter(kw => taskText.includes(kw.toLowerCase()));
        if (matches.length > 0) score += 0.3 * (matches.length / keywords.length);
      } catch { /* invalid JSON, skip */ }
    }

    // Title word overlap
    const titleWords = skill.title.toLowerCase().split(/\s+/);
    const titleMatches = titleWords.filter(w => w.length > 3 && taskText.includes(w));
    if (titleMatches.length > 0) score += 0.1 * (titleMatches.length / titleWords.length);

    return { skill, score };
  });

  // Sort by score, deduplicate (if superseded skill is present, prefer the newer one)
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const result: ProductSkill[] = [];
  for (const { skill } of scored) {
    if (result.length >= limit) break;
    // Skip if we already have a skill that supersedes this one
    if (skill.supersedes_skill_id && seen.has(skill.supersedes_skill_id)) continue;
    seen.add(skill.id);
    result.push(skill);
  }

  return result;
}

/**
 * Format matched skills for injection into the dispatch message.
 */
export function formatSkillsForDispatch(skills: ProductSkill[]): string {
  if (skills.length === 0) return '';

  const lines: string[] = [
    '## Available Skills (from previous successful tasks)',
    '',
    'These are proven procedures for this product. Follow them when applicable.',
    '',
  ];

  for (const skill of skills) {
    lines.push(`### ${skill.title} [${skill.skill_type}] (confidence: ${Math.round(skill.confidence * 100)}%)`);

    if (skill.prerequisites) {
      try {
        const prereqs = JSON.parse(skill.prerequisites);
        if (prereqs.length > 0 || Object.keys(prereqs).length > 0) {
          lines.push(`**Prerequisites:** ${typeof prereqs === 'string' ? prereqs : JSON.stringify(prereqs)}`);
        }
      } catch { /* skip */ }
    }

    try {
      const steps: SkillStep[] = JSON.parse(skill.steps);
      for (const step of steps) {
        lines.push(`${step.order}. ${step.description}`);
        if (step.command) lines.push(`   \`\`\`\n   ${step.command}\n   \`\`\``);
        if (step.expected_output) lines.push(`   Expected: ${step.expected_output}`);
        if (step.fallback) lines.push(`   If this fails: ${step.fallback}`);
      }
    } catch { /* skip */ }

    if (skill.verification) {
      try {
        const v = JSON.parse(skill.verification);
        lines.push(`**Verification:** ${typeof v === 'string' ? v : JSON.stringify(v)}`);
      } catch { /* skip */ }
    }

    lines.push(`*Report skill usage: POST /api/products/${skill.product_id}/skills/${skill.id}/report*`);
    lines.push('');
  }

  return lines.join('\n');
}

// --- Reporting ---

/**
 * Record a skill usage report from an agent. Updates confidence using Bayesian scoring.
 * Runs inline promotion/deprecation checks.
 */
export function reportSkillUsage(input: {
  skillId: string;
  taskId: string;
  used: boolean;
  succeeded: boolean;
  deviation?: string;
  suggestedUpdate?: unknown;
}): ProductSkill | undefined {
  const skill = queryOne<ProductSkill>('SELECT * FROM product_skills WHERE id = ?', [input.skillId]);
  if (!skill) return undefined;

  const now = new Date().toISOString();

  // Store report
  run(
    `INSERT INTO skill_reports (id, skill_id, task_id, used, succeeded, deviation, suggested_update, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(), input.skillId, input.taskId,
      input.used ? 1 : 0, input.succeeded ? 1 : 0,
      input.deviation || null,
      input.suggestedUpdate ? JSON.stringify(input.suggestedUpdate) : null,
      now,
    ]
  );

  // Update counters
  const newUsed = skill.times_used + (input.used ? 1 : 0);
  const newSucceeded = skill.times_succeeded + (input.succeeded ? 1 : 0);
  const newConfidence = bayesianConfidence(newSucceeded, newUsed);

  run(
    `UPDATE product_skills SET times_used = ?, times_succeeded = ?, confidence = ?, last_used_at = ?, updated_at = ? WHERE id = ?`,
    [newUsed, newSucceeded, Math.round(newConfidence * 1000) / 1000, now, now, input.skillId]
  );

  // Inline promotion: draft → active if enough evidence
  if (skill.status === 'draft' && newSucceeded >= 2 && newConfidence >= 0.6) {
    run(`UPDATE product_skills SET status = 'active', updated_at = ? WHERE id = ?`, [now, input.skillId]);
    logger.info(`[Skills] Promoted to active: "${skill.title}" (confidence: ${newConfidence.toFixed(2)})`);
    broadcast({ type: 'skill_promoted', payload: { productId: skill.product_id, skillId: input.skillId, title: skill.title } });
  }

  // Inline deprecation: if tried 3+ times and confidence < 0.3
  if (newUsed >= 3 && newConfidence < 0.3) {
    run(`UPDATE product_skills SET status = 'deprecated', updated_at = ? WHERE id = ?`, [now, input.skillId]);
    logger.info(`[Skills] Deprecated: "${skill.title}" (confidence: ${newConfidence.toFixed(2)}, used: ${newUsed})`);
  }

  return queryOne<ProductSkill>('SELECT * FROM product_skills WHERE id = ?', [input.skillId]);
}
