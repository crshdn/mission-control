import type Database from 'better-sqlite3';
import type { OpenClawSession, Task } from '@/lib/types';

type CompletionDb = Pick<Database.Database, 'prepare'>;

export function findTaskForSessionCompletion(
  db: CompletionDb,
  session: Pick<OpenClawSession, 'agent_id' | 'task_id'>
): (Task & { assigned_agent_name?: string }) | null {
  if (session.task_id) {
    const task = db.prepare(
      `SELECT t.*, a.name as assigned_agent_name
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ? AND t.assigned_agent_id = ?
       LIMIT 1`
    ).get(session.task_id, session.agent_id) as (Task & { assigned_agent_name?: string }) | undefined;

    if (task) {
      return task;
    }
  }

  return (
    (db.prepare(
      `SELECT t.*, a.name as assigned_agent_name
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.assigned_agent_id = ?
         AND t.status IN ('assigned', 'in_progress')
       ORDER BY t.updated_at DESC
       LIMIT 1`
    ).get(session.agent_id) as (Task & { assigned_agent_name?: string }) | undefined) || null
  );
}