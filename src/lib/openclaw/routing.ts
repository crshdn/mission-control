import type { Agent } from '@/lib/types';

const DEFAULT_MASTER_SESSION_PREFIX = 'agent:main:';

export interface SessionRoutingOptions {
  context?: string;
  allowMasterFallback?: boolean;
  defaultMasterPrefix?: string;
}

type RoutableAgent = Pick<Agent, 'id' | 'name' | 'is_master' | 'session_key_prefix'>;

export function normalizeSessionKeyPrefix(prefix?: string | null): string | null {
  const trimmed = prefix?.trim();
  if (!trimmed) return null;
  return trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
}

export function resolveAgentSessionKeyPrefix(
  agent: RoutableAgent,
  options: SessionRoutingOptions = {},
): string {
  const normalized = normalizeSessionKeyPrefix(agent.session_key_prefix);
  if (normalized) return normalized;

  const {
    context = 'routing',
    allowMasterFallback = true,
    defaultMasterPrefix = DEFAULT_MASTER_SESSION_PREFIX,
  } = options;

  if (agent.is_master && allowMasterFallback) {
    return defaultMasterPrefix;
  }

  throw new Error(
    `[${context}] Agent "${agent.name}" (${agent.id}) has no session_key_prefix. ` +
      'Trusted non-master agents must have explicit OpenClaw routing.',
  );
}

export function buildAgentSessionKey(
  agent: RoutableAgent,
  openclawSessionId: string,
  options: SessionRoutingOptions = {},
): string {
  return `${resolveAgentSessionKeyPrefix(agent, options)}${openclawSessionId}`;
}
