type AgentRoutingShape = {
  name?: string | null;
  source?: string | null;
  gateway_agent_id?: string | null;
  session_key_prefix?: string | null;
};

const DEFAULT_SESSION_KEY_PREFIX = 'agent:main:';

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureTrailingColon(value: string): string {
  return value.endsWith(':') ? value : `${value}:`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getDefaultSessionKeyPrefix(agent: AgentRoutingShape | null | undefined): string {
  const explicit = nonEmpty(agent?.session_key_prefix);
  if (explicit) {
    return ensureTrailingColon(explicit);
  }

  const gatewayAgentId = nonEmpty(agent?.gateway_agent_id);
  if (gatewayAgentId) {
    return `agent:${gatewayAgentId}:`;
  }

  return DEFAULT_SESSION_KEY_PREFIX;
}

export function getDefaultOpenClawSessionId(agent: AgentRoutingShape | null | undefined): string {
  const gatewayAgentId = nonEmpty(agent?.gateway_agent_id);
  if (gatewayAgentId) {
    return 'main';
  }

  const name = nonEmpty(agent?.name);
  if (name) {
    return `mission-control-${slugify(name)}`;
  }

  return 'main';
}

export function getTaskOpenClawSessionId(
  agent: AgentRoutingShape | null | undefined,
  taskId: string
): string {
  const normalizedTaskId = slugify(taskId);
  if (!normalizedTaskId) {
    return getDefaultOpenClawSessionId(agent);
  }

  const gatewayAgentId = nonEmpty(agent?.gateway_agent_id);
  if (gatewayAgentId) {
    return `task:${normalizedTaskId}`;
  }

  const name = nonEmpty(agent?.name);
  if (name) {
    return `mission-control-${slugify(name)}-${normalizedTaskId}`;
  }

  return `task-${normalizedTaskId}`;
}

export function normalizeOpenClawSessionId(
  agent: AgentRoutingShape | null | undefined,
  sessionId?: string | null
): string {
  const trimmed = nonEmpty(sessionId);
  const gatewayAgentId = nonEmpty(agent?.gateway_agent_id);

  if (gatewayAgentId) {
    if (!trimmed || trimmed.startsWith('mission-control-')) {
      return 'main';
    }
    return trimmed;
  }

  return trimmed || getDefaultOpenClawSessionId(agent);
}

export function buildOpenClawSessionKey(
  agent: AgentRoutingShape | null | undefined,
  sessionId?: string | null
): string {
  return `${getDefaultSessionKeyPrefix(agent)}${normalizeOpenClawSessionId(agent, sessionId)}`;
}
