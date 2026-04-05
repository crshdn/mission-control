import { logger } from '@/lib/logger';
/**
 * Server-Sent Events (SSE) broadcaster for real-time updates
 * Manages client connections and broadcasts events to all listeners
 */

import type { SSEEvent } from './types';
import { runHealthCheckCycle } from '@/lib/agent-health';
import { SSE_HEALTH_CHECK_INTERVAL_MS } from '@/lib/constants';

// Store active SSE client connections
const clients = new Set<ReadableStreamDefaultController>();

// Singleton health check - runs every interval regardless of connection count
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let healthCheckStarted = false;

function removeClient(controller: ReadableStreamDefaultController): void {
  const removed = clients.delete(controller);
  if (removed && clients.size === 0) {
    stopHealthCheckCycle();
  }
}

function startHealthCheckCycle(): void {
  if (healthCheckStarted) return;
  healthCheckStarted = true;

  healthCheckInterval = setInterval(async () => {
    if (clients.size > 0) {
      try {
        await runHealthCheckCycle();
      } catch (error) {
        logger.error('[SSE] Health check cycle error:', error);
      }
    }
  }, SSE_HEALTH_CHECK_INTERVAL_MS);

  logger.info('[SSE] Health check cycle started');
}

function stopHealthCheckCycle(): void {
  if (healthCheckInterval !== null) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    healthCheckStarted = false;
    logger.info('[SSE] Health check cycle stopped');
  }
}

/**
 * Register a new SSE client connection
 */
export function registerClient(controller: ReadableStreamDefaultController): void {
  clients.add(controller);
  // Start health check on first connection
  startHealthCheckCycle();
}

/**
 * Unregister an SSE client connection
 */
export function unregisterClient(controller: ReadableStreamDefaultController): void {
  removeClient(controller);
}

/**
 * Broadcast an event to all connected SSE clients
 */
export function broadcast(event: SSEEvent): void {
  const encoder = new TextEncoder();
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = encoder.encode(data);

  // Send to all connected clients
  const clientsArray = Array.from(clients);
  for (const client of clientsArray) {
    try {
      client.enqueue(encoded);
    } catch (error) {
      // Client disconnected, remove it
      logger.error('Failed to send SSE event to client:', error);
      removeClient(client);
    }
  }

  logger.info(`[SSE] Broadcast ${event.type} to ${clients.size} client(s)`);
}

/**
 * Get the number of active SSE connections
 */
export function getActiveConnectionCount(): number {
  return clients.size;
}
