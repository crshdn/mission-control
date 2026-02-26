/**
 * Agent Health Tracker
 * Manages agent_heartbeats table: upsert, stale detection, initialization.
 */

import { queryAll, queryOne, run } from '../lib/db';
import { log } from './logger';
import type { AgentHealthRecord } from './types';

export function initializeHeartbeats(): void {
  const agents = queryAll<{ id: string; name: string; status: string }>(
    "SELECT id, name, status FROM agents WHERE status != 'offline'"
  );

  const now = new Date().toISOString();
  for (const agent of agents) {
    const existing = queryOne<AgentHealthRecord>(
      'SELECT * FROM agent_heartbeats WHERE agent_id = ?',
      [agent.id]
    );

    if (!existing) {
      run(
        `INSERT INTO agent_heartbeats (agent_id, last_seen, session_alive, consecutive_failures, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [agent.id, now, agent.status === 'working' ? 1 : 0, 0, now]
      );
    }
  }

  log.info(`Heartbeats initialized for ${agents.length} agents`);
}

export function updateHealth(agentId: string, alive: boolean): void {
  const now = new Date().toISOString();

  if (alive) {
    run(
      `INSERT INTO agent_heartbeats (agent_id, last_seen, session_alive, consecutive_failures, updated_at)
       VALUES (?, ?, 1, 0, ?)
       ON CONFLICT(agent_id) DO UPDATE SET
         last_seen = ?,
         session_alive = 1,
         consecutive_failures = 0,
         updated_at = ?`,
      [agentId, now, now, now, now]
    );
  } else {
    run(
      `INSERT INTO agent_heartbeats (agent_id, last_seen, session_alive, consecutive_failures, updated_at)
       VALUES (?, ?, 0, 1, ?)
       ON CONFLICT(agent_id) DO UPDATE SET
         session_alive = 0,
         consecutive_failures = consecutive_failures + 1,
         updated_at = ?`,
      [agentId, now, now, now]
    );
  }
}

export function getStaleAgents(thresholdMs: number = 300000): AgentHealthRecord[] {
  const threshold = new Date(Date.now() - thresholdMs).toISOString();

  return queryAll<AgentHealthRecord>(
    `SELECT h.* FROM agent_heartbeats h
     JOIN agents a ON h.agent_id = a.id
     WHERE h.last_seen < ? AND h.consecutive_failures >= 10 AND a.status = 'working'`,
    [threshold]
  );
}
