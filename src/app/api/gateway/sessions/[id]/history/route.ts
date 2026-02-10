import { NextResponse } from 'next/server';
import { readTranscript } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const messages = readTranscript(id, 100);
    return NextResponse.json(messages);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch history' },
      { status: 500 },
    );
  }
}
