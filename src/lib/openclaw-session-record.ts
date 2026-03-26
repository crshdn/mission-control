import { queryOne } from '@/lib/db';

export type OpenClawSessionRecord = {
  id: string;
  agent_id: string | null;
  task_id: string | null;
  openclaw_session_id: string;
  status: string;
  session_type: string | null;
  channel: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export function resolveOpenClawSessionRecord(sessionRef: string): OpenClawSessionRecord | undefined {
  const exactById = queryOne<OpenClawSessionRecord>(
    'SELECT * FROM openclaw_sessions WHERE id = ? LIMIT 1',
    [sessionRef],
  );

  if (exactById) {
    return exactById;
  }

  return queryOne<OpenClawSessionRecord>(
    `SELECT *
     FROM openclaw_sessions
     WHERE openclaw_session_id = ?
     ORDER BY
       CASE WHEN status = 'active' THEN 0 ELSE 1 END,
       datetime(created_at) DESC,
       datetime(updated_at) DESC
     LIMIT 1`,
    [sessionRef],
  );
}
