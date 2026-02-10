// Gateway types (HTTP-based OpenClaw integration)

export type GatewayEnvelope = {
  ok: boolean;
  result: { content: { type: string; text: string }[]; details?: unknown };
  error?: { message: string };
};

export type GatewayMessagePart = {
  type: 'text' | 'toolCall';
  text?: string;
  name?: string;
  arguments?: string;
};

export type GatewaySession = {
  key: string;
  sessionId: string;
  kind?: string;
  channel?: string;
  displayName?: string;
  label?: string;
  model?: string;
  totalTokens?: number;
  contextTokens?: number;
  updatedAt: number;
  transcriptPath?: string;
  abortedLastRun?: boolean;
};

export type GatewayHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | GatewayMessagePart[];
  timestamp?: number;
};

export type GatewayCronJob = {
  id: string;
  label: string;
  schedule: { kind: string; expr: string; tz?: string };
  enabled: boolean;
  created_at: number;
  next_run?: number;
};

export type GatewayCronRun = {
  id: string;
  job_id: string;
  started_at: number;
  completed_at?: number;
  status: string;
  output?: string;
};

export type GatewaySubAgent = {
  key: string;
  label: string;
  model?: string;
  token_count?: number;
  updated_at?: number;
  task?: string;
};

export type GatewaySessionStatus = {
  agent_name?: string;
  version?: string | null;
  model?: string | null;
  context_usage?: { used: number; total: number; percent: number } | null;
  runtime_mode?: string | null;
  session_key?: string | null;
  raw?: string;
};

export type GatewayMemoryResult = {
  content: string;
  session?: string;
};

export type GatewaySearchResults = {
  memories: GatewayMemoryResult[];
  files: { path: string; line: string; context?: string }[];
  sessions: GatewaySession[];
  cron_jobs: GatewayCronJob[];
};

// Usage/cost tracking types

export type UsageSessionSummary = {
  key: string;
  displayName: string;
  model: string;
  totalTokens: number;
  contextTokens: number;
  cost: number;
  updatedAt: number;
};

export type UsageModelBreakdown = {
  tokens: number;
  sessions: number;
  cost: number;
};

export type GatewayUsageResponse = {
  totalTokens: number;
  totalCost: number;
  sessions: UsageSessionSummary[];
  models: Record<string, UsageModelBreakdown>;
  context: { used: number; total: number; percent: number } | null;
};
