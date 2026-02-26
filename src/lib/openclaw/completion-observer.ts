import type { OpenClawClient } from '@/lib/openclaw/client';
import { getMissionControlUrl } from '@/lib/config';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { logOpenClawDiagnostic } from '@/lib/openclaw/diagnostics';
import type { OpenClawSession, Task } from '@/lib/types';

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

type ParsedSignal =
  | { type: 'task_complete'; raw: string; summary: string }
  | { type: 'progress_update'; raw: string; changed: string; next: string; eta: string }
  | { type: 'blocked'; raw: string; blocked: string; need: string; meanwhile: string };

function extractSignals(input: unknown): ParsedSignal[] {
  const signals: ParsedSignal[] = [];
  for (const value of collectStrings(input)) {
    const trimmed = value.trim();

    const complete = trimmed.match(/^TASK_COMPLETE:\s*(.+)$/i);
    if (complete) {
      signals.push({
        type: 'task_complete',
        raw: complete[0],
        summary: complete[1].trim(),
      });
      continue;
    }

    const progress = trimmed.match(/^PROGRESS_UPDATE:\s*(.+?)\s*\|\s*next:\s*(.+?)\s*\|\s*eta:\s*(.+)$/i);
    if (progress) {
      signals.push({
        type: 'progress_update',
        raw: progress[0],
        changed: progress[1].trim(),
        next: progress[2].trim(),
        eta: progress[3].trim(),
      });
      continue;
    }

    const blocked = trimmed.match(/^BLOCKED:\s*(.+?)\s*\|\s*need:\s*(.+?)\s*\|\s*meanwhile:\s*(.+)$/i);
    if (blocked) {
      signals.push({
        type: 'blocked',
        raw: blocked[0],
        blocked: blocked[1].trim(),
        need: blocked[2].trim(),
        meanwhile: blocked[3].trim(),
      });
      continue;
    }
  }
  return signals;
}

function extractTaskCompleteMessage(input: unknown): string | null {
  for (const signal of extractSignals(input)) {
    if (signal.type === 'task_complete') {
      return `TASK_COMPLETE: ${signal.summary}`;
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

function findActiveTaskForSession(sessionId: string): { session: OpenClawSession; task: Task } | null {
  const session = queryOne<OpenClawSession>(
    'SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ? AND status = ?',
    [sessionId, 'active'],
  );
  if (!session?.agent_id) return null;

  const task = queryOne<Task>(
    `SELECT *
     FROM tasks
     WHERE assigned_agent_id = ?
       AND status IN ('assigned', 'in_progress', 'review')
     ORDER BY datetime(updated_at) DESC
     LIMIT 1`,
    [session.agent_id],
  );
  if (!task) return null;

  return { session, task };
}

function addTaskActivity(params: {
  taskId: string;
  agentId?: string | null;
  type: 'updated' | 'completed' | 'status_changed';
  message: string;
  metadata?: Record<string, unknown>;
}): void {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.taskId,
      params.agentId || null,
      params.type,
      params.message,
      params.metadata ? JSON.stringify(params.metadata) : null,
      now,
    ],
  );

  broadcast({
    type: 'activity_logged',
    payload: {
      id,
      task_id: params.taskId,
      agent_id: params.agentId || undefined,
      activity_type: params.type,
      message: params.message,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
      created_at: now,
    },
  });
}

function parseDeliverables(summary: string): Array<{ deliverable_type: 'url' | 'file' | 'artifact'; title: string; path?: string }> {
  const match = summary.match(/deliverables?\s*:\s*([^|]+)/i);
  if (!match) return [];

  const raw = match[1].trim();
  if (!raw) return [];

  const parts = raw
    .split(/,\s*|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const result: Array<{ deliverable_type: 'url' | 'file' | 'artifact'; title: string; path?: string }> = [];
  for (const part of parts) {
    const md = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const normalized = md ? md[2].trim() : part;
    const label = md ? md[1].trim() : normalized;

    if (/^https?:\/\//i.test(normalized)) {
      result.push({
        deliverable_type: 'url',
        title: label,
        path: normalized,
      });
      continue;
    }

    if (
      normalized.startsWith('/') ||
      normalized.startsWith('~/') ||
      normalized.startsWith('./') ||
      normalized.includes('/')
    ) {
      result.push({
        deliverable_type: 'file',
        title: label,
        path: normalized,
      });
      continue;
    }

    result.push({
      deliverable_type: 'artifact',
      title: label,
    });
  }

  return result;
}

function addDeliverablesFromSummary(taskId: string, summary: string): number {
  const items = parseDeliverables(summary);
  let created = 0;
  for (const item of items) {
    const duplicate = queryOne<{ id: string }>(
      `SELECT id
       FROM task_deliverables
       WHERE task_id = ?
         AND deliverable_type = ?
         AND title = ?
         AND COALESCE(path, '') = COALESCE(?, '')`,
      [taskId, item.deliverable_type, item.title, item.path || null],
    );
    if (duplicate) continue;

    const deliverableId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    run(
      `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        deliverableId,
        taskId,
        item.deliverable_type,
        item.title,
        item.path || null,
        'Auto-ingested from TASK_COMPLETE signal',
        createdAt,
      ],
    );

    broadcast({
      type: 'deliverable_added',
      payload: {
        id: deliverableId,
        task_id: taskId,
        deliverable_type: item.deliverable_type,
        title: item.title,
        path: item.path || undefined,
        description: 'Auto-ingested from TASK_COMPLETE signal',
        created_at: createdAt,
      },
    });
    created += 1;
  }
  return created;
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
      const wrapper = notification as { params?: unknown };
      const sessionId = extractSessionId(notification) || extractSessionId(wrapper?.params) || null;
      if (!sessionId) return;
      if (!sessionId.startsWith('mission-control-')) return;

      const signals = extractSignals(notification);
      if (signals.length === 0) return;

      const active = findActiveTaskForSession(sessionId);
      const now = Date.now();
      pruneDedupeCache(now);

      for (const signal of signals) {
        const key = `${sessionId}:${signal.type}:${signal.raw}`;
        if (recentlyProcessed.has(key)) continue;
        recentlyProcessed.set(key, now);

        if (!active) {
          logOpenClawDiagnostic({
            kind: 'completion_forward',
            status: 'skipped',
            message: 'Signal received but no active task found for session',
            metadata: { session_id: sessionId, signal_type: signal.type },
          });
          continue;
        }

        if (signal.type === 'progress_update') {
          addTaskActivity({
            taskId: active.task.id,
            agentId: active.session.agent_id,
            type: 'updated',
            message: `Progress update: ${signal.changed}`,
            metadata: {
              next: signal.next,
              eta: signal.eta,
              source: 'openclaw_signal',
            },
          });
          continue;
        }

        if (signal.type === 'blocked') {
          addTaskActivity({
            taskId: active.task.id,
            agentId: active.session.agent_id,
            type: 'status_changed',
            message: `Blocked: ${signal.blocked}`,
            metadata: {
              need: signal.need,
              meanwhile: signal.meanwhile,
              source: 'openclaw_signal',
            },
          });
          continue;
        }

        addTaskActivity({
          taskId: active.task.id,
          agentId: active.session.agent_id,
          type: 'completed',
          message: `Completion reported: ${signal.summary}`,
          metadata: { source: 'openclaw_signal' },
        });
        const deliverableCount = addDeliverablesFromSummary(active.task.id, signal.summary);
        if (deliverableCount > 0) {
          logOpenClawDiagnostic({
            kind: 'completion_forward',
            status: 'success',
            message: 'Auto-ingested deliverables from TASK_COMPLETE',
            metadata: { session_id: sessionId, task_id: active.task.id, deliverable_count: deliverableCount },
          });
        }

        void forwardCompletionToWebhook(sessionId, `TASK_COMPLETE: ${signal.summary}`);
      }
    } catch (error) {
      console.error('[OpenClaw][CompletionObserver] Notification parse error:', error);
    }
  });
}
