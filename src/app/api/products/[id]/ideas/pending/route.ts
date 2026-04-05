import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getPendingIdeas } from '@/lib/autopilot/ideation';
import { queryAll } from '@/lib/db';
import type { Idea } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Allowed sort columns to prevent SQL injection
const SORT_COLUMNS: Record<string, string> = {
  impact_score: 'COALESCE(impact_score, 0)',
  feasibility_score: 'COALESCE(feasibility_score, 0)',
  complexity: "CASE complexity WHEN 'S' THEN 1 WHEN 'M' THEN 2 WHEN 'L' THEN 3 WHEN 'XL' THEN 4 ELSE 5 END",
  category: 'category',
  created_at: 'created_at',
  title: 'title',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sort_by');
    const sortDir = searchParams.get('sort_dir')?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // If sort params provided, use custom query; otherwise use default
    if (sortBy && SORT_COLUMNS[sortBy]) {
      const orderExpr = SORT_COLUMNS[sortBy];
      const ideas = queryAll<Idea>(
        `SELECT * FROM ideas WHERE product_id = ? AND status = 'pending' ORDER BY ${orderExpr} ${sortDir}, created_at ASC`,
        [id]
      );
      return NextResponse.json(ideas);
    }

    const ideas = getPendingIdeas(id);
    return NextResponse.json(ideas);
  } catch (error) {
    logger.error('Failed to fetch pending ideas:', error);
    return NextResponse.json({ error: 'Failed to fetch pending ideas' }, { status: 500 });
  }
}
