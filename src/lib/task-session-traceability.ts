import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import type { OpenClawSession } from '@/lib/types';

export function ensureTaskSessionTraceability(
  session: OpenClawSession,
  agentId: string,
  taskId: string,
  now: string
): OpenClawSession {
  const existingTaskSession = queryOne<OpenClawSession>(
    `SELECT *
     FROM openclaw_sessions
     WHERE agent_id = ?
       AND task_id = ?
       AND openclaw_session_id = ?
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [agentId, taskId, session.openclaw_session_id]
  );

  if (existingTaskSession) {
    run(
      `UPDATE openclaw_sessions
       SET status = ?,
           channel = ?,
           session_type = ?,
           ended_at = NULL,
           updated_at = ?
       WHERE id = ?`,
      [
        'active',
        session.channel ?? 'mission-control',
        session.session_type ?? 'subagent',
        now,
        existingTaskSession.id,
      ]
    );

    return queryOne<OpenClawSession>('SELECT * FROM openclaw_sessions WHERE id = ?', [existingTaskSession.id]) ?? existingTaskSession;
  }

  const taskSessionId = uuidv4();
  run(
    `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, session_type, task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      taskSessionId,
      agentId,
      session.openclaw_session_id,
      session.channel ?? 'mission-control',
      'active',
      session.session_type ?? 'subagent',
      taskId,
      now,
      now,
    ]
  );

  return queryOne<OpenClawSession>('SELECT * FROM openclaw_sessions WHERE id = ?', [taskSessionId]) ?? {
    ...session,
    id: taskSessionId,
    agent_id: agentId,
    task_id: taskId,
    status: 'active',
    channel: session.channel ?? 'mission-control',
    session_type: session.session_type ?? 'subagent',
    ended_at: undefined,
    created_at: now,
    updated_at: now,
  };
}
