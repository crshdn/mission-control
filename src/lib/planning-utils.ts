import { getOpenClawClient } from './openclaw/client';

// Maximum input length for extractJSON to prevent ReDoS attacks
const MAX_EXTRACT_JSON_LENGTH = 1_000_000; // 1MB

function extractBalancedJsonCandidate(text: string): string | null {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const startIndex = (() => {
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

/**
 * Extract JSON from a response that might have markdown code blocks or surrounding text.
 * Handles various formats:
 * - Direct JSON
 * - Markdown code blocks (```json ... ``` or ``` ... ```)
 * - JSON embedded in text (first { to last })
 */
export function extractJSON(text: string): object | null {
  // Security: Prevent ReDoS on massive inputs
  if (text.length > MAX_EXTRACT_JSON_LENGTH) {
    console.warn('[Planning Utils] Input exceeds maximum length for JSON extraction:', text.length);
    return null;
  }

  const normalizedText = text
    .replace(/<\/?think>/gi, ' ')
    .replace(/<\/?final>/gi, ' ')
    .trim();

  // First, try direct parse
  try {
    return JSON.parse(normalizedText);
  } catch {
    // Continue to other methods
  }

  // Try to extract from markdown code block (```json ... ``` or ``` ... ```)
  // Use greedy match first (handles nested backticks), then lazy as fallback
  const codeBlockGreedy = normalizedText.match(/```(?:json)?\s*([\s\S]*)```/);
  if (codeBlockGreedy) {
    try {
      return JSON.parse(codeBlockGreedy[1].trim());
    } catch {
      // Continue
    }
  }
  const codeBlockLazy = normalizedText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockLazy) {
    try {
      return JSON.parse(codeBlockLazy[1].trim());
    } catch {
      // Continue
    }
  }
  // Handle unclosed code blocks (LLM generated opening ``` but no closing ```)
  const unclosedBlock = normalizedText.match(/```(?:json)?\s*(\{[\s\S]*)/);
  if (unclosedBlock) {
    const jsonCandidate = unclosedBlock[1].trim();
    try {
      return JSON.parse(jsonCandidate);
    } catch {
      // Try to find valid JSON by trimming from the end
      const lastBrace = jsonCandidate.lastIndexOf('}');
      if (lastBrace > 0) {
        try {
          return JSON.parse(jsonCandidate.slice(0, lastBrace + 1));
        } catch {
          // Continue
        }
      }
    }
  }

  // Try to find JSON object in the text (first { to last })
  const firstBrace = normalizedText.indexOf('{');
  const lastBrace = normalizedText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(normalizedText.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue
    }
  }

  const balancedCandidate = extractBalancedJsonCandidate(normalizedText);
  if (balancedCandidate) {
    try {
      return JSON.parse(balancedCandidate);
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Get messages from OpenClaw API for a given session.
 * Returns assistant messages with text content extracted.
 */
export async function getMessagesFromOpenClaw(
  sessionKey: string
): Promise<Array<{ role: string; content: string }>> {
  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    // Use chat.history API to get session messages
    const result = await client.call<{
      messages: Array<{
        role: string;
        content: Array<{ type: string; text?: string }>;
      }>;
    }>('chat.history', {
      sessionKey,
      limit: 50,
    });

    const messages: Array<{ role: string; content: string }> = [];

    for (const msg of result.messages || []) {
      if (msg.role === 'assistant') {
        const textContent = msg.content?.find((c) => c.type === 'text');
        const normalized = textContent?.text?.trim() || '';
        const isThinkingMarker = /^<\/?think>$/i.test(normalized);
        if (normalized.length > 0 && !isThinkingMarker) {
          messages.push({
            role: 'assistant',
            content: normalized,
          });
        }
      }
    }

    return messages;
  } catch (err) {
    console.error('[Planning Utils] Failed to get messages from OpenClaw:', err);
    return [];
  }
}
