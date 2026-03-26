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

function inferSkillType(taskTitle: string, taskDescription: string): ExtractedSkill['skill_type'] {
  const text = `${taskTitle} ${taskDescription}`.toLowerCase();
  if (/(test|validate|verification|qa|assert)/.test(text)) return 'test';
  if (/(fix|bug|repair|regression)/.test(text)) return 'fix';
  if (/(deploy|release|ship|publish)/.test(text)) return 'deploy';
  if (/(config|configure|setup|environment|env)/.test(text)) return 'config';
  if (/(build|implement|code|feature)/.test(text)) return 'build';
  return 'pattern';
}

function inferTriggerKeywords(taskTitle: string, taskDescription: string): string[] {
  const stopWords = new Set([
    'this', 'that', 'with', 'from', 'into', 'then', 'than', 'task', 'should', 'would', 'could',
    'again', 'same', 'later', 'their', 'there', 'about', 'after', 'before', 'where', 'which',
    'using', 'used', 'create', 'record', 'future', 'agent', 'agents',
  ]);

  const words = `${taskTitle} ${taskDescription}`
    .toLowerCase()
    .match(/[a-z0-9_-]{4,}/g) || [];

  return Array.from(new Set(words.filter(word => !stopWords.has(word)))).slice(0, 6);
}

function buildFallbackSkill(
  task: Task & { product_id: string; assigned_agent_id: string },
  activities: Array<{ activity_type: string; message: string; metadata: string | null }>,
  deliverables: Array<{ deliverable_type: string; title: string; path: string | null; description: string | null }>,
): ExtractedSkill | null {
  if (deliverables.length === 0) return null;

  const completionActivity = activities.find(activity => activity.activity_type === 'completed');
  if (!completionActivity) return null;

  const taskDescription = task.description || '';
  const inferredType = inferSkillType(task.title, taskDescription);
  const triggerKeywords = inferTriggerKeywords(task.title, taskDescription);

  const steps: SkillStep[] = [
    {
      order: 1,
      description: completionActivity.message || `Carry out the workflow described by "${task.title}"`,
    },
  ];

  deliverables.forEach((deliverable, index) => {
    steps.push({
      order: steps.length + 1,
      description: `Create and register the ${deliverable.deliverable_type} deliverable "${deliverable.title}"`,
      file_path: deliverable.path || undefined,
      expected_output: deliverable.description || deliverable.title,
      notes: index === 0 ? 'Preserve the artifact path so later tasks can inspect or reuse it.' : undefined,
    });
  });

  steps.push({
    order: steps.length + 1,
    description: 'Log a completion activity summarizing the validated outcome and the reusable workflow.',
  });

  return {
    title: task.title,
    skill_type: inferredType,
    trigger_keywords: triggerKeywords,
    prerequisites: ['A task requires a repeatable workflow with a recorded artifact or deliverable.'],
    steps,
    verification: 'The task records a completion activity and at least one deliverable that future agents can inspect.',
  };
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
    console.log(`[SkillExtraction] No activities/deliverables for task ${taskId}, skipping`);
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

Extract 0-3 reusable skills from this task. Only extract skills that would genuinely help a future agent on the same product.

Important:
- If the task demonstrates a repeatable workflow with concrete steps, deliverables, or validation actions, extract at least 1 skill.
- Prefer extracting a narrowly-scoped skill over returning [] when there is a reusable pattern.
- Good candidates include validation checklists, artifact-creation flows, repeated debugging fixes, repo setup commands, and delivery/reporting procedures.
- Only return [] when the task truly contains no reusable procedure beyond a one-off result.

For each skill, provide:
- title: specific and actionable (e.g. "LeadsFire npm install with legacy-peer-deps")
- skill_type: one of 'build', 'deploy', 'test', 'fix', 'config', 'pattern'
- trigger_keywords: array of words that would appear in tasks where this skill applies
- prerequisites: array of conditions that must be true
- steps: array of { order, description, command?, expected_output?, fallback? }
- verification: how to confirm the skill worked

Example of a valid narrow skill:
[
  {
    "title": "Record validation artifact and register it as a deliverable",
    "skill_type": "pattern",
    "trigger_keywords": ["validation", "artifact", "deliverable"],
    "prerequisites": ["Task requires lightweight proof of work"],
    "steps": [
      { "order": 1, "description": "Write the validation artifact file in the task workspace" },
      { "order": 2, "description": "Log a completion activity summarizing what was validated" },
      { "order": 3, "description": "Register the artifact as a task deliverable" }
    ],
    "verification": "The task has a completion activity and a deliverable that future agents can inspect"
  }
]

Respond with ONLY a JSON array. If no skills are worth extracting, return an empty array [].`;

  try {
    const { data: skills } = await completeJSON<ExtractedSkill[]>(prompt, {
      systemPrompt: 'You extract reusable development procedures from completed tasks. Respond with a JSON array only.',
      timeoutMs: 60_000,
    });

    const extracted = Array.isArray(skills) ? skills : [];
    const fallbackSkill = buildFallbackSkill(task, activities, deliverables);
    const skillsToCreate = extracted.length > 0 ? extracted : (fallbackSkill ? [fallbackSkill] : []);

    if (skillsToCreate.length === 0) {
      console.log(`[SkillExtraction] No skills extracted from task ${taskId}`);
      return;
    }

    const validTypes = new Set(['build', 'deploy', 'test', 'fix', 'config', 'pattern']);

    for (const skill of skillsToCreate) {
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

    console.log(`[SkillExtraction] Extracted ${skillsToCreate.length} skill(s) from task ${taskId}`);

    if (task.product_id) {
      emitAutopilotActivity({
        productId: task.product_id,
        cycleId: taskId,
        cycleType: 'research',
        eventType: 'skills_extracted',
        message: `${skillsToCreate.length} skill(s) extracted from task "${task.title}"`,
        detail: skillsToCreate.map(s => s.title).join(', '),
      });
    }
  } catch (err) {
    // Non-blocking — skill extraction failure should never break the task flow
    console.error(`[SkillExtraction] Failed for task ${taskId}:`, err);
  }
}
