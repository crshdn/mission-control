import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { recordCostEvent } from '@/lib/costs/tracker';
import { emitAutopilotActivity } from './activity';
import { completeJSON } from './llm';
import { batchCheckSimilarity, storeEmbedding, checkSimilarity } from './similarity';
import { getResearchPrograms } from './ab-testing';
import type { Product, Idea, ResearchCycle, SwipeHistoryEntry } from '@/lib/types';

function buildIdeationPrompt(
  product: Product,
  researchReport: string | null,
  swipeHistory: SwipeHistoryEntry[],
  learnedPreferences?: string
): string {
  const historyText = swipeHistory.length > 0
    ? swipeHistory.map(s => `- ${s.action}: [${s.category}] (impact: ${s.impact_score}, feasibility: ${s.feasibility_score}, complexity: ${s.complexity})`).join('\n')
    : 'No swipe history yet.';

  return `You are a Product Ideation Agent for Mission Control. Generate high-quality feature ideas based on research findings and user preferences.

## Instructions

1. Read the Product Program and Learned Preferences carefully.
2. Read the research report from the latest cycle.
3. Review the swipe history — understand what the user approves and rejects.
4. Generate 10-20 ideas as a JSON array, each with:
   - title: specific and actionable
   - description: detailed enough to build from
   - category: one of feature, improvement, ux, performance, integration, infrastructure, content, growth, monetization, operations, security
   - research_backing: evidence from research
   - impact_score: 1-10
   - feasibility_score: 1-10
   - complexity: S (<4h), M (4-16h), L (16-40h), XL (40h+)
   - estimated_effort_hours: number
   - technical_approach: how to build it
   - risks: array of risk strings
   - tags: array of tag strings
   - competitive_analysis: comparison with competitors (optional)
   - target_user_segment: who benefits (optional)
   - revenue_potential: money impact (optional)

## Product Program

${product.product_program || 'No product program defined yet.'}

## Research Report

${researchReport || 'No research report available.'}

## Swipe History (Last 100)

${historyText}

${learnedPreferences ? `## Learned Preferences\n${learnedPreferences}` : ''}

## Output

Respond with ONLY a JSON array of idea objects. No markdown, no code blocks, no explanation. Just the raw JSON array.`;
}

/**
 * Run an ideation cycle. Returns the ideation cycle ID immediately.
 * Uses the Gateway's /v1/chat/completions endpoint for stateless prompt→response.
 * When an A/B test is active, runs ideation for each variant and tags ideas accordingly.
 */
export async function runIdeationCycle(productId: string, cycleId?: string, existingIdeationId?: string): Promise<string> {
  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [productId]);
  if (!product) throw new Error(`Product ${productId} not found`);

  // Get latest research report
  let researchReport: string | null = null;
  if (cycleId) {
    const cycle = queryOne<ResearchCycle>('SELECT * FROM research_cycles WHERE id = ?', [cycleId]);
    researchReport = cycle?.report || null;
  } else {
    const latestCycle = queryOne<ResearchCycle>(
      `SELECT * FROM research_cycles WHERE product_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
      [productId]
    );
    researchReport = latestCycle?.report || null;
    cycleId = latestCycle?.id;
  }

  const swipeHistory = queryAll<SwipeHistoryEntry>(
    'SELECT * FROM swipe_history WHERE product_id = ? ORDER BY created_at DESC LIMIT 100',
    [productId]
  );

  const prefModel = queryOne<{ learned_preferences_md: string }>(
    'SELECT learned_preferences_md FROM preference_models WHERE product_id = ? ORDER BY last_updated DESC LIMIT 1',
    [productId]
  );

  const ideationId = existingIdeationId || uuidv4();
  const now = new Date().toISOString();

  // Get A/B variant programs
  const programs = getResearchPrograms(productId);
  const isABTest = programs.some(p => p.variantId !== null);

  // Phase: init — create ideation_cycles row
  if (!existingIdeationId) {
    run(
      `INSERT INTO ideation_cycles (id, product_id, research_cycle_id, status, current_phase, started_at, last_heartbeat)
       VALUES (?, ?, ?, 'running', 'init', ?, ?)`,
      [ideationId, productId, cycleId || null, now, now]
    );
  }

  emitAutopilotActivity({
    productId, cycleId: ideationId, cycleType: 'ideation',
    eventType: 'phase_init',
    message: isABTest ? `Ideation cycle started (A/B test: ${programs.length} variant(s))` : 'Ideation cycle started',
    detail: `Product: ${product.name}`,
  });
  broadcast({ type: 'ideation_phase', payload: { productId, ideationId, phase: 'init' } });

  // Run async
  (async () => {
    try {
      let totalIdeasCount = 0;
      let totalTokensUsed = 0;

      for (const programEntry of programs) {
        const effectiveProduct = { ...product, product_program: programEntry.program };
        const variantLabel = programEntry.variantName ? ` [${programEntry.variantName}]` : '';

        // If the research report is a multi-variant report, extract the right sub-report
        let effectiveResearchReport = researchReport;
        if (researchReport && programEntry.variantId) {
          try {
            const parsed = JSON.parse(researchReport);
            if (parsed.variants && Array.isArray(parsed.variants)) {
              const variantReport = parsed.variants.find((v: { variantId: string }) => v.variantId === programEntry.variantId);
              if (variantReport) {
                effectiveResearchReport = JSON.stringify(variantReport.report);
              }
            }
          } catch {
            // Use full report as fallback
          }
        }

        const prompt = buildIdeationPrompt(effectiveProduct, effectiveResearchReport, swipeHistory, prefModel?.learned_preferences_md);

        // Phase: llm_submitted
        run(
          `UPDATE ideation_cycles SET current_phase = 'llm_submitted', last_heartbeat = ? WHERE id = ?`,
          [new Date().toISOString(), ideationId]
        );
        emitAutopilotActivity({
          productId, cycleId: ideationId, cycleType: 'ideation',
          eventType: 'phase_llm_submitted',
          message: `Sending ideation prompt to LLM${variantLabel}...`,
        });
        broadcast({ type: 'ideation_phase', payload: { productId, ideationId, phase: 'llm_submitted' } });

        // Phase: llm_polling
        run(
          `UPDATE ideation_cycles SET current_phase = 'llm_polling', last_heartbeat = ? WHERE id = ?`,
          [new Date().toISOString(), ideationId]
        );
        emitAutopilotActivity({
          productId, cycleId: ideationId, cycleType: 'ideation',
          eventType: 'phase_llm_polling',
          message: `Waiting for ideation agent response${variantLabel}...`,
        });
        broadcast({ type: 'ideation_phase', payload: { productId, ideationId, phase: 'llm_polling' } });

        const { data: rawIdeas, model: responseModel, usage } = await completeJSON<unknown[]>(prompt, {
          systemPrompt: 'You are a product ideation agent. Respond with a JSON array of idea objects only.',
          timeoutMs: 300_000,
        });

        // Normalize: handle { ideas: [...] } wrapper
        let ideasData: unknown[];
        if (Array.isArray(rawIdeas)) {
          ideasData = rawIdeas;
        } else if (rawIdeas && typeof rawIdeas === 'object' && 'ideas' in (rawIdeas as Record<string, unknown>)) {
          ideasData = (rawIdeas as Record<string, unknown>).ideas as unknown[];
        } else {
          throw new Error(`Ideation response was not an array of ideas${variantLabel}`);
        }

        if (ideasData.length === 0) {
          throw new Error(`Ideation cycle returned 0 ideas${variantLabel}`);
        }

        // Phase: ideas_parsed
        run(
          `UPDATE ideation_cycles SET current_phase = 'ideas_parsed', phase_data = ?, last_heartbeat = ? WHERE id = ?`,
          [JSON.stringify({ ideas: ideasData, variantId: programEntry.variantId }), new Date().toISOString(), ideationId]
        );
        emitAutopilotActivity({
          productId, cycleId: ideationId, cycleType: 'ideation',
          eventType: 'phase_ideas_parsed',
          message: `Parsed ${ideasData.length} ideas from LLM response${variantLabel}`,
          detail: `Tokens used: ${usage.totalTokens}`,
          tokensUsed: usage.totalTokens,
        });
        broadcast({ type: 'ideation_phase', payload: { productId, ideationId, phase: 'ideas_parsed', count: ideasData.length } });

        // Store ideas with variant_id
        await storeIdeasFromPhaseData(ideationId, productId, cycleId || null, ideasData, {
          model: responseModel,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        }, programEntry.variantId || undefined);

        totalIdeasCount += ideasData.length;
        totalTokensUsed += usage.totalTokens;
      }

      console.log(`[Ideation] Cycle ${ideationId} completed: ${totalIdeasCount} ideas (tokens: ${totalTokensUsed})`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      run(
        `UPDATE ideation_cycles SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`,
        [errMsg, new Date().toISOString(), ideationId]
      );
      emitAutopilotActivity({
        productId, cycleId: ideationId, cycleType: 'ideation',
        eventType: 'error',
        message: 'Ideation cycle failed',
        detail: errMsg,
      });
      console.error(`[Ideation] Cycle ${ideationId} failed:`, error);
    }
  })();

  return ideationId;
}

/**
 * Store ideas from parsed phase data. Used by both normal flow and recovery.
 * When variantId is provided, ideas are tagged with the variant they came from.
 */
export async function storeIdeasFromPhaseData(
  ideationId: string,
  productId: string,
  researchCycleId: string | null,
  ideasData: unknown[],
  llmUsage?: { model: string; promptTokens: number; completionTokens: number; totalTokens: number },
  variantId?: string
): Promise<void> {
  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [productId]);

  const VALID_CATEGORIES = new Set([
    'feature', 'improvement', 'ux', 'performance', 'integration',
    'infrastructure', 'content', 'growth', 'monetization', 'operations', 'security'
  ]);

  // --- Similarity Detection: batch-check all candidates before insertion ---
  const candidates = ideasData.map((raw, index) => {
    const idea = raw as Record<string, unknown>;
    return {
      title: String(idea.title || 'Untitled'),
      description: String(idea.description || ''),
      index,
    };
  });

  let similarityResults: Map<number, ReturnType<typeof batchCheckSimilarity>[number]['result']>;
  try {
    const checks = batchCheckSimilarity(productId, candidates);
    similarityResults = new Map(checks.map(c => [c.index, c.result]));
  } catch (err) {
    // If similarity check fails, continue without it — don't block ideation
    console.error('[Similarity] Batch check failed, proceeding without dedup:', err);
    similarityResults = new Map();
  }

  let count = 0;
  let suppressed = 0;

  for (let idx = 0; idx < ideasData.length; idx++) {
    const raw = ideasData[idx];
    const idea = raw as Record<string, unknown>;
    const id = uuidv4();
    const now = new Date().toISOString();
    const rawCategory = String(idea.category || 'feature').toLowerCase().trim();
    const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'feature';
    const title = String(idea.title || 'Untitled');
    const description = String(idea.description || '');

    // Check similarity result for this candidate
    const simResult = similarityResults.get(idx);

    // Auto-suppress if >90% similar to a rejected idea
    if (simResult?.autoSuppress) {
      suppressed++;
      // Log suppression for audit trail
      const topMatch = simResult.similarIdeas.find(s => s.status === 'rejected');
      if (topMatch) {
        run(
          `INSERT INTO idea_suppressions (id, product_id, suppressed_title, suppressed_description, similar_to_idea_id, similarity_score, reason, ideation_cycle_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), productId, title, description, topMatch.ideaId, topMatch.similarity, simResult.suppressReason || 'Auto-suppressed', ideationId, now]
        );
      }
      emitAutopilotActivity({
        productId, cycleId: ideationId, cycleType: 'ideation',
        eventType: 'idea_suppressed',
        message: `Idea auto-suppressed: ${title}`,
        detail: simResult.suppressReason || 'Too similar to rejected idea',
      });
      console.log(`[Similarity] Auto-suppressed: "${title}" — ${simResult.suppressReason}`);
      continue; // Skip insertion
    }

    run(
      `INSERT INTO ideas (id, product_id, cycle_id, title, description, category, research_backing, impact_score, feasibility_score, complexity, estimated_effort_hours, competitive_analysis, target_user_segment, revenue_potential, technical_approach, risks, tags, source, source_research, similarity_flag, variant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'research', ?, ?, ?, ?, ?)`,
      [
        id, productId, researchCycleId || null,
        title,
        description,
        category,
        idea.research_backing ? String(idea.research_backing) : null,
        typeof idea.impact_score === 'number' ? idea.impact_score : null,
        typeof idea.feasibility_score === 'number' ? idea.feasibility_score : null,
        idea.complexity ? String(idea.complexity) : null,
        typeof idea.estimated_effort_hours === 'number' ? idea.estimated_effort_hours : null,
        idea.competitive_analysis ? String(idea.competitive_analysis) : null,
        idea.target_user_segment ? String(idea.target_user_segment) : null,
        idea.revenue_potential ? String(idea.revenue_potential) : null,
        idea.technical_approach ? String(idea.technical_approach) : null,
        Array.isArray(idea.risks) ? JSON.stringify(idea.risks) : null,
        Array.isArray(idea.tags) ? JSON.stringify(idea.tags) : null,
        idea.source_research ? JSON.stringify(idea.source_research) : null,
        simResult?.similarityFlag || null,
        variantId || null,
        now, now
      ]
    );

    // Store embedding for this new idea (for future comparisons)
    try {
      storeEmbedding(id, productId, title, description);
    } catch (err) {
      console.error(`[Similarity] Failed to store embedding for idea ${id}:`, err);
    }

    emitAutopilotActivity({
      productId, cycleId: ideationId, cycleType: 'ideation',
      eventType: 'idea_stored',
      message: `Idea stored: ${title}${simResult?.similarIdeas.length ? ` (⚠️ ${simResult.similarIdeas.length} similar)` : ''}`,
      detail: category,
    });

    count++;
  }

  // Log suppression summary if any were suppressed
  if (suppressed > 0) {
    emitAutopilotActivity({
      productId, cycleId: ideationId, cycleType: 'ideation',
      eventType: 'dedup_summary',
      message: `Deduplication: ${suppressed} ideas auto-suppressed (>90% similar to rejected)`,
      detail: `${count} ideas stored, ${suppressed} duplicates removed`,
    });
    console.log(`[Similarity] Dedup summary: ${count} stored, ${suppressed} suppressed`);
  }

  // Phase: ideas_stored
  run(
    `UPDATE ideation_cycles SET current_phase = 'ideas_stored', ideas_generated = ?, last_heartbeat = ? WHERE id = ?`,
    [count, new Date().toISOString(), ideationId]
  );
  emitAutopilotActivity({
    productId, cycleId: ideationId, cycleType: 'ideation',
    eventType: 'phase_ideas_stored',
    message: `${count} ideas stored in database`,
  });
  broadcast({ type: 'ideation_phase', payload: { productId, ideationId, phase: 'ideas_stored', count } });

  // Phase: completed
  if (researchCycleId) {
    run('UPDATE research_cycles SET ideas_generated = ? WHERE id = ?', [count, researchCycleId]);
  }

  if (product) {
    recordCostEvent({
      product_id: productId,
      workspace_id: product.workspace_id,
      cycle_id: researchCycleId,
      event_type: 'ideation_cycle',
      model: llmUsage?.model,
      tokens_input: llmUsage?.promptTokens || 0,
      tokens_output: llmUsage?.completionTokens || 0,
      cost_usd: 0,
    });
  }

  run(
    `UPDATE ideation_cycles SET status = 'completed', completed_at = ?, current_phase = 'completed' WHERE id = ?`,
    [new Date().toISOString(), ideationId]
  );
  emitAutopilotActivity({
    productId, cycleId: ideationId, cycleType: 'ideation',
    eventType: 'phase_completed',
    message: 'Ideation cycle completed successfully',
    detail: `Generated ${count} ideas${llmUsage ? ` | Tokens: ${llmUsage.totalTokens}` : ''}`,
    tokensUsed: llmUsage?.totalTokens,
  });

  broadcast({ type: 'ideas_generated', payload: { productId, count, cycleId: researchCycleId } });
  broadcast({ type: 'ideation_phase', payload: { productId, ideationId, phase: 'completed' } });
}

export function listIdeas(productId: string, filters?: {
  status?: string;
  category?: string;
  source?: string;
}): Idea[] {
  let sql = 'SELECT * FROM ideas WHERE product_id = ?';
  const params: unknown[] = [productId];

  if (filters?.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.category) {
    sql += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters?.source) {
    sql += ' AND source = ?';
    params.push(filters.source);
  }

  sql += ' ORDER BY created_at DESC';
  return queryAll<Idea>(sql, params);
}

export function getPendingIdeas(productId: string): Idea[] {
  return queryAll<Idea>(
    `SELECT * FROM ideas WHERE product_id = ? AND status = 'pending' ORDER BY impact_score DESC, created_at ASC`,
    [productId]
  );
}

export function createManualIdea(productId: string, input: {
  title: string;
  description: string;
  category: string;
  complexity?: string;
  impact_score?: number;
  feasibility_score?: number;
  estimated_effort_hours?: number;
  tags?: string[];
  technical_approach?: string;
  risks?: string[];
}): Idea {
  const id = uuidv4();
  const now = new Date().toISOString();

  // Check similarity before inserting
  let similarityFlag: string | null = null;
  try {
    const simResult = checkSimilarity(productId, input.title, input.description);
    similarityFlag = simResult.similarityFlag || null;
  } catch (err) {
    console.error('[Similarity] Check failed for manual idea, proceeding:', err);
  }

  run(
    `INSERT INTO ideas (id, product_id, title, description, category, impact_score, feasibility_score, complexity, estimated_effort_hours, technical_approach, risks, tags, source, similarity_flag, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)`,
    [
      id, productId, input.title, input.description, input.category,
      input.impact_score || null, input.feasibility_score || null,
      input.complexity || null, input.estimated_effort_hours || null,
      input.technical_approach || null,
      input.risks ? JSON.stringify(input.risks) : null,
      input.tags ? JSON.stringify(input.tags) : null,
      similarityFlag,
      now, now
    ]
  );

  // Store embedding for future comparisons
  try {
    storeEmbedding(id, productId, input.title, input.description);
  } catch (err) {
    console.error('[Similarity] Failed to store embedding for manual idea:', err);
  }

  return queryOne<Idea>('SELECT * FROM ideas WHERE id = ?', [id])!;
}

export function updateIdea(ideaId: string, updates: Partial<{
  title: string;
  description: string;
  category: string;
  status: string;
  user_notes: string;
  task_id: string;
}>): Idea | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return queryOne<Idea>('SELECT * FROM ideas WHERE id = ?', [ideaId]);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(ideaId);

  run(`UPDATE ideas SET ${fields.join(', ')} WHERE id = ?`, values);
  return queryOne<Idea>('SELECT * FROM ideas WHERE id = ?', [ideaId]);
}
