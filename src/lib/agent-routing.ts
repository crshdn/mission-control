import type { Agent } from '@/lib/types';

const LEGACY_MAIN_PREFIX = 'agent:main:';

export function normalizeSessionKeyPrefix(prefix: string | null | undefined): string | null {
  const trimmed = prefix?.trim();
  if (!trimmed) return null;
  return trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
}

export function routePrefixForGatewayAgent(gatewayAgentId: string): string {
  return `agent:${gatewayAgentId}:`;
}

export function resolveAgentSessionKeyPrefix(
  agent: Pick<Agent, 'name' | 'gateway_agent_id' | 'session_key_prefix'>,
): string {
  const explicitPrefix = normalizeSessionKeyPrefix(agent.session_key_prefix);
  if (explicitPrefix === LEGACY_MAIN_PREFIX) {
    throw new Error(
      `Agent "${agent.name}" is configured with removed OpenClaw route ${LEGACY_MAIN_PREFIX}. ` +
      'Configure a live gateway agent route before dispatch.'
    );
  }

  if (explicitPrefix) return explicitPrefix;
  if (agent.gateway_agent_id) return routePrefixForGatewayAgent(agent.gateway_agent_id);

  throw new Error(
    `Agent "${agent.name}" has no OpenClaw route. Configure gateway_agent_id or session_key_prefix before dispatch.`
  );
}
