import { NextResponse } from 'next/server';
import { checkGatewayHealth } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

export async function GET() {
  const healthy = await checkGatewayHealth();
  return NextResponse.json({ healthy });
}
