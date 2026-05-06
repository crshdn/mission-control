import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { run, queryOne } from '@/lib/db';
import { broadcast } from '@/lib/events';

interface DispatchBody {
  query: string;
  impressions: number;
  position: number;
  page?: string;
}

interface ExistingTask {
  id: string;
  title: string;
  status: string;
}

const INVALID_QUERY_PATTERNS = [
  /^test$/i,
  /^test\s+/i,
  /\stest\s*/i,
  /^example$/i,
  /^sample$/i,
  /^demo$/i,
  /^placeholder$/i,
  /^lorem ipsum$/i,
];

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

function isInvalidQuery(query: string): boolean {
  const normalized = normalizeQuery(query);
  if (normalized.length < 4) {
    return true;
  }

  return INVALID_QUERY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export async function POST(request: NextRequest) {
  try {
    const body: DispatchBody = await request.json();
    const normalizedQuery = normalizeQuery(body.query || '');
    const { impressions, position, page } = body;

    if (!normalizedQuery) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    if (isInvalidQuery(normalizedQuery)) {
      return NextResponse.json(
        { error: 'Query looks like a placeholder or test input. Dispatch a real SEO opportunity instead.' },
        { status: 400 }
      );
    }

    const existingTask = queryOne<ExistingTask>(
      `SELECT id, title, status
       FROM tasks
       WHERE title = ?
         AND status NOT IN ('done', 'cancelled')
       ORDER BY created_at DESC
       LIMIT 1`,
      [`SEO Research: "${normalizedQuery}"`]
    );

    if (existingTask) {
      return NextResponse.json(
        {
          error: 'An active SEO research task already exists for this query.',
          existingTaskId: existingTask.id,
        },
        { status: 409 }
      );
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const title = `SEO Research: "${normalizedQuery}"`;
    const description = `## SEO Research Brief

**Query:** ${normalizedQuery}
**Current Position:** ${position?.toFixed(1) || 'unknown'}
**Impressions:** ${impressions?.toLocaleString() || 'unknown'}${page ? `\n**Target Page:** ${page}` : ''}

## Objective

Research and implement content optimizations to improve ranking for this query.

## Stages

1. Research - keyword analysis, competitor review, search intent
2. Content - update or create page targeting this query
3. Deployed - live on site
4. Measuring - tracking position change over 14 days

## Tags

growth-pipeline, seo-research

## Notes

Dispatched from Growth Dashboard opportunity queue.
`;

    const tagsJson = JSON.stringify(['growth-pipeline', 'seo-research']);

    run(
      `INSERT INTO tasks (id, title, description, status, priority, task_type, qc_status, tags, workspace_id, business_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        description,
        'inbox',
        'high',
        'research',
        'pending',
        tagsJson,
        'default',
        'default',
        now,
        now,
      ]
    );

    try {
      broadcast({ type: 'task_created', payload: { taskId: id, sessionId: '', summary: `Growth: New SEO research task for "${normalizedQuery}"` } });
    } catch {
      // broadcast failure is non-fatal
    }

    return NextResponse.json({ id, title, status: 'inbox' }, { status: 201 });
  } catch (err) {
    console.error('Failed to dispatch SEO research task:', err);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
