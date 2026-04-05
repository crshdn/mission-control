import { logger } from '@/lib/logger';
import { getOpenClawClient } from './openclaw/client';

// Maximum input length for extractJSON to prevent ReDoS attacks
const MAX_EXTRACT_JSON_LENGTH = 1_000_000; // 1MB

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
    logger.warn('[Planning Utils] Input exceeds maximum length for JSON extraction:', text.length);
    return null;
  }

  // First, try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {
    // Continue to other methods
  }

  // Try to extract from markdown code block (```json ... ``` or ``` ... ```)
  // Use greedy match first (handles nested backticks), then lazy as fallback
  const codeBlockGreedy = text.match(/```(?:json)?\s*([\s\S]*)```/);
  if (codeBlockGreedy) {
    try {
      return JSON.parse(codeBlockGreedy[1].trim());
    } catch {
      // Continue
    }
  }
  const codeBlockLazy = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockLazy) {
    try {
      return JSON.parse(codeBlockLazy[1].trim());
    } catch {
      // Continue
    }
  }
  // Handle unclosed code blocks (LLM generated opening ``` but no closing ```)
  const unclosedBlock = text.match(/```(?:json)?\s*(\{[\s\S]*)/);
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
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
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
        if (textContent?.text && textContent.text.trim().length > 0) {
          messages.push({
            role: 'assistant',
            content: textContent.text,
          });
        }
      }
    }

    return messages;
  } catch (err) {
    logger.error('[Planning Utils] Failed to get messages from OpenClaw:', err);
    return [];
  }
}
