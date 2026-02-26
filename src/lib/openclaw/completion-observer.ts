import type { OpenClawClient } from '@/lib/openclaw/client';
import { getMissionControlUrl } from '@/lib/config';
import { logOpenClawDiagnostic } from '@/lib/openclaw/diagnostics';

const observedClients = new WeakSet<OpenClawClient>();
const recentlyProcessed = new Map<string, number>();
const DEDUPE_TTL_MS = 5 * 60 * 1000;

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('agent:main:')) {
    return value.replace('agent:main:', '');
  }
  return value;
}

function collectStrings(input: unknown, out: string[] = []): string[] {
  if (typeof input === 'string') {
    out.push(input);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectStrings(item, out);
    return out;
  }
  if (input && typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      collectStrings(value, out);
    }
  }
  return out;
}

function extractTaskCompleteMessage(input: unknown): string | null {
  const strings = collectStrings(input);
  for (const value of strings) {
    const match = value.match(/TASK_COMPLETE:\s*(.+)/i);
    if (match) {
      return `TASK_COMPLETE: ${match[1].trim()}`;
    }
  }
  return null;
}

function extractSessionId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const candidateObj = input as Record<string, unknown>;
  return (
    normalizeSessionId(candidateObj.session_id) ||
    normalizeSessionId(candidateObj.sessionId) ||
    normalizeSessionId(candidateObj.session_key) ||
    normalizeSessionId(candidateObj.sessionKey) ||
    null
  );
}

function pruneDedupeCache(now: number): void {
  for (const [key, timestamp] of Array.from(recentlyProcessed.entries())) {
    if (now - timestamp > DEDUPE_TTL_MS) {
      recentlyProcessed.delete(key);
    }
  }
}

async function forwardCompletionToWebhook(sessionId: string, message: string): Promise<void> {
  const missionControlUrl = getMissionControlUrl();
  const key = `${sessionId}:${message}`;
  const now = Date.now();
  pruneDedupeCache(now);
  if (recentlyProcessed.has(key)) {
    logOpenClawDiagnostic({
      kind: 'completion_forward',
      status: 'skipped',
      message: 'Duplicate TASK_COMPLETE signal suppressed',
      metadata: { session_id: sessionId, message },
    });
    return;
  }
  recentlyProcessed.set(key, now);

  try {
    logOpenClawDiagnostic({
      kind: 'completion_forward',
      status: 'attempt',
      message: 'Forwarding TASK_COMPLETE to webhook',
      metadata: { session_id: sessionId, message, webhook_url: `${missionControlUrl}/api/webhooks/agent-completion` },
    });

    const response = await fetch(`${missionControlUrl}/api/webhooks/agent-completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logOpenClawDiagnostic({
        kind: 'completion_forward',
        status: 'failure',
        message: 'Completion webhook returned non-2xx',
        metadata: {
          session_id: sessionId,
          status_code: response.status,
          response_body: body.slice(0, 1000),
        },
      });
      return;
    }

    logOpenClawDiagnostic({
      kind: 'completion_forward',
      status: 'success',
      message: 'Completion webhook accepted',
      metadata: { session_id: sessionId },
    });
  } catch (error) {
    console.error('[OpenClaw][CompletionObserver] Failed to forward completion webhook:', error);
    logOpenClawDiagnostic({
      kind: 'completion_forward',
      status: 'failure',
      message: 'Completion webhook request failed',
      metadata: {
        session_id: sessionId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export async function triggerSyntheticCompletionForward(
  sessionId: string,
  summary: string,
): Promise<{ sessionId: string; message: string }> {
  const cleanSessionId = normalizeSessionId(sessionId);
  if (!cleanSessionId || !cleanSessionId.startsWith('mission-control-')) {
    throw new Error('session_id must resolve to a mission-control-* session');
  }

  const safeSummary = summary.trim() || 'synthetic completion test';
  const message = `TASK_COMPLETE: ${safeSummary} [synthetic:${Date.now()}]`;
  await forwardCompletionToWebhook(cleanSessionId, message);
  return { sessionId: cleanSessionId, message };
}

export function attachCompletionObserver(client: OpenClawClient): void {
  if (observedClients.has(client)) return;
  observedClients.add(client);

  client.on('notification', (notification: unknown) => {
    try {
      const message = extractTaskCompleteMessage(notification);
      if (!message) return;

      const wrapper = notification as { params?: unknown };
      const sessionId = extractSessionId(notification) || extractSessionId(wrapper?.params) || null;
      if (!sessionId) return;
      if (!sessionId.startsWith('mission-control-')) return;

      void forwardCompletionToWebhook(sessionId, message);
    } catch (error) {
      console.error('[OpenClaw][CompletionObserver] Notification parse error:', error);
    }
  });
}
