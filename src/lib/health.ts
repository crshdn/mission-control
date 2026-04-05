/**
 * Health check module for Mission Control.
 *
 * Provides summary (unauthenticated) and detailed (authenticated)
 * system health information for monitoring integrations.
 */

import { getDb, queryOne, queryAll } from '@/lib/db';
import { getAllAgentHealth } from '@/lib/agent-health';
import { listCostCaps } from '@/lib/costs/caps';
import { getOpenClawClient } from '@/lib/openclaw/client';
import fs from 'fs';
import path from 'path';

// Track process start time at module level for uptime calculation
const startedAt = Date.now();

/** Read version from package.json once at module load */
function getVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

const version = getVersion();

// ---------- Types ----------

export interface HealthSummary {
  status: 'ok' | 'error';
  uptime_seconds: number;
  version: string;
}

export interface DbHealth {
  status: 'ok' | 'error';
  writable: boolean;
  schema_version: number;
  size_bytes: number;
  error?: string;
}

export interface GatewayHealth {
  status: 'ok' | 'error' | 'unconfigured';
  connected: boolean;
  error?: string;
}

export interface AgentsHealth {
  status: 'ok' | 'error';
  active_count: number;
  total_count: number;
  by_state: Record<string, number>;
}

export interface QueueHealth {
  status: 'ok' | 'error';
  assigned: number;
  in_progress: number;
  total_pending: number;
  by_status: Record<string, number>;
}

export interface ResearchProductHealth {
  product_id: string;
  current_phase: string | null;
  last_cycle_at: string | null;
  status: string | null;
}

export interface ResearchHealth {
  status: 'ok' | 'error';
  products: ResearchProductHealth[];
}

export interface CostCapHealth {
  product_id: string | null;
  cap_type: string;
  limit_usd: number;
  current_spend_usd: number;
  utilization_pct: number;
  status: string;
}

export interface CostsHealth {
  status: 'ok' | 'error';
  caps: CostCapHealth[];
}

export interface HealthDetail extends HealthSummary {
  components: {
    db: DbHealth;
    gateway: GatewayHealth;
    agents: AgentsHealth;
    queue: QueueHealth;
    research: ResearchHealth;
    costs: CostsHealth;
  };
}

// ---------- Summary ----------

export function getHealthSummary(): HealthSummary {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  // Quick DB liveness check to set top-level status
  let status: 'ok' | 'error' = 'ok';
  try {
    const row = queryOne<{ v: number }>('SELECT 1 as v');
    if (!row || row.v !== 1) status = 'error';
  } catch {
    status = 'error';
  }
  return { status, uptime_seconds: uptimeSeconds, version };
}

// ---------- Component checks ----------

function checkDb(): DbHealth {
  try {
    // Quick integrity check (single page only — fast)
    const integrity = queryOne<{ integrity_check: string }>(
      'PRAGMA integrity_check(1)'
    );
    const integrityOk = integrity?.integrity_check === 'ok';

    // Schema version
    const sv = queryOne<{ user_version: number }>('PRAGMA user_version');
    const schemaVersion = sv?.user_version ?? 0;

    // Size in bytes
    const pc = queryOne<{ page_count: number }>('PRAGMA page_count');
    const ps = queryOne<{ page_size: number }>('PRAGMA page_size');
    const sizeBytes = (pc?.page_count ?? 0) * (ps?.page_size ?? 0);

    return {
      status: integrityOk ? 'ok' : 'error',
      writable: integrityOk,
      schema_version: schemaVersion,
      size_bytes: sizeBytes,
    };
  } catch (err) {
    return {
      status: 'error',
      writable: false,
      schema_version: 0,
      size_bytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkGateway(): GatewayHealth {
  try {
    const client = getOpenClawClient();
    const connected = client.isConnected();
    return { status: connected ? 'ok' : 'error', connected };
  } catch (err) {
    return {
      status: 'error',
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkAgents(): AgentsHealth {
  try {
    const total = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM agents'
    );
    const active = queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM agents WHERE status != 'offline'"
    );
    const totalCount = total?.cnt ?? 0;
    const activeCount = active?.cnt ?? 0;

    // Aggregate by health state from agent_health table
    const byState: Record<string, number> = {};
    try {
      const healthRecords = getAllAgentHealth();
      for (const h of healthRecords) {
        const state = h.health_state || 'unknown';
        byState[state] = (byState[state] || 0) + 1;
      }
    } catch {
      // agent_health table may not exist yet — non-fatal
    }

    return {
      status: 'ok',
      active_count: activeCount,
      total_count: totalCount,
      by_state: byState,
    };
  } catch (err) {
    return { status: 'error', active_count: 0, total_count: 0, by_state: {} };
  }
}

function checkQueue(): QueueHealth {
  try {
    const rows = queryAll<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM tasks
       WHERE status IN ('assigned', 'in_progress', 'queued', 'testing', 'verification')
       GROUP BY status`
    );
    const byStatus: Record<string, number> = {};
    let assigned = 0;
    let inProgress = 0;
    let totalPending = 0;
    for (const r of rows) {
      byStatus[r.status] = r.count;
      totalPending += r.count;
      if (r.status === 'assigned') assigned = r.count;
      if (r.status === 'in_progress') inProgress = r.count;
    }
    return {
      status: 'ok',
      assigned,
      in_progress: inProgress,
      total_pending: totalPending,
      by_status: byStatus,
    };
  } catch {
    return { status: 'error', assigned: 0, in_progress: 0, total_pending: 0, by_status: {} };
  }
}

function checkResearch(): ResearchHealth {
  try {
    const rows = queryAll<{
      product_id: string;
      current_phase: string | null;
      started_at: string | null;
      completed_at: string | null;
      status: string | null;
    }>(
      `SELECT rc.product_id, rc.current_phase, rc.started_at, rc.completed_at, rc.status
       FROM research_cycles rc
       INNER JOIN (SELECT product_id, MAX(started_at) as max_start FROM research_cycles GROUP BY product_id) latest
       ON rc.product_id = latest.product_id AND rc.started_at = latest.max_start`
    );
    const products: ResearchProductHealth[] = rows.map((r) => ({
      product_id: r.product_id,
      current_phase: r.current_phase,
      last_cycle_at: r.completed_at || r.started_at,
      status: r.status,
    }));
    return { status: 'ok', products };
  } catch {
    return { status: 'ok', products: [] };
  }
}

function checkCosts(): CostsHealth {
  try {
    const caps = listCostCaps();
    const mapped: CostCapHealth[] = caps.map((c) => ({
      product_id: c.product_id ?? null,
      cap_type: c.cap_type,
      limit_usd: c.limit_usd,
      current_spend_usd: c.current_spend_usd ?? 0,
      utilization_pct:
        c.limit_usd > 0
          ? Math.round(((c.current_spend_usd ?? 0) / c.limit_usd) * 10000) / 100
          : 0,
      status: c.status,
    }));
    return { status: 'ok', caps: mapped };
  } catch {
    return { status: 'ok', caps: [] };
  }
}

// ---------- Detail ----------

export function getHealthDetail(): HealthDetail {
  const summary = getHealthSummary();
  const db = checkDb();
  const gateway = checkGateway();
  const agents = checkAgents();
  const queue = checkQueue();
  const research = checkResearch();
  const costs = checkCosts();

  // Top-level status: error if any critical component is error
  const overallStatus =
    db.status === 'error' ? 'error' : summary.status;

  return {
    status: overallStatus,
    uptime_seconds: summary.uptime_seconds,
    version: summary.version,
    components: { db, gateway, agents, queue, research, costs },
  };
}

// ---------- Prometheus formatting ----------

export function formatPrometheus(detail: HealthDetail): string {
  const lines: string[] = [];

  const gauge = (name: string, help: string, value: number, labels?: Record<string, string>) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    if (labels && Object.keys(labels).length > 0) {
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
        .join(',');
      lines.push(`${name}{${labelStr}} ${value}`);
    } else {
      lines.push(`${name} ${value}`);
    }
  };

  // Top-level
  gauge('autensa_up', 'Whether the service is up (1) or down (0)', detail.status === 'ok' ? 1 : 0);
  gauge('autensa_uptime_seconds', 'Seconds since process start', detail.uptime_seconds);

  // DB
  gauge('autensa_db_ok', 'Database health (1=ok, 0=error)', detail.components.db.status === 'ok' ? 1 : 0);
  gauge('autensa_db_size_bytes', 'Database file size in bytes', detail.components.db.size_bytes);
  gauge('autensa_db_schema_version', 'Database schema version (user_version)', detail.components.db.schema_version);

  // Gateway
  gauge('autensa_gateway_connected', 'OpenClaw gateway connection (1=connected, 0=disconnected)', detail.components.gateway.connected ? 1 : 0);

  // Agents
  gauge('autensa_agents_active', 'Number of non-offline agents', detail.components.agents.active_count);
  gauge('autensa_agents_total', 'Total registered agents', detail.components.agents.total_count);

  // Queue
  gauge('autensa_queue_assigned', 'Tasks in assigned status', detail.components.queue.assigned);
  gauge('autensa_queue_in_progress', 'Tasks in in_progress status', detail.components.queue.in_progress);
  gauge('autensa_queue_total_pending', 'Total pending tasks (assigned+in_progress+queued+testing+verification)', detail.components.queue.total_pending);

  // Cost caps — one metric per cap with product_id label
  for (const cap of detail.components.costs.caps) {
    gauge(
      'autensa_cost_utilization_pct',
      'Cost cap utilization percentage',
      cap.utilization_pct,
      { product_id: cap.product_id ?? 'global', cap_type: cap.cap_type },
    );
  }

  // Research — per-product freshness (seconds since last cycle)
  for (const prod of detail.components.research.products) {
    if (prod.last_cycle_at) {
      const ageSec = Math.floor((Date.now() - new Date(prod.last_cycle_at).getTime()) / 1000);
      gauge(
        'autensa_research_last_cycle_age_seconds',
        'Seconds since last research cycle completed',
        ageSec,
        { product_id: prod.product_id },
      );
    }
  }

  return lines.join('\n') + '\n';
}
