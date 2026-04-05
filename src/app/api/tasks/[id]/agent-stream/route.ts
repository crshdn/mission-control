import { logger } from '@/lib/logger';
import { NextRequest } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { getActiveSessionForTask } from '@/lib/task-notes';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface AgentEventPayload {
  runId?: string;
  stream?: string;
  data?: string;
  sessionKey?: string;
  seq?: number;
  ts?: string;
}

interface ChatEventPayload {
  runId?: string;
  sessionKey?: string;
  seq?: number;
  state?: string;
  message?: string | { role?: string; content?: unknown };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: taskId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let messageIndex = 0;
      let sessionKey: string | null = null;
      let sessionPollInterval: NodeJS.Timeout | null = null;
      let keepAliveInterval: NodeJS.Timeout | null = null;
      let closed = false;

      const send = (data: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        closed = true;
        if (sessionPollInterval) clearInterval(sessionPollInterval);
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        // Remove event listeners
        const client = getOpenClawClient();
        client.removeListener('agent_event', onAgentEvent);
        client.removeListener('chat_event', onChatEvent);
        try { controller.close(); } catch {}
      };

      // Handler for real-time agent streaming events (tokens, tool calls, etc.)
      const onAgentEvent = (payload: AgentEventPayload) => {
        if (!sessionKey || payload.sessionKey !== sessionKey) return;

        send({
          type: 'agent_stream',
          index: messageIndex++,
          stream: payload.stream || 'unknown',
          data: payload.data || '',
          timestamp: payload.ts || new Date().toISOString(),
        });
      };

      // Handler for chat turn events (complete messages between user/agent)
      const onChatEvent = (payload: ChatEventPayload) => {
        if (!sessionKey || payload.sessionKey !== sessionKey) return;

        let role = 'system';
        let content = '';

        if (typeof payload.message === 'string') {
          // Simple string message
          content = payload.message;
          role = payload.state === 'user' ? 'user' : 'assistant';
        } else if (payload.message && typeof payload.message === 'object') {
          // Structured message
          role = payload.message.role || (payload.state === 'user' ? 'user' : 'assistant');
          if (typeof payload.message.content === 'string') {
            content = payload.message.content;
          } else if (Array.isArray(payload.message.content)) {
            content = (payload.message.content as Array<{ type?: string; text?: string }>)
              .filter(c => c.type === 'text' && c.text)
              .map(c => c.text!)
              .join('\n');
          }
        }

        if (content || payload.state) {
          send({
            type: 'message',
            index: messageIndex++,
            role,
            content: content || `[${payload.state}]`,
            state: payload.state,
            timestamp: new Date().toISOString(),
          });
        }
      };

      const attachListeners = (key: string) => {
        sessionKey = key;
        const client = getOpenClawClient();

        // Ensure we're connected
        if (!client.isConnected()) {
          client.connect().catch(err => {
            logger.error('[AgentStream] Failed to connect:', err);
            send({ type: 'error', message: 'Failed to connect to gateway' });
          });
        }

        client.on('agent_event', onAgentEvent);
        client.on('chat_event', onChatEvent);
        send({ type: 'streaming' });
      };

      const startPolling = () => {
        const sessionInfo = getActiveSessionForTask(taskId);

        if (sessionInfo) {
          attachListeners(sessionInfo.sessionKey);
          return;
        }

        // No session yet — poll until one appears
        send({ type: 'no_session' });
        sessionPollInterval = setInterval(() => {
          const newSession = getActiveSessionForTask(taskId);
          if (newSession) {
            if (sessionPollInterval) clearInterval(sessionPollInterval);
            sessionPollInterval = null;
            attachListeners(newSession.sessionKey);
          }
        }, 3000);
      };

      // Keep-alive ping
      keepAliveInterval = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        cleanup();
      });

      // Start
      startPolling();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
