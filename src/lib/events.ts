/**
 * Server-Sent Events (SSE) broadcaster for real-time updates
 * Manages client connections and broadcasts events to all listeners
 */

import type { SSEEvent } from './types';

// Store active SSE client connections
const clients = new Set<ReadableStreamDefaultController>();

/**
 * Register a new SSE client connection
 */
export function registerClient(controller: ReadableStreamDefaultController): void {
  clients.add(controller);
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
  if (clients.size === 0) {
    return; // No clients to broadcast to
  }

  const encoder = new TextEncoder();
  let data: string;
  try {
    data = `data: ${JSON.stringify(event)}\n\n`;
  } catch (error) {
    console.error('[SSE] Failed to serialize event:', error);
    return;
  }
  const encoded = encoder.encode(data);

  // Send to all connected clients
  const clientsArray = Array.from(clients);
  let successCount = 0;
  for (const client of clientsArray) {
    try {
      client.enqueue(encoded);
      successCount++;
    } catch (error) {
      // Client disconnected, remove it silently
      clients.delete(client);
    }
  }

  if (successCount > 0) {
    console.log(`[SSE] Broadcast ${event.type} to ${successCount}/${clientsArray.length} client(s)`);
  }
}

/**
 * Get the number of active SSE connections
 */
export function getActiveConnectionCount(): number {
  return clients.size;
}
