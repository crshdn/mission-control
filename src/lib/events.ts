/**
 * Server-Sent Events (SSE) broadcaster for real-time updates
 * Manages client connections and broadcasts events to all listeners
 *
 * Security: enforces MAX_CLIENTS cap and idle timeout to prevent
 * resource exhaustion from leaked or malicious connections.
 */

import type { SSEEvent } from './types';

/** Hard cap on concurrent SSE connections */
const MAX_CLIENTS = parseInt(process.env.SSE_MAX_CLIENTS || '100', 10);

/** Idle timeout in ms — drop clients that haven't received a successful enqueue */
const CLIENT_IDLE_TIMEOUT_MS = parseInt(process.env.SSE_IDLE_TIMEOUT_MS || '300000', 10); // 5 min

interface ClientEntry {
  controller: ReadableStreamDefaultController;
  connectedAt: number;
  lastActiveAt: number;
}

// Store active SSE client connections
const clients = new Map<ReadableStreamDefaultController, ClientEntry>();

// Periodic idle sweep (runs every 60 s)
const idleSweep = setInterval(() => {
  const now = Date.now();
  for (const [ctrl, entry] of clients) {
    if (now - entry.lastActiveAt > CLIENT_IDLE_TIMEOUT_MS) {
      console.log(`[SSE] Removing idle client (idle ${Math.round((now - entry.lastActiveAt) / 1000)}s)`);
      try { ctrl.close(); } catch { /* already closed */ }
      clients.delete(ctrl);
    }
  }
}, 60_000);
if (idleSweep.unref) idleSweep.unref();

/**
 * Register a new SSE client connection.
 * Returns false if the connection was rejected (at capacity).
 */
export function registerClient(controller: ReadableStreamDefaultController): boolean {
  // Enforce max clients
  if (clients.size >= MAX_CLIENTS) {
    // Evict the oldest client to make room
    let oldestCtrl: ReadableStreamDefaultController | null = null;
    let oldestTime = Infinity;
    for (const [ctrl, entry] of clients) {
      if (entry.connectedAt < oldestTime) {
        oldestTime = entry.connectedAt;
        oldestCtrl = ctrl;
      }
    }
    if (oldestCtrl) {
      console.log('[SSE] Max clients reached, evicting oldest connection');
      try { oldestCtrl.close(); } catch { /* already closed */ }
      clients.delete(oldestCtrl);
    }
  }

  const now = Date.now();
  clients.set(controller, {
    controller,
    connectedAt: now,
    lastActiveAt: now,
  });
  return true;
}

/**
 * Unregister an SSE client connection
 */
export function unregisterClient(controller: ReadableStreamDefaultController): void {
  clients.delete(controller);
}

/**
 * Broadcast an event to all connected SSE clients
 */
export function broadcast(event: SSEEvent): void {
  const encoder = new TextEncoder();
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = encoder.encode(data);

  for (const [ctrl, entry] of clients) {
    try {
      ctrl.enqueue(encoded);
      entry.lastActiveAt = Date.now();
    } catch (error) {
      // Client disconnected, remove it
      console.error('Failed to send SSE event to client:', error);
      clients.delete(ctrl);
    }
  }

  console.log(`[SSE] Broadcast ${event.type} to ${clients.size} client(s)`);
}

/**
 * Get the number of active SSE connections
 */
export function getActiveConnectionCount(): number {
  return clients.size;
}
