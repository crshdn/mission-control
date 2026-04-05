import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getTaskOpenClawSessionId } from './session-routing';
import type { Agent, OpenClawSession } from '@/lib/types';

type SessionDb = Pick<Database.Database, 'prepare'>;
type SessionAgent = Pick<Agent, 'id' | 'name' | 'gateway_agent_id'>;

export function findActiveTaskSession(
  db: SessionDb,
  agentId: string,
  taskId: string
): OpenClawSession | null {
  return (
    (db
      .prepare('SELECT * FROM openclaw_sessions WHERE agent_id = ? AND task_id = ? AND status = ?')
      .get(agentId, taskId, 'active') as OpenClawSession | undefined) || null
  );
}

export function ensureTaskSession(
  db: SessionDb,
  agent: SessionAgent,
  taskId: string,
  now = new Date().toISOString()
): OpenClawSession {
  const existing = findActiveTaskSession(db, agent.id, taskId);
  if (existing) {
    return existing;
  }

  const sessionId = uuidv4();
  const openclawSessionId = getTaskOpenClawSessionId(agent, taskId);

  db.prepare(
    `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, task_id, channel, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, agent.id, openclawSessionId, taskId, 'mission-control', 'active', now, now);

  const session = db.prepare('SELECT * FROM openclaw_sessions WHERE id = ?').get(sessionId) as OpenClawSession | undefined;
  if (!session) {
    throw new Error(`Failed to create OpenClaw session for task ${taskId}`);
  }

  return session;
}

export function endTaskSession(
  db: SessionDb,
  agentId: string,
  taskId: string,
  now = new Date().toISOString()
): void {
  db.prepare(
    `UPDATE openclaw_sessions
     SET status = 'ended', ended_at = ?, updated_at = ?
     WHERE agent_id = ? AND task_id = ? AND status = 'active'`
  ).run(now, now, agentId, taskId);
}