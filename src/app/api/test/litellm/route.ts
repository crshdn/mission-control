import { NextResponse } from 'next/server';
import { callLiteLLM } from '@/lib/litellm';

export async function GET() {
  try {
    const resp = await callLiteLLM('copilot-claude-sonnet', [{ role: 'user', content: 'Please reply with {"status":"ok"}'}]);
    return NextResponse.json({ ok: true, resp });
  } catch (err:any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
