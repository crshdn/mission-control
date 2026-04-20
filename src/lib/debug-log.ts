import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';

/**
 * Debug console — opt-in verbose capture of everything that travels
 * between Mission Control and an agent. Operator toggles collection via
 * `/debug` UI or `POST /api/debug/settings`. Off by default; stored rows
 * grow indefinitely until explicitly cleared.
 *
 * Current instrumented surfaces:
 *   - dispatch/route.ts chat.send (outbound)
 *
 * Future expansions (stubs already reserved via `event_type`):
 *   - inbound POST /activities, /deliverables, PATCH /tasks, /fail
 *   - openclaw session lifecycle + chat response polling
 *   - gateway catalog sync + health cycle
 */

export type DebugEventType =
  // Outbound (MC → agent/gateway)
  | 'chat.send'
  | 'session.create'
  | 'session.end'
  | 'gateway.list_agents'
  | 'gateway.rpc'
  | 'gateway.health_ping'
  // Inbound (agent/gateway → MC)
  | 'chat.response'
  | 'agent.event'
  | 'agent.activity_post'
  | 'agent.deliverable_post'
  | 'agent.status_patch'
  | 'agent.fail_post'
  // WebSocket lifecycle (internal)
  | 'ws.connect'
  | 'ws.authenticated'
  | 'ws.disconnect'
  | 'ws.error'
  | 'ws.reconnect'
  // Scheduler / detectors (internal)
  | 'stall.flagged'
  | 'stall.cleared'
  // Diagnostic flow (internal)
  | 'diagnostic.step';

export type DebugEventDirection = 'outbound' | 'inbound' | 'internal';

export interface DebugEvent {
  id: string;
  created_at: string;
  event_type: DebugEventType;
  direction: DebugEventDirection;
  task_id: string | null;
  agent_id: string | null;
  session_key: string | null;
  duration_ms: number | null;
  request_body: string | null;
  response_body: string | null;
  error: string | null;
  metadata: string | null;
}

interface LogInput {
  type: DebugEventType;
  direction: DebugEventDirection;
  taskId?: string | null;
  agentId?: string | null;
  sessionKey?: string | null;
  durationMs?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string | null;
  metadata?: Record<string, unknown>;
}

function stringifyBody(body: unknown): string | null {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

/**
 * Check whether debug collection is currently enabled. Reads the single
 * `debug_config` row; cached in-process for 2 seconds so `isEnabled()`
 * calls at hot sites (per-dispatch) don't hammer SQLite.
 */
let cachedEnabled: { value: boolean; expires: number } | null = null;

export function isDebugCollectionEnabled(): boolean {
  const now = Date.now();
  if (cachedEnabled && cachedEnabled.expires > now) return cachedEnabled.value;

  const row = queryOne<{ collection_enabled: number }>(
    'SELECT collection_enabled FROM debug_config WHERE id = 1'
  );
  const value = Boolean(row?.collection_enabled);
  cachedEnabled = { value, expires: now + 2000 };
  return value;
}

export function setDebugCollectionEnabled(enabled: boolean): void {
  run(
    `UPDATE debug_config SET collection_enabled = ?, updated_at = ? WHERE id = 1`,
    [enabled ? 1 : 0, new Date().toISOString()]
  );
  cachedEnabled = { value: enabled, expires: Date.now() + 2000 };
}

export function clearDebugEvents(): number {
  const before = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM debug_events')?.cnt ?? 0;
  run('DELETE FROM debug_events');
  return before;
}

/**
 * Append a debug event. No-op when collection is disabled. Call sites can
 * invoke this unconditionally — the gate is enforced here so instrumentation
 * code stays clean.
 */
export function logDebugEvent(input: LogInput): void {
  if (!isDebugCollectionEnabled()) return;

  const id = uuidv4();
  const now = new Date().toISOString();
  const row = {
    id,
    created_at: now,
    event_type: input.type,
    direction: input.direction,
    task_id: input.taskId ?? null,
    agent_id: input.agentId ?? null,
    session_key: input.sessionKey ?? null,
    duration_ms: input.durationMs ?? null,
    request_body: stringifyBody(input.requestBody),
    response_body: stringifyBody(input.responseBody),
    error: input.error ?? null,
    metadata: input.metadata ? stringifyBody(input.metadata) : null,
  };

  try {
    run(
      `INSERT INTO debug_events
         (id, created_at, event_type, direction, task_id, agent_id, session_key, duration_ms, request_body, response_body, error, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.created_at, row.event_type, row.direction, row.task_id, row.agent_id, row.session_key, row.duration_ms, row.request_body, row.response_body, row.error, row.metadata]
    );

    // Broadcast for live tail in /debug UI. We emit a generic
    // autopilot_activity-style payload rather than adding a typed
    // Payload — SSEEvent.payload permits Record<string, unknown>.
    broadcast({ type: 'debug_event_logged', payload: row as unknown as Record<string, unknown> });
  } catch (err) {
    // Logging must never break the thing it observes. If the INSERT fails,
    // record it to stderr and carry on. The caller's dispatch/PATCH/etc
    // continues unaffected.
    console.error('[DebugLog] insert failed:', err);
  }
}

export interface DebugEventFilter {
  taskId?: string;
  agentId?: string;
  eventType?: DebugEventType;
  direction?: DebugEventDirection;
  afterId?: string; // for live tail cursor
  limit?: number;
}

export function getDebugEvents(filter: DebugEventFilter = {}): DebugEvent[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.taskId) {
    clauses.push('task_id = ?');
    params.push(filter.taskId);
  }
  if (filter.agentId) {
    clauses.push('agent_id = ?');
    params.push(filter.agentId);
  }
  if (filter.eventType) {
    clauses.push('event_type = ?');
    params.push(filter.eventType);
  }
  if (filter.direction) {
    clauses.push('direction = ?');
    params.push(filter.direction);
  }
  if (filter.afterId) {
    // `afterId` is a cursor — rows with created_at > the created_at of afterId.
    // Used by the UI's live-tail to fetch only new rows on reconnect.
    const cursor = queryOne<{ created_at: string }>(
      'SELECT created_at FROM debug_events WHERE id = ?',
      [filter.afterId]
    );
    if (cursor) {
      clauses.push('created_at > ?');
      params.push(cursor.created_at);
    }
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(filter.limit ?? 200, 1000));

  return queryAll<DebugEvent>(
    `SELECT * FROM debug_events ${where} ORDER BY created_at DESC LIMIT ?`,
    [...params, limit]
  );
}

export function getDebugEventCount(): number {
  return queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM debug_events')?.cnt ?? 0;
}
