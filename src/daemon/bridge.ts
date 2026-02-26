/**
 * SSE Bridge — relays events from daemon to Next.js SSE clients
 * via POST /api/events/broadcast
 */

import type { SSEEvent } from '../lib/types';
import { log } from './logger';

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:4000';

export async function broadcastEvent(event: SSEEvent): Promise<void> {
  try {
    const res = await fetch(`${MISSION_CONTROL_URL}/api/events/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      log.warn(`Broadcast failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    log.warn(`Broadcast error: ${err instanceof Error ? err.message : 'Unknown'}`);
  }
}
