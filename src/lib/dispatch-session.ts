import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import type { OpenClawSession } from '@/lib/types';

export interface EnsureTaskSessionLinkOptions {
  agentId: string;
  agentName: string;
  taskId: string;
  now?: string;
}

export interface EnsureTaskSessionLinkResult {
  session: OpenClawSession;
  created: boolean;
  relinked: boolean;
}

export function ensureTaskSessionLink(
  options: EnsureTaskSessionLinkOptions,
): EnsureTaskSessionLinkResult {
  const now = options.now || new Date().toISOString();
  let created = false;
  let relinked = false;

  let session = queryOne<OpenClawSession>(
    'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
    [options.agentId, 'active'],
  );

  if (session && session.task_id !== options.taskId) {
    run(
      'UPDATE openclaw_sessions SET task_id = ?, updated_at = ? WHERE id = ?',
      [options.taskId, now, session.id],
    );
    relinked = true;
    session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE id = ?',
      [session.id],
    );
  }

  if (!session) {
    const sessionId = uuidv4();
    const openclawSessionId = `mission-control-${options.agentName.toLowerCase().replace(/\s+/g, '-')}`;

    run(
      `INSERT INTO openclaw_sessions (id, agent_id, task_id, openclaw_session_id, channel, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, options.agentId, options.taskId, openclawSessionId, 'mission-control', 'active', now, now],
    );

    session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE id = ?',
      [sessionId],
    );
    created = true;
  }

  if (!session) {
    throw new Error(`Failed to ensure active session for agent ${options.agentId}`);
  }

  return { session, created, relinked };
}
