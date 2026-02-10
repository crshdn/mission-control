import { NextResponse } from 'next/server';
import { fetchNpmVersion } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pkg = searchParams.get('pkg') ?? 'openclaw';
  const version = await fetchNpmVersion(pkg);
  return NextResponse.json({ version });
}
