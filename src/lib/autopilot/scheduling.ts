import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import type { ProductSchedule } from '@/lib/types';

export function createSchedule(productId: string, input: {
  schedule_type: string;
  cron_expression: string;
  timezone?: string;
  enabled?: boolean;
  config?: string;
}): ProductSchedule {
  const id = uuidv4();
  const now = new Date().toISOString();

  run(
    `INSERT INTO product_schedules (id, product_id, schedule_type, cron_expression, timezone, enabled, config, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, productId, input.schedule_type, input.cron_expression, input.timezone || 'America/Denver', input.enabled !== false ? 1 : 0, input.config || null, now, now]
  );

  return queryOne<ProductSchedule>('SELECT * FROM product_schedules WHERE id = ?', [id])!;
}

export function listSchedules(productId: string): ProductSchedule[] {
  return queryAll<ProductSchedule>(
    'SELECT * FROM product_schedules WHERE product_id = ? ORDER BY schedule_type',
    [productId]
  );
}

export function updateSchedule(schedId: string, updates: Partial<{
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  config: string;
}>): ProductSchedule | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      if (key === 'enabled') {
        fields.push('enabled = ?');
        values.push(value ? 1 : 0);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
  }

  if (fields.length === 0) return queryOne<ProductSchedule>('SELECT * FROM product_schedules WHERE id = ?', [schedId]);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(schedId);

  run(`UPDATE product_schedules SET ${fields.join(', ')} WHERE id = ?`, values);
  return queryOne<ProductSchedule>('SELECT * FROM product_schedules WHERE id = ?', [schedId]);
}

export function deleteSchedule(schedId: string): boolean {
  return run('DELETE FROM product_schedules WHERE id = ?', [schedId]).changes > 0;
}

/**
 * Simple cron matcher — checks if a schedule is due.
 * Supports: minute, hour, day-of-month, month, day-of-week
 */
function cronMatches(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const checks = [
    { field: minute, value: date.getMinutes() },
    { field: hour, value: date.getHours() },
    { field: dayOfMonth, value: date.getDate() },
    { field: month, value: date.getMonth() + 1 },
    { field: dayOfWeek, value: date.getDay() },
  ];

  return checks.every(({ field, value }) => {
    if (field === '*') return true;
    if (field.includes('/')) {
      const [, step] = field.split('/');
      return value % parseInt(step, 10) === 0;
    }
    if (field.includes(',')) {
      return field.split(',').map(Number).includes(value);
    }
    return parseInt(field, 10) === value;
  });
}

/**
 * Check and run due schedules. Called from SSE heartbeat every 60 seconds.
 */
export async function checkAndRunDueSchedules(): Promise<void> {
  const now = new Date();
  const enabledSchedules = queryAll<ProductSchedule>(
    `SELECT ps.*, p.status as product_status FROM product_schedules ps
     JOIN products p ON ps.product_id = p.id
     WHERE ps.enabled = 1 AND p.status = 'active'`
  );

  for (const schedule of enabledSchedules) {
    // Skip if already ran this minute
    if (schedule.last_run_at) {
      const lastRun = new Date(schedule.last_run_at);
      if (now.getTime() - lastRun.getTime() < 60000) continue;
    }

    if (!cronMatches(schedule.cron_expression, now)) continue;

    // Mark as running
    run(
      `UPDATE product_schedules SET last_run_at = ?, updated_at = ? WHERE id = ?`,
      [now.toISOString(), now.toISOString(), schedule.id]
    );

    // Execute based on type
    try {
      switch (schedule.schedule_type) {
        case 'research': {
          const { runResearchCycle } = await import('./research');
          await runResearchCycle(schedule.product_id);
          break;
        }
        case 'ideation': {
          const { runIdeationCycle } = await import('./ideation');
          await runIdeationCycle(schedule.product_id);
          break;
        }
        case 'maybe_reevaluation': {
          const { evaluateMaybePool } = await import('./maybe-pool');
          evaluateMaybePool(schedule.product_id);
          break;
        }
        default:
          logger.info(`[Schedule] Unhandled schedule type: ${schedule.schedule_type}`);
      }
    } catch (error) {
      logger.error(`[Schedule] Failed to run ${schedule.schedule_type} for product ${schedule.product_id}:`, error);
    }
  }
}
