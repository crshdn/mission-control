import { NextResponse } from 'next/server';
import { invokeGatewayTool, invokeToolJson, readTranscript } from '@/lib/openclaw';
import type { GatewaySession } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAIN_SESSION_KEY = 'agent:main:main';

type SessionsResponse = {
  count: number;
  sessions: GatewaySession[];
};

async function findMainSessionId(): Promise<string | null> {
  const data = await invokeToolJson<SessionsResponse>('sessions_list');
  const main = data.sessions?.find((s) => s.key === MAIN_SESSION_KEY);
  return main?.sessionId ?? null;
}

export async function GET() {
  try {
    const sessionId = await findMainSessionId();
    if (!sessionId) {
      return NextResponse.json({ messages: [], error: 'Main session not found' });
    }
    const messages = readTranscript(sessionId, 100);
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json(
      { messages: [], error: e instanceof Error ? e.message : 'Failed to fetch chat history' },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string };
    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const envelope = await invokeGatewayTool('chat.send', {
      session_key: MAIN_SESSION_KEY,
      text: body.message.trim(),
    });

    return NextResponse.json(envelope);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to send message' },
      { status: 502 },
    );
  }
}
