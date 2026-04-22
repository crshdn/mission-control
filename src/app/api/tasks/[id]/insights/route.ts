export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { generateInsights, getInsights, saveInsights } from '@/lib/session-insights';
import { generateImprovedPrompt } from '@/lib/prompt-improver';

// GET /api/tasks/[id]/insights — retrieve or generate insights for a task
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const task = queryOne<{ id: string; status: string; product_id: string | null; title: string; description: string | null }>(
    'SELECT id, status, product_id, title, description FROM tasks WHERE id = ?',
    [id]
  );
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Return existing insights if available
  const existing = getInsights(id);
  if (existing) {
    return NextResponse.json({
      ...existing,
      timeline_data: JSON.parse(existing.timeline_data || '[]'),
      insights_json: JSON.parse(existing.insights_json || '{}'),
    });
  }

  return NextResponse.json({ error: 'No insights generated yet' }, { status: 404 });
}

// POST /api/tasks/[id]/insights — generate (or regenerate) insights for a task
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const task = queryOne<{ id: string; status: string; product_id: string | null; title: string; description: string | null }>(
    'SELECT id, status, product_id, title, description FROM tasks WHERE id = ?',
    [id]
  );
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const productId = task.product_id || 'unknown';

  // Generate insights from activity data
  const insights = generateInsights(id);
  if (!insights) {
    return NextResponse.json({ error: 'Could not generate insights — no activity data' }, { status: 400 });
  }

  // Generate improved prompt via LLM (non-blocking failure)
  let improvedPrompt: string | null = null;
  try {
    improvedPrompt = await generateImprovedPrompt({
      originalDescription: task.description || '',
      taskTitle: task.title,
      taskStatus: task.status,
      insights,
    });
  } catch (err) {
    console.error('[Insights] Prompt improvement failed, continuing without it:', err);
  }

  // Save to database
  saveInsights(id, productId, insights, improvedPrompt || undefined);

  // Return the generated insights
  const saved = getInsights(id);
  if (!saved) {
    return NextResponse.json({ error: 'Failed to save insights' }, { status: 500 });
  }

  return NextResponse.json({
    ...saved,
    timeline_data: JSON.parse(saved.timeline_data || '[]'),
    insights_json: JSON.parse(saved.insights_json || '{}'),
  });
}
