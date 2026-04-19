/**
 * Agent roster + role-to-agent resolution used by the convoy planner and the
 * planning-session completion handler.
 *
 * Background: the convoy planner and the task-planning LLM both historically
 * invented new agents every run, which produced "ghost" agents — rows with no
 * gateway_agent_id and no session_key_prefix that received task assignments
 * but dispatched nowhere. This module gives callers a single place to look up
 * existing gateway-linked agents and a single policy for reuse-vs-create.
 */
import { queryAll, queryOne } from '@/lib/db';

export interface RosterAgent {
  id: string;
  name: string;
  role: string;
  description: string | null;
  status: string;
  session_key_prefix: string | null;
  gateway_agent_id: string | null;
  is_master: number;
  workspace_id: string;
}

/** Policy caps shared by planning + convoy flows. Keep small and explicit. */
export const MAX_CONVOY_SUBTASKS = parseInt(process.env.MAX_CONVOY_SUBTASKS || '6', 10);
export const MAX_TASKS_PER_AGENT = parseInt(process.env.MAX_TASKS_PER_AGENT || '2', 10);
export const MIN_NEW_AGENT_RATIONALE_LENGTH = 20;

/**
 * Return all agents that are eligible to be assigned work in this workspace.
 * Prefers gateway-linked agents (ones that actually map to a live OpenClaw
 * session) but also includes local agents that carry a session_key_prefix —
 * those still route correctly. Agents with neither are "ghosts" and are
 * filtered out.
 */
export function getAgentRoster(workspaceId: string): RosterAgent[] {
  return queryAll<RosterAgent>(
    `SELECT id, name, role, description, status, session_key_prefix, gateway_agent_id, is_master, workspace_id
     FROM agents
     WHERE workspace_id = ?
       AND (gateway_agent_id IS NOT NULL OR session_key_prefix IS NOT NULL)
       AND status != 'offline'
     ORDER BY is_master DESC, name ASC`,
    [workspaceId]
  );
}

/**
 * Format the roster as plain-text lines for injection into an LLM prompt.
 * Empty roster returns a short notice instead of an empty block, so the LLM
 * handles bootstrap workspaces gracefully ("no existing agents, create new").
 */
export function formatRosterForPrompt(roster: RosterAgent[]): string {
  if (roster.length === 0) {
    return 'No existing agents are provisioned for this workspace — create whichever roles are needed.';
  }
  return roster
    .map(a => {
      const linked = a.gateway_agent_id ? ' [gateway]' : '';
      const master = a.is_master ? ' [orchestrator]' : '';
      return `- id: ${a.id} | name: ${a.name} | role: ${a.role} | status: ${a.status}${linked}${master}`;
    })
    .join('\n');
}

/**
 * Look up an existing agent in the workspace whose role matches `role`,
 * preferring gateway-linked agents. Used by the planning-completion handler
 * to avoid inserting a duplicate when the LLM proposes an agent for a role
 * that's already staffed.
 *
 * Matching is case-insensitive and also tolerates partial matches (e.g. the
 * LLM says "Tester" and the roster has role "tester" or "QA Tester"). Exact
 * matches win over partial matches.
 */
export function findAgentForRole(workspaceId: string, role: string): RosterAgent | null {
  if (!role) return null;
  const exact = queryOne<RosterAgent>(
    `SELECT id, name, role, description, status, session_key_prefix, gateway_agent_id, is_master, workspace_id
     FROM agents
     WHERE workspace_id = ?
       AND LOWER(role) = LOWER(?)
       AND (gateway_agent_id IS NOT NULL OR session_key_prefix IS NOT NULL)
       AND status != 'offline'
     ORDER BY gateway_agent_id IS NOT NULL DESC, status = 'standby' DESC, updated_at DESC
     LIMIT 1`,
    [workspaceId, role]
  );
  if (exact) return exact;

  return queryOne<RosterAgent>(
    `SELECT id, name, role, description, status, session_key_prefix, gateway_agent_id, is_master, workspace_id
     FROM agents
     WHERE workspace_id = ?
       AND (LOWER(role) LIKE '%' || LOWER(?) || '%' OR LOWER(?) LIKE '%' || LOWER(role) || '%')
       AND (gateway_agent_id IS NOT NULL OR session_key_prefix IS NOT NULL)
       AND status != 'offline'
     ORDER BY gateway_agent_id IS NOT NULL DESC, status = 'standby' DESC, updated_at DESC
     LIMIT 1`,
    [workspaceId, role, role]
  ) ?? null;
}

/**
 * Verify that `agentId` is a real agent in the given workspace. Guards against
 * LLM hallucinations where the planner returns an agent id that doesn't exist.
 */
export function verifyAgentInWorkspace(workspaceId: string, agentId: string): RosterAgent | null {
  return queryOne<RosterAgent>(
    `SELECT id, name, role, description, status, session_key_prefix, gateway_agent_id, is_master, workspace_id
     FROM agents WHERE id = ? AND workspace_id = ? LIMIT 1`,
    [agentId, workspaceId]
  ) ?? null;
}
