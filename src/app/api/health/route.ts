import { NextRequest, NextResponse } from 'next/server';
import { getHealthSummary, getHealthDetail } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Unauthenticated: returns {status, uptime_seconds} only.
 * Authenticated (Bearer MC_API_TOKEN) or same-origin: returns full detail payload.
 */
export async function GET(request: NextRequest) {
  try {
    const isAuthed = isAuthenticated(request);

    if (isAuthed) {
      const detail = getHealthDetail();
      return NextResponse.json(detail);
    }

    // Strip version from unauthenticated response to avoid info leakage
    const { status, uptime_seconds } = getHealthSummary();
    return NextResponse.json({ status, uptime_seconds });
  } catch (error) {
    return NextResponse.json(
      { error: 'Health check failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/**
 * Check if the request carries a valid Bearer token or originates from the same host.
 * This mirrors the middleware logic but is evaluated inline since /api/health
 * bypasses the global auth middleware.
 */
function isAuthenticated(request: NextRequest): boolean {
  const token = process.env.MC_API_TOKEN;

  // If no token is configured, treat all requests as authenticated (dev mode)
  if (!token) return true;

  // Check Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.substring(7) === token) {
    return true;
  }

  // Check same-origin (browser UI hitting its own API)
  const host = request.headers.get('host');
  if (host) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    if (origin) {
      try {
        if (new URL(origin).host === host) return true;
      } catch { /* invalid origin */ }
    }
    if (referer) {
      try {
        if (new URL(referer).host === host) return true;
      } catch { /* invalid referer */ }
    }
  }

  return false;
}
