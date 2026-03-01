import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';

// Force this API route to be evaluated at request time.
// Next.js may try to prerender certain API routes as static during `next build`,
// which would freeze an "offline" status from build-time.
export const dynamic = 'force-dynamic';

// GET /api/openclaw/status - Check OpenClaw connection status
export async function GET() {
  try {
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (err) {
        return NextResponse.json({
          connected: false,
          error: 'Failed to connect to OpenClaw Gateway',
          gateway_url: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
        });
      }
    }

    // Try to list sessions to verify connection
    try {
      const sessions = await client.listSessions();
      return NextResponse.json({
        connected: true,
        sessions_count: sessions.length,
        sessions: sessions,
        gateway_url: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
      });
    } catch (err) {
      return NextResponse.json({
        connected: true,
        error: 'Connected but failed to list sessions',
        gateway_url: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
      });
    }
  } catch (error) {
    console.error('OpenClaw status check failed:', error);
    return NextResponse.json(
      {
        connected: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
