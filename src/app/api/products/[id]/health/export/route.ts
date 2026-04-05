import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getScoreHistory, computeHealthScore, getWeights } from '@/lib/autopilot/health-score';
import { getProduct } from '@/lib/autopilot/products';

/**
 * GET /api/products/[id]/health/export?format=csv|json
 * Export 30-day health score history.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = getProduct(id);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const format = req.nextUrl.searchParams.get('format') || 'json';
    const history = getScoreHistory(id, 30);

    if (format === 'csv') {
      const headers = [
        'date',
        'overall_score',
        'research_freshness',
        'pipeline_depth',
        'swipe_velocity',
        'build_success',
        'cost_efficiency',
      ];
      const rows = history.map((h) =>
        [
          h.snapshot_date,
          h.overall_score,
          h.research_freshness_score,
          h.pipeline_depth_score,
          h.swipe_velocity_score,
          h.build_success_score,
          h.cost_efficiency_score,
        ].join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${product.name.replace(/[^a-z0-9]/gi, '_')}_health_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Default: JSON
    return NextResponse.json({
      product_id: id,
      product_name: product.name,
      exported_at: new Date().toISOString(),
      history,
    });
  } catch (error) {
    logger.error('[API] Health export error:', error);
    return NextResponse.json(
      { error: 'Failed to export health data' },
      { status: 500 }
    );
  }
}
