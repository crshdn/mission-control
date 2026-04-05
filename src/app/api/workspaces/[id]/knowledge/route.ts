import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { queryAll, run } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workspaces/[id]/knowledge
 * Query knowledge entries for a workspace
 * Supports query params: category, tags, limit
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  try {
    let sql = 'SELECT * FROM knowledge_entries WHERE workspace_id = ?';
    const sqlParams: unknown[] = [workspaceId];

    if (category) {
      sql += ' AND category = ?';
      sqlParams.push(category);
    }

    sql += ' ORDER BY confidence DESC, created_at DESC LIMIT ?';
    sqlParams.push(limit);

    const entries = queryAll<{
      id: string; workspace_id: string; task_id: string; category: string;
      title: string; content: string; tags: string; confidence: number;
      created_by_agent_id: string; created_at: string;
    }>(sql, sqlParams);

    const parsed = entries.map(e => ({
      ...e,
      tags: e.tags ? JSON.parse(e.tags) : [],
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    logger.error('Failed to fetch knowledge entries:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}

/**
 * POST /api/workspaces/[id]/knowledge
 * Create a knowledge entry (used by Learner agent)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;

  try {
    const body = await request.json();
    const { task_id, category, title, content, tags, confidence, created_by_agent_id } = body;

    if (!category || !title || !content) {
      return NextResponse.json(
        { error: 'category, title, and content are required' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();

    run(
      `INSERT INTO knowledge_entries (id, workspace_id, task_id, category, title, content, tags, confidence, created_by_agent_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        id, workspaceId, task_id || null, category, title, content,
        tags ? JSON.stringify(tags) : null,
        confidence ?? 0.5,
        created_by_agent_id || null
      ]
    );

    return NextResponse.json({ id, message: 'Knowledge entry created' }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create knowledge entry:', error);
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
}
