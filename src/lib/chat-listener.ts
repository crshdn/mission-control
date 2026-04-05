import { logger } from '@/lib/logger';
/**
 * Chat Listener — captures agent responses to user chat messages.
 *
 * Strategy: tracks which sessionKeys have pending user chat messages.
 * When a state=final chat_event arrives on a tracked session, stores
 * it as the agent's reply and clears the tracking.
 */
import { getOpenClawClient } from '@/lib/openclaw/client';
import { queryOne, queryAll } from '@/lib/db';
import { createNote } from '@/lib/task-notes';
import { broadcast } from '@/lib/events';
import type { OpenClawSession } from '@/lib/types';
import { CHAT_REPLY_TIMEOUT_MS } from '@/lib/constants';

const GLOBAL_LISTENER_KEY = '__chat_listener_attached__';

// Sessions awaiting a reply: sessionKey → { taskId, sentAt, timeoutId }
const PENDING_KEY = '__chat_pending_replies__';
if (!(PENDING_KEY in globalThis)) {
  (globalThis as Record<string, unknown>)[PENDING_KEY] = new Map<string, { taskId: string; sentAt: number; timeoutId: ReturnType<typeof setTimeout> }>();
}
const pendingReplies = (globalThis as unknown as Record<string, Map<string, { taskId: string; sentAt: number; timeoutId: ReturnType<typeof setTimeout> }>>)[PENDING_KEY];

interface ChatEventPayload {
  runId?: string;
  sessionKey?: string;
  seq?: number;
  state?: string;
  message?: string | { role?: string; content?: unknown };
}

/**
 * Mark a session as expecting a reply from the agent.
 * Called by the chat route after sending a message.
 */
export function expectReply(sessionKey: string, taskId: string): void {
  // Clear any existing pending reply for this session
  const existing = pendingReplies.get(sessionKey);
  if (existing) {
    clearTimeout(existing.timeoutId);
  }

  const timeoutId = setTimeout(() => {
    const entry = pendingReplies.get(sessionKey);
    if (entry && Date.now() - entry.sentAt >= CHAT_REPLY_TIMEOUT_MS) {
      pendingReplies.delete(sessionKey);
    }
  }, CHAT_REPLY_TIMEOUT_MS);

  pendingReplies.set(sessionKey, { taskId, sentAt: Date.now(), timeoutId });
}

function extractContent(message: ChatEventPayload['message']): string {
  if (typeof message === 'string') return message;
  if (!message || typeof message !== 'object') return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return (message.content as Array<{ type?: string; text?: string }>)
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');
  }
  return '';
}

export function attachChatListener(): void {
  if ((globalThis as Record<string, unknown>)[GLOBAL_LISTENER_KEY]) return;
  (globalThis as Record<string, unknown>)[GLOBAL_LISTENER_KEY] = true;

  const client = getOpenClawClient();

  client.on('chat_event', (payload: ChatEventPayload) => {
    if (!payload.sessionKey) return;

    // Only process final (complete) messages
    if (payload.state !== 'final') return;

    // Check if this session is expecting a reply
    const pending = pendingReplies.get(payload.sessionKey);
    if (!pending) return;

    // Skip user messages (state would be 'user' but we filter for 'final' already)
    const content = extractContent(payload.message);
    if (!content.trim()) return;

    // Skip dispatch-template content that leaks through
    if (content.includes('NEW TASK ASSIGNED') || content.includes('OUTPUT DIRECTORY:') ||
        content.includes('TASK_COMPLETE:') || content.includes('TEST_PASS:') ||
        content.includes('VERIFY_PASS:')) return;

    // Got the reply — clear the timeout and pending flag
    clearTimeout(pending.timeoutId);
    pendingReplies.delete(payload.sessionKey);

    try {
      logger.info(`[ChatListener] Agent replied for task ${pending.taskId}: ${content.slice(0, 100)}...`);
      const note = createNote(pending.taskId, content.trim(), 'direct', 'assistant');
      broadcast({ type: 'note_delivered', payload: { taskId: pending.taskId, noteId: note.id } });
    } catch (err) {
      logger.error('[ChatListener] Failed to store agent response:', err);
    }
  });

  logger.info('[ChatListener] Attached to OpenClaw client');
}
