import { NextRequest, NextResponse } from 'next/server';

// Log warning at startup if auth is disabled
const MC_API_TOKEN = process.env.MC_API_TOKEN;
if (!MC_API_TOKEN) {
  console.warn('[SECURITY WARNING] MC_API_TOKEN not set - API authentication is DISABLED (local dev mode)');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // If MC_API_TOKEN is not set, auth is disabled (dev mode)
  if (!MC_API_TOKEN) {
    return NextResponse.next();
  }

  // Special case: /api/events/stream (SSE) - allow token as query param
  if (pathname === '/api/events/stream') {
    const queryToken = request.nextUrl.searchParams.get('token');
    if (queryToken && queryToken === MC_API_TOKEN) {
      return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
