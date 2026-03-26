/**
 * Lightweight LLM completion via OpenClaw Gateway RPC.
 * Uses `agent` + `agent.wait` + `chat.history` so Mission Control works against
 * the default Gateway setup where optional OpenAI-compatible HTTP shims may be disabled.
 */

import { randomUUID } from 'crypto';
import JSON5 from 'json5';
import { getOpenClawClient } from '@/lib/openclaw/client';

const DEFAULT_AGENT_ID = process.env.AUTOPILOT_AGENT_ID?.trim() || 'worker';
const DEFAULT_MODEL = process.env.AUTOPILOT_MODEL?.trim() || null;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const DEFAULT_WAIT_SLICE_MS = 25_000; // below OpenClawClient.call()'s 30s timeout
const HISTORY_POLL_INTERVAL_MS = 750;
const HISTORY_POLL_ATTEMPTS = 5;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5_000;

export interface CompletionOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function addUsage(
  left: CompletionResult['usage'],
  right: CompletionResult['usage'],
): CompletionResult['usage'] {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function extractBalancedJsonCandidate(text: string): string | null {
  const startIndex = (() => {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');

    if (firstBrace === -1) return firstBracket === -1 ? -1 : firstBracket;
    if (firstBracket === -1) return firstBrace;
    return Math.min(firstBrace, firstBracket);
  })();

  if (startIndex === -1) return null;

  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let index = startIndex; index < text.length; index++) {
    const char = text[index];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '[';
      if (stack[stack.length - 1] !== expected) {
        return null;
      }

      stack.pop();
      if (stack.length === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function tryParseJsonCandidate<T>(
  raw: string,
  model: string,
  usage: CompletionResult['usage'],
): { ok: true; value: { data: T; raw: string; model: string; usage: CompletionResult['usage'] } } | { ok: false } {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const openFenceMatch = raw.match(/```(?:json)?\s*([\s\S]*)/);
  const balancedCandidate = extractBalancedJsonCandidate(raw);

  const candidates = [
    raw.trim(),
    ...(fencedMatch?.[1] ? [fencedMatch[1].trim()] : []),
    ...(openFenceMatch?.[1] ? [openFenceMatch[1].trim()] : []),
    ...(balancedCandidate ? [balancedCandidate] : []),
  ];

  for (const candidate of candidates) {
    try {
      return {
        ok: true,
        value: { data: JSON.parse(candidate) as T, raw, model, usage },
      };
    } catch {
      try {
        return {
          ok: true,
          value: { data: JSON5.parse(candidate) as T, raw, model, usage },
        };
      } catch {
        // Try the next extraction strategy.
      }
    }
  }

  return { ok: false };
}

async function repairJsonResponse(
  raw: string,
  options: CompletionOptions,
): Promise<CompletionResult> {
  return complete(
    [
      'Repair the following malformed JSON response.',
      'Rules:',
      '- Return valid JSON only.',
      '- Preserve the original data as closely as possible.',
      '- If the last item is truncated, drop only the incomplete fragment instead of inventing content.',
      '- Do not wrap the answer in markdown fences.',
      '',
      raw,
    ].join('\n'),
    {
      model: options.model,
      timeoutMs: Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000),
      systemPrompt: 'You repair malformed JSON into valid strict JSON. Output JSON only.',
    },
  );
}

interface AgentRunAccepted {
  runId?: string;
  status?: string;
}

interface AgentWaitResult {
  status?: 'accepted' | 'ok' | 'error' | 'timeout';
  error?: string;
}

interface ChatHistoryMessagePart {
  type?: string;
  text?: string;
}

interface ChatHistoryMessage {
  role?: string;
  content?: string | ChatHistoryMessagePart[];
}

interface SessionsUsageTotals {
  input?: number;
  output?: number;
  totalTokens?: number;
}

interface SessionsUsageEntry {
  model?: string;
  modelProvider?: string;
  usage?: SessionsUsageTotals;
}

interface SessionsUsageResult {
  sessions?: SessionsUsageEntry[];
}

function normalizeSessionKeyPrefix(prefix?: string | null): string {
  const trimmed = prefix?.trim();
  if (!trimmed) return `agent:${DEFAULT_AGENT_ID}:`;
  return trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
}

function getAutopilotSessionKey(): string {
  const prefix = normalizeSessionKeyPrefix(
    process.env.AUTOPILOT_SESSION_KEY_PREFIX || `agent:${DEFAULT_AGENT_ID}:`,
  );
  return `${prefix}mc-autopilot-${randomUUID()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTextFromMessage(message: ChatHistoryMessage | undefined): string {
  if (!message) return '';
  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  if (!Array.isArray(message.content)) return '';

  return message.content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text?.trim() || '')
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

async function waitForRunCompletion(
  runId: string,
  timeoutMs: number,
): Promise<void> {
  const client = getOpenClawClient();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    const waitSliceMs = Math.max(1, Math.min(DEFAULT_WAIT_SLICE_MS, remainingMs));

    const waitResult = await client.call<AgentWaitResult>('agent.wait', {
      runId,
      timeoutMs: waitSliceMs,
    });

    if (waitResult.status === 'ok') {
      return;
    }

    if (waitResult.status === 'error') {
      throw new Error(waitResult.error || `Gateway agent run ${runId} failed`);
    }

    if (waitResult.status !== 'timeout' && waitResult.status !== 'accepted') {
      throw new Error(`Gateway agent.wait returned unexpected status: ${waitResult.status ?? 'unknown'}`);
    }
  }

  throw new Error(`LLM completion timed out after ${timeoutMs}ms`);
}

async function fetchCompletionArtifacts(sessionKey: string): Promise<{
  content: string;
  model: string | null;
  usage: CompletionResult['usage'];
}> {
  const client = getOpenClawClient();
  let content = '';
  let resolvedModel: string | null = null;
  let usage: CompletionResult['usage'] = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  for (let attempt = 0; attempt < HISTORY_POLL_ATTEMPTS; attempt++) {
    const history = await client.call<{ messages?: ChatHistoryMessage[] }>('chat.history', {
      sessionKey,
      limit: 50,
    });

    const assistantMessages = Array.isArray(history.messages)
      ? history.messages.filter((message) => message.role === 'assistant')
      : [];

    const latestAssistant = [...assistantMessages].reverse().find((message) => extractTextFromMessage(message));
    if (latestAssistant) {
      content = extractTextFromMessage(latestAssistant);
    }

    const usageResult = await client.call<SessionsUsageResult>('sessions.usage', {
      key: sessionKey,
      limit: 1,
    });

    const sessionUsage = usageResult.sessions?.[0];
    const totals = sessionUsage?.usage;
    if (sessionUsage?.model) {
      resolvedModel = sessionUsage.modelProvider
        ? `${sessionUsage.modelProvider}/${sessionUsage.model}`
        : sessionUsage.model;
    }
    usage = {
      promptTokens: totals?.input ?? 0,
      completionTokens: totals?.output ?? 0,
      totalTokens: totals?.totalTokens ?? ((totals?.input ?? 0) + (totals?.output ?? 0)),
    };

    if (content) {
      return { content, model: resolvedModel, usage };
    }

    if (attempt < HISTORY_POLL_ATTEMPTS - 1) {
      await sleep(HISTORY_POLL_INTERVAL_MS);
    }
  }

  throw new Error('Gateway agent run completed without a readable assistant response in chat.history');
}

async function deleteAutopilotSession(sessionKey: string): Promise<void> {
  const client = getOpenClawClient();
  try {
    await client.call('sessions.delete', {
      key: sessionKey,
      deleteTranscript: true,
    });
  } catch (error) {
    console.warn('[LLM] Failed to delete temporary autopilot session:', error);
  }
}

/**
 * Send a prompt and get a completion response.
 * Uses OpenClaw Gateway RPC — stateless at the Mission Control layer, but backed
 * by a throwaway agent session for reliable usage accounting and model routing.
 */
export async function complete(
  prompt: string,
  options: CompletionOptions = {},
): Promise<CompletionResult> {
  const {
    model = DEFAULT_MODEL ?? undefined,
    systemPrompt,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const sessionKey = getAutopilotSessionKey();

    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[LLM] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await sleep(delay);
    }

    try {
      const client = getOpenClawClient();
      if (!client.isConnected()) {
        await client.connect();
      }

      const response = await client.call<AgentRunAccepted>('agent', {
        sessionKey,
        message: prompt,
        deliver: false,
        idempotencyKey: randomUUID(),
        lane: 'task',
        ...(systemPrompt ? { extraSystemPrompt: systemPrompt } : {}),
        ...(model ? { model } : {}),
      });

      const runId = response.runId?.trim();
      if (!runId) {
        throw new Error('Gateway agent method returned an empty runId');
      }

      await waitForRunCompletion(runId, timeoutMs);
      const artifacts = await fetchCompletionArtifacts(sessionKey);

      console.log(
        '[LLM] Response usage:',
        JSON.stringify(artifacts.usage),
        `model: ${artifacts.model || model || DEFAULT_AGENT_ID}`,
      );

      return {
        content: artifacts.content,
        model: artifacts.model || model || DEFAULT_AGENT_ID,
        usage: artifacts.usage,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isTimeout = lastError.message.includes('timed out') || lastError.message.includes('timeout');
      const isNetwork = lastError.message.includes('Not connected to OpenClaw Gateway')
        || lastError.message.includes('Failed to connect to OpenClaw Gateway')
        || lastError.message.includes('Connection reset');

      console.error(`[LLM] Attempt ${attempt + 1} failed: ${lastError.message}`);

      if (!isTimeout && !isNetwork) {
        throw lastError;
      }
    } finally {
      await deleteAutopilotSession(sessionKey).catch(() => {});
    }
  }

  throw lastError || new Error('LLM completion failed after retries');
}

/**
 * Send a prompt and parse the response as JSON.
 * Handles markdown code blocks and embedded JSON.
 */
export async function completeJSON<T = unknown>(prompt: string, options: CompletionOptions = {}): Promise<{ data: T; raw: string; model: string; usage: CompletionResult['usage'] }> {
  const result = await complete(prompt, options);
  const parsed = tryParseJsonCandidate<T>(result.content, result.model, result.usage);
  if (parsed.ok) {
    return parsed.value;
  }

  const repaired = await repairJsonResponse(result.content, options);
  const repairedParsed = tryParseJsonCandidate<T>(
    repaired.content,
    repaired.model,
    addUsage(result.usage, repaired.usage),
  );
  if (repairedParsed.ok) {
    return repairedParsed.value;
  }

  throw new Error(`Failed to parse JSON from LLM response. Raw content (first 500 chars): ${result.content.slice(0, 500)}`);
}
