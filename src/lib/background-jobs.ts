/**
 * Background Jobs for Mission Control
 * 
 * Handles periodic tasks like checking for stuck tasks and triggering webhooks.
 */

import { checkStuckTasks } from './webhooks';

// Job intervals (in milliseconds)
const STUCK_TASK_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

let stuckTaskInterval: NodeJS.Timeout | null = null;

/**
 * Start all background jobs
 */
export function startBackgroundJobs(): void {
  console.log('[Background Jobs] Starting...');

  // Stuck task checker
  if (stuckTaskInterval) {
    clearInterval(stuckTaskInterval);
  }

  stuckTaskInterval = setInterval(async () => {
    try {
      await checkStuckTasks();
    } catch (error) {
      console.error('[Background Jobs] Stuck task check failed:', error);
    }
  }, STUCK_TASK_CHECK_INTERVAL);

  console.log('[Background Jobs] Started stuck task checker (every 5 minutes)');
}

/**
 * Stop all background jobs
 */
export function stopBackgroundJobs(): void {
  console.log('[Background Jobs] Stopping...');

  if (stuckTaskInterval) {
    clearInterval(stuckTaskInterval);
    stuckTaskInterval = null;
  }

  console.log('[Background Jobs] Stopped');
}

/**
 * Get background job status
 */
export function getBackgroundJobStatus(): {
  stuckTaskChecker: boolean;
} {
  return {
    stuckTaskChecker: stuckTaskInterval !== null,
  };
}