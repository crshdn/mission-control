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
      (result as { agents?: Array<{ id: string; identityName?: string; name?: string; model?: string; isDefault?: boolean }> })?.agents?.map((a) => ({
        id: a.id,
        display_name: a.identityName ?? a.name,
        model: a.model,
        isDefault: a.isDefault ?? false,
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
