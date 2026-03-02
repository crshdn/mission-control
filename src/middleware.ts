import { NextRequest, NextResponse } from 'next/server';
import { apiLimiter, webhookLimiter } from '@/lib/rate-limit';

// Log warning at startup if auth is disabled
const MC_API_TOKEN = process.env.MC_API_TOKEN;
if (!MC_API_TOKEN) {
  console.warn('[SECURITY WARNING] MC_API_TOKEN not set - API authentication is DISABLED (local dev mode)');
}

/**
 * Extract client IP from request headers (respects proxies).
 * Falls back to 'unknown' to ensure rate limiter still works.
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.ip ||
    'unknown'
  );
}

/**
 * Check if a request originates from the same host (browser UI).
 * Same-origin browser requests include a Referer or Origin header
 * pointing to the MC server itself. Server-side render fetches
 * (Next.js RSC) come from the same process and have no Origin.
 */
function isSameOriginRequest(request: NextRequest): boolean {
  const host = request.headers.get('host');
  if (!host) return false;

  // Server-side fetches from Next.js (no origin/referer) — same process
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // If neither origin nor referer is set, this is likely a server-side
  // fetch or a direct curl. Require auth for these (external API calls).
  if (!origin && !referer) return false;

  // Check if Origin matches the host
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) return true;
    } catch {
      // Invalid origin header
    }
  }

  // Check if Referer matches the host
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) return true;
    } catch {
      // Invalid referer header
    }
  }

  return false;
}

// Demo mode — read-only, blocks all mutations
const DEMO_MODE = process.env.DEMO_MODE === 'true';
if (DEMO_MODE) {
  console.log('[DEMO] Running in demo mode — all write operations are blocked');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes
  if (!pathname.startsWith('/api/')) {
    // Add demo mode header for UI detection
    if (DEMO_MODE) {
      const response = NextResponse.next();
      response.headers.set('X-Demo-Mode', 'true');
      return response;
    }
    return NextResponse.next();
  }

  // ── Rate Limiting ────────────────────────────────────────────────
  const ip = getClientIp(request);
  const isWebhook = pathname.startsWith('/api/webhooks/');
  const limiter = isWebhook ? webhookLimiter : apiLimiter;
  const { allowed, remaining, resetMs } = limiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(resetMs / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // ── Demo Mode ────────────────────────────────────────────────────
  if (DEMO_MODE) {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      return NextResponse.json(
        { error: 'Demo mode — this is a read-only instance. Visit github.com/crshdn/mission-control to run your own!' },
        { status: 403 }
      );
    }
    return addRateLimitHeaders(NextResponse.next(), remaining);
  }

  // ── Auth ─────────────────────────────────────────────────────────
  // If MC_API_TOKEN is not set, auth is disabled (dev mode)
  if (!MC_API_TOKEN) {
    return addRateLimitHeaders(NextResponse.next(), remaining);
  }

  // Allow same-origin browser requests (UI fetching its own API)
  if (isSameOriginRequest(request)) {
    return addRateLimitHeaders(NextResponse.next(), remaining);
  }

  // Special case: /api/events/stream (SSE) - allow token as query param
  if (pathname === '/api/events/stream') {
    const queryToken = request.nextUrl.searchParams.get('token');
    if (queryToken && queryToken === MC_API_TOKEN) {
      return addRateLimitHeaders(NextResponse.next(), remaining);
    }
    // Fall through to header check below
  }

  // Check Authorization header for bearer token
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (token !== MC_API_TOKEN) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return addRateLimitHeaders(NextResponse.next(), remaining);
}

/** Attach rate-limit headers to a successful response. */
function addRateLimitHeaders(response: NextResponse, remaining: number): NextResponse {
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
