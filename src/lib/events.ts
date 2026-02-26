/**
 * Server-Sent Events (SSE) broadcaster for real-time updates
 * Manages client connections and broadcasts events to all listeners
 */

import type { SSEEvent } from './types';
import { relayMissionControlEventToDiscord } from './openclaw/discord-relay';

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
      console.error('Failed to send SSE event to client:', error);
      clients.delete(client);
    }
  }

  console.log(`[SSE] Broadcast ${event.type} to ${clients.size} client(s)`);

  // Fire-and-forget relay to Discord via OpenClaw (if enabled).
  void relayMissionControlEventToDiscord(event);
}

/**
 * Get the number of active SSE connections
 */
export function getActiveConnectionCount(): number {
  return clients.size;
}
