import { NextResponse } from 'next/server';
import { invokeToolJson } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

type CronListResponse = {
  jobs: {
    id: string;
    name: string;
    agentId?: string;
    enabled: boolean;
    schedule: { kind: string; expr: string; tz?: string };
    createdAtMs?: number;
    updatedAtMs?: number;
    sessionTarget?: string;
    payload?: { kind: string; text?: string };
  }[];
};

export async function GET() {
  try {
    const data = await invokeToolJson<CronListResponse>('cron', { action: 'list' });
    const jobs = (data.jobs ?? []).map((j) => ({
      id: j.id,
      label: j.name,
      enabled: j.enabled,
      schedule: j.schedule,
      created_at: j.createdAtMs ?? 0,
      next_run: null,
    }));
    return NextResponse.json(jobs);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch cron jobs' },
      { status: 502 },
    );
  }
}
