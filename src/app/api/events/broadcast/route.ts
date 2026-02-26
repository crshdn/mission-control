/**
 * POST /api/events/broadcast
 *
 * SSE relay endpoint — daemon POSTs events here to push real-time updates
 * to browser clients. Required because the daemon is a separate process
 * and cannot access the in-memory SSE client set directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { broadcast } from '@/lib/events';
import type { SSEEvent } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as SSEEvent;

    if (!body.type || !body.payload) {
      return NextResponse.json(
        { error: 'Missing type or payload' },
        { status: 400 }
      );
    }

    broadcast(body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Broadcast] Error:', error);
    return NextResponse.json(
      { error: 'Failed to broadcast event' },
      { status: 500 }
    );
  }
}
