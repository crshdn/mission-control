import { NextRequest, NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';

interface GatewaySession {
  key: string;
  model?: string;
  channel?: string;
  kind?: string;
  [k: string]: unknown;
}

/**
 * POST /api/chat — Send a message to Eve (agent: main) via OpenClaw Gateway
 * 
 * Body: { message: string, sessionId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId: providedSessionId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Find Eve's session
    let sessionId = providedSessionId;

    if (!sessionId) {
      const rawResult = await client.listSessions();
      let allSessions: GatewaySession[] = [];

      if (Array.isArray(rawResult)) {
        allSessions = rawResult as unknown as GatewaySession[];
      } else if (rawResult && typeof rawResult === 'object') {
        const obj = rawResult as unknown as Record<string, unknown>;
        if (Array.isArray(obj.sessions)) {
          allSessions = obj.sessions as GatewaySession[];
        }
      }

      // Look for Eve's main session (agent:main) — prefer telegram direct
      const eveSession =
        allSessions.find((s) => s.key === 'agent:main:telegram:direct:6600459815') ||
        allSessions.find((s) => (s.key || '').startsWith('agent:main:telegram:direct:')) ||
        allSessions.find((s) => (s.key || '').startsWith('agent:main:'));

      if (!eveSession) {
        return NextResponse.json(
          { error: 'No active Eve session found. Eve might be offline.' },
          { status: 404 }
        );
      }

      sessionId = eveSession.key;
    }

    // Get history before sending to know the baseline message count
    let historyBefore: unknown[] = [];
    try {
      historyBefore = await client.getSessionHistory(sessionId);
      if (!Array.isArray(historyBefore)) historyBefore = [];
    } catch {
      // History might not exist yet
    }

    const messageCountBefore = historyBefore.length;

    // Send the message
    await client.sendMessage(sessionId, message);

    // Poll for response (wait for a new assistant message)
    let attempts = 0;
    const maxAttempts = 90; // 90 seconds max wait
    let responseMessage: string | null = null;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;

      try {
        const history = await client.getSessionHistory(sessionId);
        if (!Array.isArray(history)) continue;

        if (history.length > messageCountBefore) {
          // Look for the latest assistant message
          for (let i = history.length - 1; i >= messageCountBefore; i--) {
            const msg = history[i] as Record<string, unknown>;
            if (msg.role === 'assistant') {
              if (typeof msg.content === 'string') {
                responseMessage = msg.content;
              } else if (Array.isArray(msg.content)) {
                responseMessage = (msg.content as Array<Record<string, unknown>>)
                  .filter((block) => block.type === 'text')
                  .map((block) => block.text as string)
                  .join('\n');
              }
              break;
            }
          }
        }

        if (responseMessage) break;
      } catch {
        // Retry on failure
      }
    }

    if (!responseMessage) {
      return NextResponse.json({
        response: null,
        status: 'timeout',
        message: 'Eve is still thinking... The response may appear later.',
        sessionId,
      });
    }

    return NextResponse.json({
      response: responseMessage,
      status: 'ok',
      sessionId,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
