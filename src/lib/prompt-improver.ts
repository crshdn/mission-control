/**
 * Prompt Improver — LLM-powered prompt improvement from task outcomes.
 * Analyzes the original dispatch prompt alongside what went wrong/right
 * and suggests a better prompt template for similar future tasks.
 */

import { complete } from '@/lib/autopilot/llm';
import type { InsightResult } from '@/lib/session-insights';

interface PromptImproveInput {
  originalDescription: string;
  taskTitle: string;
  taskStatus: string;
  insights: InsightResult;
}

/**
 * Generate an improved prompt suggestion based on task outcomes.
 * Returns the improved prompt text, or null if generation fails.
 */
export async function generateImprovedPrompt(input: PromptImproveInput): Promise<string | null> {
  const { originalDescription, taskTitle, taskStatus, insights } = input;
  const { metrics, bottleneck_summary, timeline } = insights;

  const errorEvents = timeline.filter(e => e.severity === 'error');
  const stallEvents = timeline.filter(e => e.type === 'stall');

  const prompt = `You are an expert at writing task prompts for AI coding agents. Analyze the following task outcome and suggest an improved prompt.

## Original Task
**Title:** ${taskTitle}
**Description:** ${originalDescription || '(no description)'}
**Final Status:** ${taskStatus}

## Outcome Metrics
- Duration: ${metrics.duration_seconds}s
- Build attempts: ${metrics.build_attempts}
- Error count: ${metrics.error_count}
- Stall count: ${metrics.stall_count}
- Test pass rate: ${metrics.test_pass_rate !== null ? Math.round(metrics.test_pass_rate * 100) + '%' : 'N/A'}
- Time to first commit: ${metrics.time_to_first_commit !== null ? metrics.time_to_first_commit + 's' : 'N/A'}

## Bottleneck Summary
${bottleneck_summary}

## Errors Encountered
${errorEvents.length > 0 ? errorEvents.map(e => `- ${e.annotation}`).join('\n') : 'None'}

## Stalls
${stallEvents.length > 0 ? stallEvents.map(e => `- ${e.annotation}`).join('\n') : 'None'}

---

Based on this analysis, write an improved version of the original task description that would help an AI agent complete this type of task more successfully. Focus on:
1. Adding specificity where the agent got stuck
2. Pre-empting common errors by including relevant constraints
3. Breaking down complex steps if the agent stalled
4. Including test/build verification steps if builds failed

Return ONLY the improved prompt text, no explanations or preamble.`;

  try {
    const result = await complete(prompt, {
      systemPrompt: 'You are a prompt engineering expert. Return only the improved task prompt.',
      temperature: 0.5,
      maxTokens: 2048,
      timeoutMs: 60_000,
    });
    return result.content.trim();
  } catch (error) {
    console.error('[PromptImprover] Failed to generate improved prompt:', error);
    return null;
  }
}
