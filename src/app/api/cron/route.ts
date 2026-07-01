import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CronJob {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  schedule: {
    kind: string;
    expr: string;
    staggerMs?: number;
  };
  sessionTarget: string;
  state: {
    nextRunAtMs: number;
    lastRunAtMs: number;
    lastStatus: string;
    lastDurationMs: number;
    consecutiveErrors: number;
  };
}

interface CronListResponse {
  jobs: CronJob[];
}

// GET /api/cron - List all cron jobs from OpenClaw
export async function GET() {
  try {
    const { stdout, stderr } = await execAsync('openclaw cron list --json', {
      timeout: 10000,
    });

    if (stderr && !stdout) {
      console.error('Cron list stderr:', stderr);
      return NextResponse.json({ error: 'Failed to fetch cron jobs', details: stderr }, { status: 500 });
    }

    const data: CronListResponse = JSON.parse(stdout);
    
    // Transform to format expected by CronCalendar component
    const jobs = data.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      agent: job.agentId,
      enabled: job.enabled,
      schedule: job.schedule.expr,
      description: `Target: ${job.sessionTarget}${job.schedule.staggerMs ? `, stagger: ${job.schedule.staggerMs / 60000}m` : ''}`,
      nextRun: job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null,
      lastRun: job.state.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
      status: job.enabled 
        ? (job.state.lastStatus === 'ok' ? 'active' : 'failed')
        : 'paused',
      lastDuration: job.state.lastDurationMs,
      consecutiveErrors: job.state.consecutiveErrors,
    }));

    return NextResponse.json(jobs);
  } catch (error) {
    console.error('Failed to fetch cron jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cron jobs', details: String(error) },
      { status: 500 }
    );
  }
}
