/**
 * Mission Control Daemon — Entry Point
 *
 * Runs as a separate process from Next.js.
 * Handles: heartbeat monitoring, task auto-dispatch, scheduled jobs, event routing.
 *
 * Usage:
 *   npx tsx src/daemon/index.ts
 *   npm run daemon
 */

import { getDb, closeDb } from '../lib/db';
import { getOpenClawClient } from '../lib/openclaw/client';
import { log } from './logger';
import { initializeHeartbeats } from './health';
import { runHeartbeat } from './heartbeat';
import { runDispatcher } from './dispatcher';
import { runScheduler } from './scheduler';
import { runRouter } from './router';
import type { DaemonConfig } from './types';

const config: DaemonConfig = {
  heartbeatIntervalMs: 30_000,  // 30s
  dispatchIntervalMs: 10_000,   // 10s
  schedulerIntervalMs: 10_000,  // 10s
  missionControlUrl: process.env.MISSION_CONTROL_URL || 'http://localhost:3000',
  staleThresholdMs: 300_000,    // 5min
  maxConsecutiveFailures: 10,
};

class MissionControlDaemon {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private dispatchTimer: NodeJS.Timeout | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private running = false;

  async start(): Promise<void> {
    log.info('Starting Mission Control Daemon...');

    // Initialize database (runs migrations)
    try {
      getDb();
      log.info('Database connected');
    } catch (err) {
      log.error(`Database init failed: ${err instanceof Error ? err.message : 'Unknown'}`);
      process.exit(1);
    }

    // Connect to OpenClaw Gateway (non-blocking — heartbeat/dispatch gracefully skip if down)
    const client = getOpenClawClient();
    try {
      await client.connect();
      log.info('OpenClaw Gateway connected');
    } catch {
      log.warn('OpenClaw Gateway unavailable — will retry via heartbeat');
    }

    // Initialize health records
    initializeHeartbeats();

    // Start loops
    this.running = true;

    this.heartbeatTimer = setInterval(() => this.safeRun('heartbeat', runHeartbeat), config.heartbeatIntervalMs);
    this.dispatchTimer = setInterval(() => this.safeRun('dispatcher', runDispatcher), config.dispatchIntervalMs);
    this.schedulerTimer = setInterval(() => {
      this.safeRun('scheduler', runScheduler);
      this.safeRun('router', runRouter);
    }, config.schedulerIntervalMs);

    log.info(`Daemon running — heartbeat/${config.heartbeatIntervalMs / 1000}s, dispatch/${config.dispatchIntervalMs / 1000}s, scheduler/${config.schedulerIntervalMs / 1000}s`);

    // Run dispatcher immediately on boot to catch any pending tasks
    await this.safeRun('dispatcher', runDispatcher);
  }

  private async safeRun(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      log.error(`${name} error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  async shutdown(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    log.info('Shutting down daemon...');

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);

    const client = getOpenClawClient();
    client.disconnect();

    closeDb();

    log.info('Daemon stopped');
    process.exit(0);
  }
}

// Boot
const daemon = new MissionControlDaemon();

process.on('SIGTERM', () => daemon.shutdown());
process.on('SIGINT', () => daemon.shutdown());
process.on('uncaughtException', (err) => {
  log.error(`Uncaught exception: ${err.message}`);
  daemon.shutdown();
});
process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled rejection: ${reason}`);
});

daemon.start().catch((err) => {
  log.error(`Failed to start daemon: ${err}`);
  process.exit(1);
});
