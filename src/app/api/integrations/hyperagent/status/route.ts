import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

type DeliveryRow = {
  event_id: string;
  event_type: string;
  status: string;
  created_at: string;
  error_message?: string | null;
};

export async function GET() {
  try {
    const recentDeliveries = queryAll<DeliveryRow>(
      `SELECT event_id, event_type, status, created_at, error_message
       FROM hyperagent_webhook_deliveries
       ORDER BY created_at DESC
       LIMIT 10`
    );

    return NextResponse.json({
      webhook_secret_configured: Boolean(process.env.HYPERAGENT_WEBHOOK_SECRET),
      sync_endpoint_configured: Boolean(process.env.HYPERAGENT_SYNC_ENDPOINT),
      sync_token_configured: Boolean(process.env.HYPERAGENT_SYNC_TOKEN),
      replay_window_ms: Number(process.env.HYPERAGENT_REPLAY_WINDOW_MS || '300000'),
      sync_timeout_ms: Number(process.env.HYPERAGENT_SYNC_TIMEOUT_MS || '12000'),
      sync_max_retries: Number(process.env.HYPERAGENT_SYNC_MAX_RETRIES || '3'),
      recent_deliveries: recentDeliveries
    });
  } catch (error) {
    console.error('[Hyperagent status] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
