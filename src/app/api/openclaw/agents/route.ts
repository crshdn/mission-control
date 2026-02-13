import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';

export async function GET() {
  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    const result = await client.call('agents.list', {});

    const agents =
      (result as { agents?: Array<{ name: string }> })?.agents?.map((a) => ({
        name: a.name,
      })) ?? [];

    return NextResponse.json(agents);
  } catch (error) {
    console.error('Failed to fetch OpenClaw agents', error);
    return NextResponse.json(
      { error: 'Unable to fetch runtime agents' },
      { status: 500 }
    );
  }
}
