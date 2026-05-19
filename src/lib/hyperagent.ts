import { createHmac, timingSafeEqual } from 'crypto';

export function verifyHyperagentSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.HYPERAGENT_WEBHOOK_SECRET;
  if (!secret) {
    return true;
  }

  if (!signature) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature.trim(), 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function getReplayWindowMs(): number {
  const value = Number(process.env.HYPERAGENT_REPLAY_WINDOW_MS || '300000');
  return Number.isFinite(value) && value > 0 ? value : 300000;
}

export function extractEventId(headers: Headers, payload: Record<string, unknown>): string | null {
  const headerEventId = headers.get('x-hyperagent-event-id') || headers.get('x-event-id');
  const payloadEventId = typeof payload.event_id === 'string' ? payload.event_id : null;
  return headerEventId || payloadEventId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postToHyperagentWithRetry(payload: unknown): Promise<{
  delivered: boolean;
  attempts: number;
  status?: number;
  responseText?: string;
  endpoint?: string;
}> {
  const endpoint = process.env.HYPERAGENT_SYNC_ENDPOINT;
  if (!endpoint) {
    return { delivered: false, attempts: 0 };
  }

  const maxAttempts = Number(process.env.HYPERAGENT_SYNC_MAX_RETRIES || '3');
  const timeoutMs = Number(process.env.HYPERAGENT_SYNC_TIMEOUT_MS || '12000');
  const authToken = process.env.HYPERAGENT_SYNC_TOKEN;

  let lastStatus: number | undefined;
  let lastResponse = '';

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authToken ? { authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);
      lastStatus = res.status;
      lastResponse = await res.text();

      if (res.ok) {
        return {
          delivered: true,
          attempts: attempt,
          status: res.status,
          responseText: lastResponse,
          endpoint
        };
      }
    } catch (error) {
      clearTimeout(timeout);
      lastResponse = error instanceof Error ? error.message : 'Request failed';
    }

    if (attempt < Math.max(1, maxAttempts)) {
      // 0.5s, 1s, 2s exponential backoff
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  return {
    delivered: false,
    attempts: Math.max(1, maxAttempts),
    status: lastStatus,
    responseText: lastResponse,
    endpoint
  };
}
