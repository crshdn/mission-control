import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { extractEventId, getReplayWindowMs, verifyHyperagentSignature } from '@/lib/hyperagent';

export const dynamic = 'force-dynamic';

type HyperagentEventPayload = {
  event_type?: string;
  event_id?: string;
  task_id?: string;
  thread_id?: string;
  summary?: string;
  status?: string;
};

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hyperagent-signature');

    if (!verifyHyperagentSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: HyperagentEventPayload;
    try {
      payload = JSON.parse(rawBody) as HyperagentEventPayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const eventType = payload.event_type || 'unknown';
    const eventId = extractEventId(request.headers, payload as Record<string, unknown>);
    if (!eventId) {
      return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
    }

    const existing = queryOne<{ id: string; created_at: string }>(
      'SELECT id, created_at FROM hyperagent_webhook_deliveries WHERE event_id = ?',
      [eventId]
    );

    if (existing) {
      return NextResponse.json({ success: true, duplicate: true, event_id: eventId }, { status: 200 });
    }

    const now = new Date();
    const timestampHeader = request.headers.get('x-hyperagent-timestamp');
    if (timestampHeader) {
      const timestamp = Number(timestampHeader);
      if (Number.isFinite(timestamp)) {
        const eventTime = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
        const ageMs = Math.abs(now.getTime() - eventTime);
        if (ageMs > getReplayWindowMs()) {
          return NextResponse.json({ error: 'Event outside replay window' }, { status: 400 });
        }
      }
    }

    const nowIso = now.toISOString();
    const deliveryId = uuidv4();
    run(
      `INSERT INTO hyperagent_webhook_deliveries
       (id, event_id, event_type, status, payload, created_at)
       VALUES (?, ?, ?, 'received', ?, ?)`,
      [deliveryId, eventId, eventType, rawBody, nowIso]
    );

    let processedStatus: 'processed' | 'failed' = 'processed';
    let errorMessage: string | null = null;

    try {
      const message =
        payload.summary ||
        `Hyperagent event received: ${eventType}${payload.thread_id ? ` (${payload.thread_id})` : ''}`;

      run(
        `INSERT INTO events (id, type, task_id, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'system',
          payload.task_id || null,
          message,
          JSON.stringify({
            source: 'hyperagent',
            event_id: eventId,
            event_type: eventType,
            thread_id: payload.thread_id,
            status: payload.status
          }),
          nowIso
        ]
      );

      broadcast({
        type: 'event_created',
        payload: {
          source: 'hyperagent',
          event_id: eventId,
          event_type: eventType,
          task_id: payload.task_id || null
        }
      });
    } catch (error) {
      processedStatus = 'failed';
      errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    }

    run(
      `UPDATE hyperagent_webhook_deliveries
       SET status = ?, error_message = ?, processed_at = ?
       WHERE id = ?`,
      [processedStatus, errorMessage, new Date().toISOString(), deliveryId]
    );

    if (processedStatus === 'failed') {
      return NextResponse.json({ error: 'Failed to process event', event_id: eventId }, { status: 500 });
    }

    return NextResponse.json({ success: true, event_id: eventId }, { status: 202 });
  } catch (error) {
    console.error('[Hyperagent webhook] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
