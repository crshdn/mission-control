/**
 * Event Router — 10s loop
 * Watches for task status transitions and triggers automated actions.
 * Currently: auto-test tasks in 'testing' status.
 */

import { queryAll } from '../lib/db';
import { log } from './logger';
import type { Task } from '../lib/types';

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:4000';

// Track tasks we've already triggered tests for to avoid re-firing
const processedTestTasks = new Set<string>();

export async function runRouter(): Promise<void> {
  // Find tasks in 'testing' status that haven't been processed
  const testingTasks = queryAll<Task>(
    "SELECT * FROM tasks WHERE status = 'testing'"
  );

  for (const task of testingTasks) {
    if (processedTestTasks.has(task.id)) continue;

    // Mark as processed immediately to avoid re-triggering
    processedTestTasks.add(task.id);

    log.info(`Router: triggering auto-test for task "${task.title}" (${task.id})`);

    try {
      const res = await fetch(`${MISSION_CONTROL_URL}/api/tasks/${task.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const result = await res.json();
        log.info(`Router: test ${result.passed ? 'PASSED' : 'FAILED'} for ${task.id} -> ${result.newStatus}`);
      } else {
        log.warn(`Router: test request failed for ${task.id}: ${res.status}`);
        // Allow retry on next tick
        processedTestTasks.delete(task.id);
      }
    } catch (err) {
      log.error(`Router: test error for ${task.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
      processedTestTasks.delete(task.id);
    }
  }

  // Prune processed set: remove tasks no longer in 'testing'
  const testingIds = new Set(testingTasks.map(t => t.id));
  Array.from(processedTestTasks).forEach(id => {
    if (!testingIds.has(id)) {
      processedTestTasks.delete(id);
    }
  });
}
