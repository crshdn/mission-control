/**
 * Heartbeat Monitor — 30s loop
 * Checks OpenClaw sessions, detects stale agents, updates health records.
 */

import { queryAll, queryOne, run } from '../lib/db';
import { getOpenClawClient } from '../lib/openclaw/client';
import { log } from './logger';
import { updateHealth, getStaleAgents } from './health';
import { broadcastEvent } from './bridge';
import type { Agent, OpenClawSessionInfo } from '../lib/types';

export async function runHeartbeat(): Promise<void> {
  const client = getOpenClawClient();

  if (!client.isConnected()) {
    log.warn('OpenClaw Gateway not connected, skipping heartbeat');
    return;
  }

  let liveSessions: OpenClawSessionInfo[];
  try {
    liveSessions = await client.listSessions();
  } catch (err) {
    log.warn(`Failed to list sessions: ${err instanceof Error ? err.message : 'Unknown'}`);
    return;
  }

  const liveSessionIds = new Set(liveSessions.map(s => s.id));

  // Check all working agents
  const workingAgents = queryAll<Agent & { openclaw_session_id?: string }>(
    `SELECT a.*, os.openclaw_session_id
     FROM agents a
     LEFT JOIN openclaw_sessions os ON os.agent_id = a.id AND os.status = 'active'
     WHERE a.status = 'working'`
  );

  for (const agent of workingAgents) {
    if (!agent.openclaw_session_id) {
      updateHealth(agent.id, false);
      continue;
    }

    const alive = liveSessionIds.has(agent.openclaw_session_id);
    updateHealth(agent.id, alive);
  }

  // Detect stale agents and mark standby
  const staleAgents = getStaleAgents();
  for (const stale of staleAgents) {
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [stale.agent_id]
    );
    if (!agent) continue;

    log.warn(`Agent ${agent.name} stale (${stale.consecutive_failures} failures), setting standby`);

    const now = new Date().toISOString();
    run(
      'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
      ['standby', now, agent.id]
    );

    run(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), 'agent_status_changed', agent.id, `${agent.name} marked standby (heartbeat stale)`, now]
    );

    const updatedAgent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [agent.id]);
    if (updatedAgent) {
      await broadcastEvent({ type: 'agent_updated', payload: updatedAgent });
    }
  }

  log.debug(`Heartbeat: ${workingAgents.length} working, ${staleAgents.length} stale`);
}
