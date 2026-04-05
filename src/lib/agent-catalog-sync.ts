import { logger } from '@/lib/logger';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { normalizeGatewayAgent } from '@/lib/openclaw/gateway-compat';
import { getDefaultSessionKeyPrefix } from '@/lib/openclaw/session-routing';

const SYNC_INTERVAL_MS = Number(process.env.AGENT_CATALOG_SYNC_INTERVAL_MS || 60_000);
let lastSyncAt = 0;
let syncing: Promise<number> | null = null;

function normalizeRole(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('learn')) return 'learner';
  if (n.includes('test')) return 'tester';
  if (n.includes('review') || n.includes('verif')) return 'reviewer';
  if (n.includes('fix')) return 'fixer';
  if (n.includes('senior')) return 'senior';
  if (n.includes('plan') || n.includes('orch')) return 'orchestrator';
  return 'builder';
}

export async function syncGatewayAgentsToCatalog(options?: { force?: boolean; reason?: string }): Promise<number> {
  const force = Boolean(options?.force);
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_INTERVAL_MS) {
    return 0;
  }

  if (syncing) return syncing;

  syncing = (async () => {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    const gatewayAgents = (await client.listAgents())
      .map((agent) => normalizeGatewayAgent(agent))
      .filter((agent): agent is NonNullable<typeof agent> => agent !== null);
    const existing = queryAll<{ id: string; gateway_agent_id: string | null }>(
      `SELECT id, gateway_agent_id FROM agents WHERE gateway_agent_id IS NOT NULL`
    );
    const existingByGatewayId = new Map(existing.map((a) => [a.gateway_agent_id, a.id]));

    let changed = 0;
    const ts = new Date().toISOString();

    transaction(() => {
      for (const ga of gatewayAgents) {
        const gatewayId = ga.id;
        const name = ga.name;
        const role = normalizeRole(name);
        const existingId = existingByGatewayId.get(gatewayId) || null;
        const defaultSessionKeyPrefix = getDefaultSessionKeyPrefix({ gateway_agent_id: gatewayId });

        if (existingId) {
          run(
            `UPDATE agents
             SET name = ?, role = ?, model = COALESCE(?, model), source = 'gateway',
                 session_key_prefix = COALESCE(session_key_prefix, ?), updated_at = ?
             WHERE id = ?`,
            [name, role, ga.model || null, defaultSessionKeyPrefix, ts, existingId]
          );
        } else {
          run(
            `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, model, source, gateway_agent_id, session_key_prefix, created_at, updated_at)
             VALUES (lower(hex(randomblob(16))), ?, ?, ?, '🔗', 0, 'default', ?, 'gateway', ?, ?, ?, ?)`,
            [name, role, `Auto-synced from OpenClaw (${gatewayId})`, ga.model || null, gatewayId, defaultSessionKeyPrefix, ts, ts]
          );
        }
        changed += 1;
      }

      run(
        `INSERT INTO events (id, type, message, metadata, created_at)
         VALUES (lower(hex(randomblob(16))), 'system', ?, ?, ?)`,
        [
          `Agent catalog sync completed (${options?.reason || 'automatic'})`,
          JSON.stringify({ changed, reason: options?.reason || 'automatic' }),
          ts,
        ]
      );
    });

    lastSyncAt = Date.now();
    return changed;
  })();

  try {
    return await syncing;
  } finally {
    syncing = null;
  }
}

export function ensureCatalogSyncScheduled(): void {
  if (process.env.NODE_ENV === 'test') return;
  const g = globalThis as unknown as { __mcAgentCatalogTimer?: NodeJS.Timeout };
  if (g.__mcAgentCatalogTimer) return;
  g.__mcAgentCatalogTimer = setInterval(() => {
    syncGatewayAgentsToCatalog({ reason: 'scheduled' }).catch((err) => {
      logger.error('[AgentCatalog] scheduled sync failed:', err);
    });
  }, SYNC_INTERVAL_MS);
  syncGatewayAgentsToCatalog({ reason: 'startup' }).catch((err) => {
    logger.error('[AgentCatalog] startup sync failed:', err);
  });
}

export function getAgentByPreferredRoles(taskId: string, preferredRoles: string[]): { id: string; name: string } | null {
  for (const role of preferredRoles) {
    const byTaskRole = queryOne<{ id: string; name: string }>(
      `SELECT a.id, a.name
       FROM task_roles tr
       JOIN agents a ON a.id = tr.agent_id
       WHERE tr.task_id = ? AND tr.role = ? AND a.status != 'offline'
       LIMIT 1`,
      [taskId, role]
    );
    if (byTaskRole) return byTaskRole;

    const byGlobalRole = queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM agents WHERE role = ? AND status != 'offline' ORDER BY updated_at DESC LIMIT 1`,
      [role]
    );
    if (byGlobalRole) return byGlobalRole;
  }
  return null;
}
