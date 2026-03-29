/**
 * Lightweight LLM completion via OpenClaw Gateway's OpenAI-compatible endpoint.
 * Uses /v1/chat/completions for stateless prompt→response (no agent sessions).
 */

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5_000; // 5s, 10s, 20s exponential backoff
const OPENCLAW_GATEWAY_MODEL = 'openclaw/default';

function getGatewayUrl(): string {
  return process.env.OPENCLAW_GATEWAY_URL?.replace('ws://', 'http://').replace('wss://', 'https://') || 'http://127.0.0.1:18789';
}

function getGatewayToken(): string {
  return process.env.OPENCLAW_GATEWAY_TOKEN || '';
}

function getDefaultModel(): string {
  return process.env.AUTOPILOT_MODEL || 'anthropic/claude-sonnet-4-6';
}

function resolveGatewayModel(model: string): { gatewayModel: string; modelOverride: string | null } {
  if (model === 'openclaw' || model.startsWith('openclaw/')) {
    return { gatewayModel: model, modelOverride: null };
  }

  return { gatewayModel: OPENCLAW_GATEWAY_MODEL, modelOverride: model };
}

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

/**
 * Send a prompt and get a completion response.
 * Uses the Gateway's /v1/chat/completions endpoint — stateless, no agent session.
 */
export async function complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResult> {
  const {
    model = getDefaultModel(),
    systemPrompt,
    temperature = 0.7,
    maxTokens = 8192,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const { gatewayModel, modelOverride } = resolveGatewayModel(model);

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[LLM] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${getGatewayUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getGatewayToken()}`,
          ...(modelOverride ? { 'x-openclaw-model': modelOverride } : {}),
        },
        body: JSON.stringify({
          model: gatewayModel,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM completion failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        model: string;
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const content = data.choices?.[0]?.message?.content || '';
      const resolvedModel = modelOverride || data.model || gatewayModel;

      console.log(`[LLM] Response usage:`, JSON.stringify(data.usage || null), `model: ${resolvedModel}`);

      return {
        content,
        model: resolvedModel,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error));
      const isAbort = lastError.name === 'AbortError' || lastError.message.includes('aborted');
      const isNetwork = lastError.message.includes('fetch failed') || lastError.message.includes('ECONNREFUSED') || lastError.message.includes('ECONNRESET');

      if (isAbort || isNetwork) {
        console.error(`[LLM] Attempt ${attempt + 1} failed (${isAbort ? 'timeout/abort' : 'network'}): ${lastError.message}`);
        continue; // retry
      }

      // Non-retryable error (e.g. 400 bad request, parse error)
      throw lastError;
    } finally {
      clearTimeout(timeout);
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

  // Try direct parse
  try {
    return { data: JSON.parse(result.content.trim()) as T, raw: result.content, model: result.model, usage: result.usage };
  } catch {
    // Continue
  }

  // Try markdown code block
  const codeBlockMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return { data: JSON.parse(codeBlockMatch[1].trim()) as T, raw: result.content, model: result.model, usage: result.usage };
    } catch {
      // Continue
    }
  }

  // Try first { to last }
  const firstBrace = result.content.indexOf('{');
  const lastBrace = result.content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return { data: JSON.parse(result.content.slice(firstBrace, lastBrace + 1)) as T, raw: result.content, model: result.model, usage: result.usage };
    } catch {
      // Continue
    }
  }

  // Try first [ to last ]
  const firstBracket = result.content.indexOf('[');
  const lastBracket = result.content.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return { data: JSON.parse(result.content.slice(firstBracket, lastBracket + 1)) as T, raw: result.content, model: result.model, usage: result.usage };
    } catch {
      // Continue
    }
  }

  throw new Error(`Failed to parse JSON from LLM response. Raw content (first 500 chars): ${result.content.slice(0, 500)}`);
}
