import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/openclaw/sessions/[id]/history - Get conversation history
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    const result = await client.getSessionHistory(id);
    
    // Gateway returns { sessionKey, sessionId, messages, thinkingLevel }
    let messages: unknown[] = [];
    if (Array.isArray(result)) {
      messages = result;
    } else if (result && typeof result === 'object') {
      const obj = result as unknown as Record<string, unknown>;
      if (Array.isArray(obj.messages)) {
        messages = obj.messages;
      }
    }
    
    return NextResponse.json({ history: messages });
  } catch (error) {
    console.error('Failed to get OpenClaw session history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
