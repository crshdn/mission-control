import { NextResponse } from 'next/server';
import { invokeToolText, parseStatusText } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const text = await invokeToolText('session_status');
    const parsed = parseStatusText(text);
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch status' },
      { status: 502 },
    );
  }
}
