import { NextRequest, NextResponse } from 'next/server';
import { getRecentOpenClawDiagnostics } from '@/lib/openclaw/diagnostics';

/**
 * GET /api/openclaw/diagnostics
 *
 * Quick diagnostics endpoint for Mission Control <-> OpenClaw integration.
 * Returns recent relay/completion events from the events table.
 */
export async function GET(request: NextRequest) {
  try {
    const limitRaw = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(Math.max(Number(limitRaw || 50), 1), 500);
    const rows = getRecentOpenClawDiagnostics(limit);

    const parsed = rows.map((row) => {
      let metadata: unknown = null;
      try {
        metadata = row.metadata ? JSON.parse(row.metadata) : null;
      } catch {
        metadata = row.metadata;
      }
      return {
        id: row.id,
        type: row.type,
        message: row.message,
        metadata,
        created_at: row.created_at,
      };
    });

    const summary = {
      total: parsed.length,
      relay_attempts: parsed.filter((r) => r.message.includes('[openclaw:discord_relay:attempt]')).length,
      relay_success: parsed.filter((r) => r.message.includes('[openclaw:discord_relay:success]')).length,
      relay_failure: parsed.filter((r) => r.message.includes('[openclaw:discord_relay:failure]')).length,
      completion_attempts: parsed.filter((r) => r.message.includes('[openclaw:completion_forward:attempt]')).length,
      completion_success: parsed.filter((r) => r.message.includes('[openclaw:completion_forward:success]')).length,
      completion_failure: parsed.filter((r) => r.message.includes('[openclaw:completion_forward:failure]')).length,
    };

    return NextResponse.json({ summary, entries: parsed });
  } catch (error) {
    console.error('Failed to load OpenClaw diagnostics:', error);
    return NextResponse.json(
      { error: 'Failed to load diagnostics' },
      { status: 500 },
    );
  }
}

