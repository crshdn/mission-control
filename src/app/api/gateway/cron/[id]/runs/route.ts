import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Cron runs require a jobId param which the HTTP /tools/invoke endpoint
  // doesn't pass through. Return empty until gateway fixes param forwarding.
  return NextResponse.json([]);
}
