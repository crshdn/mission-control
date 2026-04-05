import { logger } from '@/lib/logger';
/**
 * Skill Extraction — runs after task completion to capture reusable procedures.
 * Uses the LLM to analyze task activities and deliverables, then stores structured skills.
 */

import { queryOne, queryAll } from '@/lib/db';
import { createSkill, type SkillStep } from '@/lib/skills';
import { completeJSON } from '@/lib/autopilot/llm';
import { emitAutopilotActivity } from '@/lib/autopilot/activity';
import type { Task } from '@/lib/types';

interface ExtractedSkill {
  title: string;
  skill_type: 'build' | 'deploy' | 'test' | 'fix' | 'config' | 'pattern';
  trigger_keywords: string[];
  prerequisites: string[];
  steps: SkillStep[];
  verification: string;
}

/**
 * Extract skills from a completed task. Runs async after task → done.
 * Uses task activities, deliverables, and description as context.
 */
export async function extractSkillsFromTask(taskId: string): Promise<void> {
  const task = queryOne<Task & { product_id: string; assigned_agent_id: string }>(
    'SELECT * FROM tasks WHERE id = ?', [taskId]
  );
  if (!task || !task.product_id) return;

  // Gather context
  const activities = queryAll<{ activity_type: string; message: string; metadata: string | null }>(
    'SELECT activity_type, message, metadata FROM task_activities WHERE task_id = ? ORDER BY created_at ASC LIMIT 50',
    [taskId]
  );
  const deliverables = queryAll<{ deliverable_type: string; title: string; path: string | null; description: string | null }>(
    'SELECT deliverable_type, title, path, description FROM task_deliverables WHERE task_id = ? LIMIT 20',
    [taskId]
  );

  if (activities.length === 0 && deliverables.length === 0) {
    logger.info(`[SkillExtraction] No activities/deliverables for task ${taskId}, skipping`);
    return;
  }

  const activitySummary = activities
    .map(a => `[${a.activity_type}] ${a.message}`)
    .join('\n');

  const deliverableSummary = deliverables
    .map(d => `${d.deliverable_type}: ${d.title}${d.path ? ` (${d.path})` : ''}${d.description ? ` — ${d.description}` : ''}`)
    .join('\n');

  const prompt = `You are analyzing a completed software task to extract reusable skills (procedures that could help future agents working on the same product).

## Task
Title: ${task.title}
Description: ${task.description || 'No description'}
Status: ${task.status}

## Activities Log
${activitySummary || 'No activities recorded'}

## Deliverables
${deliverableSummary || 'No deliverables recorded'}

## Instructions

Extract 0-3 reusable skills from this task. Only extract skills that would genuinely help a future agent on the same product. Don't extract trivial or generic procedures.

For each skill, provide:
- title: specific and actionable (e.g. "LeadsFire npm install with legacy-peer-deps")
- skill_type: one of 'build', 'deploy', 'test', 'fix', 'config', 'pattern'
- trigger_keywords: array of words that would appear in tasks where this skill applies
- prerequisites: array of conditions that must be true
- steps: array of { order, description, command?, expected_output?, fallback? }
- verification: how to confirm the skill worked

Respond with ONLY a JSON array. If no skills are worth extracting, return an empty array [].`;

  try {
    const { data: skills } = await completeJSON<ExtractedSkill[]>(prompt, {
      systemPrompt: 'You extract reusable development procedures from completed tasks. Respond with a JSON array only.',
      timeoutMs: 60_000,
    });

    const extracted = Array.isArray(skills) ? skills : [];

    if (extracted.length === 0) {
      logger.info(`[SkillExtraction] No skills extracted from task ${taskId}`);
      return;
    }

    const validTypes = new Set(['build', 'deploy', 'test', 'fix', 'config', 'pattern']);

    for (const skill of extracted) {
      const skillType = validTypes.has(skill.skill_type) ? skill.skill_type : 'pattern';

      createSkill({
        productId: task.product_id,
        skillType: skillType as 'build' | 'deploy' | 'test' | 'fix' | 'config' | 'pattern',
        title: String(skill.title || 'Untitled Skill'),
        triggerKeywords: Array.isArray(skill.trigger_keywords) ? skill.trigger_keywords : [],
        prerequisites: skill.prerequisites || [],
        steps: Array.isArray(skill.steps) ? skill.steps : [],
        verification: skill.verification || undefined,
        createdByTaskId: taskId,
        createdByAgentId: task.assigned_agent_id || undefined,
      });
    }

    logger.info(`[SkillExtraction] Extracted ${extracted.length} skill(s) from task ${taskId}`);

    if (task.product_id) {
      emitAutopilotActivity({
        productId: task.product_id,
        cycleId: taskId,
        cycleType: 'research',
        eventType: 'skills_extracted',
        message: `${extracted.length} skill(s) extracted from task "${task.title}"`,
        detail: extracted.map(s => s.title).join(', '),
      });
    }
  } catch (err) {
    // Non-blocking — skill extraction failure should never break the task flow
    logger.error(`[SkillExtraction] Failed for task ${taskId}:`, err);
  }
}
