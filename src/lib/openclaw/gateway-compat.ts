function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = nonEmptyString(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function workspaceBasename(workspace: unknown): string | undefined {
  const path = nonEmptyString(workspace);
  if (!path) {
    return undefined;
  }

  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1];
}

export interface NormalizedGatewayAgent {
  id: string;
  name: string;
  label?: string;
  model?: string;
  channel?: string;
  status?: string;
}

export function normalizeGatewayModel(model: unknown): string | undefined {
  const direct = nonEmptyString(model);
  if (direct) {
    return direct;
  }

  if (Array.isArray(model)) {
    for (const entry of model) {
      const normalized = normalizeGatewayModel(entry);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  const record = asRecord(model);
  if (!record) {
    return undefined;
  }

  const provider = firstString(record.provider);
  const id = firstString(record.id);
  const providerId = provider && id ? `${provider}/${id}` : undefined;

  return (
    normalizeGatewayModel(record.primary) ||
    normalizeGatewayModel(record.model) ||
    providerId ||
    normalizeGatewayModel(record.name) ||
    normalizeGatewayModel(record.fallbacks)
  );
}

export function extractGatewayAgents(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }

  const record = asRecord(result);
  if (!record) {
    return [];
  }

  const directAgents = record.agents;
  if (Array.isArray(directAgents)) {
    return directAgents;
  }

  const items = record.items;
  if (Array.isArray(items)) {
    return items;
  }

  const nestedResult = asRecord(record.result);
  if (nestedResult?.agents && Array.isArray(nestedResult.agents)) {
    return nestedResult.agents;
  }

  return [];
}

export function extractGatewaySessions(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }

  const record = asRecord(result);
  if (!record) {
    return [];
  }

  const directSessions = record.sessions;
  if (Array.isArray(directSessions)) {
    return directSessions;
  }

  const items = record.items;
  if (Array.isArray(items)) {
    return items;
  }

  const nestedResult = asRecord(record.result);
  if (nestedResult?.sessions && Array.isArray(nestedResult.sessions)) {
    return nestedResult.sessions;
  }

  return [];
}

export function normalizeGatewayAgent(agent: unknown): NormalizedGatewayAgent | null {
  const record = asRecord(agent);
  if (!record) {
    return null;
  }

  const workspaceName = workspaceBasename(record.workspace);
  const id = firstString(record.id, record.agentId, record.key, record.name, workspaceName);
  const label = firstString(record.label);
  const name = firstString(record.name, label, record.id, record.agentId, workspaceName);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    label,
    model: normalizeGatewayModel(record.model),
    channel: firstString(record.channel),
    status: firstString(record.status),
  };
}
