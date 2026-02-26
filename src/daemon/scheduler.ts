/**
 * Job Scheduler — 10s loop
 * Evaluates scheduled jobs against current ET time, creates tasks when due.
 */

import { queryOne, queryAll, run } from '../lib/db';
import { log } from './logger';
import { broadcastEvent } from './bridge';
import { SCHEDULED_JOBS } from './jobs';
import type { ScheduledJob, ScheduledJobRun } from './types';
import type { Agent, Task } from '../lib/types';

/** Get current time components in America/New_York */
function getETTime(): { hour: number; minute: number; dayOfWeek: number; iso: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';

  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[weekday] ?? new Date().getDay();

  return { hour, minute, dayOfWeek, iso: now.toISOString() };
}

function isMarketHours(hour: number, minute: number): boolean {
  const timeInMinutes = hour * 60 + minute;
  return timeInMinutes >= 570 && timeInMinutes <= 960; // 9:30 AM - 4:00 PM
}

function isWeekday(dayOfWeek: number): boolean {
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

/** Check if a daily job already fired today (ET date) */
function hasFiredToday(jobId: string): boolean {
  const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const existing = queryOne<ScheduledJobRun>(
    `SELECT * FROM scheduled_job_runs WHERE job_id = ? AND fired_at >= ? ORDER BY fired_at DESC LIMIT 1`,
    [jobId, `${todayET}T00:00:00`]
  );
  return !!existing;
}

/** Check if enough time has passed since last interval run */
function canFireInterval(jobId: string, intervalMs: number): boolean {
  const lastRun = queryOne<ScheduledJobRun>(
    'SELECT * FROM scheduled_job_runs WHERE job_id = ? ORDER BY fired_at DESC LIMIT 1',
    [jobId]
  );

  if (!lastRun) return true;

  const elapsed = Date.now() - new Date(lastRun.fired_at).getTime();
  return elapsed >= intervalMs;
}

function shouldFire(job: ScheduledJob, et: ReturnType<typeof getETTime>): boolean {
  if (!job.enabled) return false;

  const { schedule } = job;

  // Weekday check
  if (schedule.weekdaysOnly && !isWeekday(et.dayOfWeek)) return false;

  // Market hours check
  if (schedule.marketHoursOnly && !isMarketHours(et.hour, et.minute)) return false;

  if (schedule.type === 'daily') {
    // Match hour:minute within a 1-minute window
    if (et.hour !== schedule.hour || et.minute !== schedule.minute) return false;
    return !hasFiredToday(job.id);
  }

  if (schedule.type === 'interval') {
    if (!schedule.intervalMs) return false;
    return canFireInterval(job.id, schedule.intervalMs);
  }

  return false;
}

export async function runScheduler(): Promise<void> {
  const et = getETTime();

  for (const job of SCHEDULED_JOBS) {
    if (!shouldFire(job, et)) continue;

    // Look up target agent
    const agent = queryOne<Agent>(
      "SELECT * FROM agents WHERE name = ? AND status != 'offline'",
      [job.agentName]
    );

    if (!agent) {
      log.warn(`Scheduler: agent "${job.agentName}" not found or offline, skipping ${job.name}`);
      continue;
    }

    // Create task
    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    run(
      `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at)
       VALUES (?, ?, ?, 'assigned', ?, ?, 'default', 'default', ?, ?)`,
      [taskId, job.taskTemplate.title, job.taskTemplate.description, job.taskTemplate.priority, agent.id, now, now]
    );

    // Record the run
    run(
      `INSERT INTO scheduled_job_runs (id, job_id, fired_at, task_id, status, created_at)
       VALUES (?, ?, ?, ?, 'fired', ?)`,
      [crypto.randomUUID(), job.id, now, taskId, now]
    );

    log.info(`Scheduler: fired ${job.name} -> task ${taskId} assigned to ${agent.name}`);

    // Broadcast new task to UI
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (task) {
      await broadcastEvent({ type: 'task_created', payload: task });
    }
  }
}
