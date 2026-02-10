import { NextResponse } from 'next/server';
import { invokeToolJson, readTranscript } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

type SessionItem = {
  key: string;
  sessionId: string;
  displayName?: string;
  model?: string;
  updatedAt: number;
  totalTokens?: number;
};

type CronJob = {
  id: string;
  label: string;
  enabled: boolean;
  schedule: { kind: string; expr: string; tz?: string };
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ memories: [], files: [], sessions: [], cron_jobs: [] });
  }

  const lowerQ = q.toLowerCase();

  try {
    const [sessResult, cronResult] = await Promise.allSettled([
      invokeToolJson<{ sessions: SessionItem[] }>('sessions_list'),
      invokeToolJson<{ jobs: { id: string; name: string; enabled: boolean; schedule: { kind: string; expr: string; tz?: string } }[] }>('cron', { action: 'list' }),
    ]);

    const allSessions = sessResult.status === 'fulfilled' ? sessResult.value.sessions : [];
    const allCronJobs = cronResult.status === 'fulfilled' ? cronResult.value.jobs : [];

    // Search session names
    const matchedSessions = allSessions.filter(
      (s) =>
        s.key.toLowerCase().includes(lowerQ) ||
        (s.displayName ?? '').toLowerCase().includes(lowerQ),
    );

    // Search cron job names
    const matchedCron: CronJob[] = allCronJobs
      .filter((j) => j.name.toLowerCase().includes(lowerQ))
      .map((j) => ({ id: j.id, label: j.name, enabled: j.enabled, schedule: j.schedule }));

    // Search transcript content from recent sessions
    const memories: { content: string; session?: string }[] = [];
    for (const sess of allSessions.slice(0, 5)) {
      const msgs = readTranscript(sess.sessionId, 30);
      for (const msg of msgs) {
        const text = typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((p) => p.type === 'text')
              .map((p) => p.text ?? '')
              .join(' ');
        if (text.toLowerCase().includes(lowerQ)) {
          const idx = text.toLowerCase().indexOf(lowerQ);
          const start = Math.max(0, idx - 80);
          const end = Math.min(text.length, idx + q.length + 80);
          memories.push({
            content: (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : ''),
            session: sess.key,
          });
        }
        if (memories.length >= 10) break;
      }
      if (memories.length >= 10) break;
    }

    return NextResponse.json({
      memories,
      files: [],
      sessions: matchedSessions,
      cron_jobs: matchedCron,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Search failed' },
      { status: 502 },
    );
  }
}
