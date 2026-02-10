import { NextResponse } from 'next/server';
import { invokeToolJson } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

type SessionsResponse = {
  count: number;
  sessions: {
    key: string;
    sessionId: string;
    kind: string;
    channel?: string;
    displayName?: string;
    label?: string;
    model?: string;
    totalTokens?: number;
    contextTokens?: number;
    updatedAt: number;
    transcriptPath?: string;
    abortedLastRun?: boolean;
  }[];
};

export async function GET() {
  try {
    const data = await invokeToolJson<SessionsResponse>('sessions_list');
    return NextResponse.json(data.sessions ?? []);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch sessions' },
      { status: 502 },
    );
  }
}
