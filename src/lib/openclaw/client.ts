// OpenClaw Gateway WebSocket Client

import { EventEmitter } from 'events';
import type { OpenClawMessage, OpenClawSessionInfo } from '../types';
import { createHash } from 'crypto';

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

// Global deduplication cache that persists across module reloads in Next.js dev
// Use globalThis to ensure it's shared across all instances
// Using Map for LRU (access time tracking) instead of Set
const GLOBAL_EVENT_CACHE_KEY = '__openclaw_processed_events__';
const GLOBAL_CACHE_CLEANUP_KEY = '__openclaw_cache_cleanup_timer__';

if (!(GLOBAL_EVENT_CACHE_KEY in globalThis)) {
  (globalThis as Record<string, unknown>)[GLOBAL_EVENT_CACHE_KEY] = new Map<string, number>();
}

const globalProcessedEvents = (globalThis as unknown as Record<string, Map<string, number>>)[GLOBAL_EVENT_CACHE_KEY];

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string | number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private connected = false;
  private authenticated = false; // Track auth state separately from connection state
  private connecting: Promise<void> | null = null; // Lock to prevent multiple simultaneous connection attempts
  private autoReconnect = true;
  private token: string;
  private messageHandlers = new Set<(event: MessageEvent) => void>(); // Track all message handlers for cleanup
  private readonly MAX_PROCESSED_EVENTS = 1000; // Limit the size of the processed events cache
  private readonly CLEANUP_THRESHOLD = 100; // Number of entries to remove when limit exceeded
  private readonly CACHE_ENTRY_TTL_MS = 60 * 60 * 1000; // 1 hour TTL for cache entries
  private readonly PERIODIC_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes
  private periodicCleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Generate a unique event ID using content hashing for proper deduplication.
   * Uses SHA-256 hash of event type, sequence/run ID, and payload content.
   * This prevents collision from Date.now() and ensures events with same
   * structure but different content are not incorrectly deduplicated.
   */
  private generateEventId(data: any): string {
    // Create a canonical string representation of the event
    const canonical = JSON.stringify({
      type: data.type,
      seq: data.seq,
      runId: data.payload?.runId,
      stream: data.payload?.stream,
      event: data.event,
      // Include hash of payload for content-aware deduplication
      payloadHash: data.payload ? createHash('sha256').update(JSON.stringify(data.payload)).digest('hex').slice(0, 16) : null
    });

    // Hash the canonical representation for a fixed-length ID
    return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
  }

  /**
   * Perform LRU cleanup of the event cache.
   * Removes the oldest entries based on access time when size exceeds limit.
   * Also removes entries older than TTL to prevent unbounded growth.
   */
  private performCacheCleanup(): void {
    const now = Date.now();
    let removed = 0;
    const initialSize = globalProcessedEvents.size;

    // First, remove expired entries (older than TTL)
    const entries = Array.from(globalProcessedEvents.entries());
    for (const [eventId, timestamp] of entries) {
      if (now - timestamp > this.CACHE_ENTRY_TTL_MS) {
        globalProcessedEvents.delete(eventId);
        removed++;
      }
    }

    // Then, if still over limit, remove oldest entries (LRU)
    if (globalProcessedEvents.size > this.MAX_PROCESSED_EVENTS) {
      const entriesToRemove = globalProcessedEvents.size - this.MAX_PROCESSED_EVENTS + this.CLEANUP_THRESHOLD;

      // Sort by access time (oldest first) and remove
      const sortedEntries = Array.from(globalProcessedEvents.entries())
        .sort((a, b) => a[1] - b[1]);

      for (const [eventId] of sortedEntries) {
        if (removed >= entriesToRemove) break;
        globalProcessedEvents.delete(eventId);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[OpenClaw] Cache cleanup: removed ${removed} entries (size: ${initialSize} -> ${globalProcessedEvents.size})`);
    }
  }

  constructor(private url: string = GATEWAY_URL, token: string = GATEWAY_TOKEN) {
    super();
    this.token = token;
    // Prevent Node.js from throwing on unhandled 'error' events
    this.on('error', () => {});
    // Start periodic cleanup to prevent unbounded cache growth
    this.startPeriodicCleanup();
  }

  /**
   * Start periodic cleanup of the global event cache.
   * Uses a shared timer across all instances to avoid multiple timers.
   */
  private startPeriodicCleanup(): void {
    // Check if a cleanup timer already exists (shared across all instances)
    if (!(GLOBAL_CACHE_CLEANUP_KEY in globalThis)) {
      const timer = setInterval(() => {
        // Perform cleanup even if no new events have arrived
        this.performCacheCleanup();
      }, this.PERIODIC_CLEANUP_INTERVAL_MS);

      // Store the timer globally so all instances share it
      (globalThis as Record<string, unknown>)[GLOBAL_CACHE_CLEANUP_KEY] = timer;
      console.log('[OpenClaw] Started periodic cache cleanup (interval:', this.PERIODIC_CLEANUP_INTERVAL_MS, 'ms)');
    }

    // Keep a reference to stop it when the last instance disconnects
    this.periodicCleanupTimer = (globalThis as unknown as Record<string, NodeJS.Timeout>)[GLOBAL_CACHE_CLEANUP_KEY];
  }

  /**
   * Stop the periodic cleanup timer if this is the last instance.
   */
  private stopPeriodicCleanup(): void {
    // We don't stop the timer here since it's shared across instances
    // The timer will continue running as long as any instance exists
    // This is safe because the cleanup function is lightweight
  }

  async connect(): Promise<void> {
    // If already connected, return immediately
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // If a connection attempt is already in progress, wait for it
    if (this.connecting) {
      return this.connecting;
    }

    // Create a new connection attempt
    this.connecting = new Promise((resolve, reject) => {
      try {
        // Clean up any existing connection and handlers
        if (this.ws) {
          // Remove all tracked message handlers
          this.messageHandlers.clear();
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.onmessage = null;
          this.ws.onopen = null;
          if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
          }
          this.ws = null;
        }

        // Add token to URL query string for Gateway authentication
        const wsUrl = new URL(this.url);
        if (this.token) {
          wsUrl.searchParams.set('token', this.token);
        }
        console.log('[OpenClaw] Connecting to:', wsUrl.toString().replace(/token=[^&]+/, 'token=***'));
        console.log('[OpenClaw] Token in URL:', wsUrl.searchParams.has('token'));
        this.ws = new WebSocket(wsUrl.toString());

        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000); // 10 second connection timeout

        this.ws.onopen = async () => {
          clearTimeout(connectionTimeout);
          console.log('[OpenClaw] WebSocket opened, waiting for challenge...');
          // Don't send anything yet - wait for Gateway challenge
          // Token is in URL query string
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          const wasConnected = this.connected;
          this.connected = false;
          this.authenticated = false;
          this.connecting = null;
          this.messageHandlers.clear(); // Clear handlers on disconnect
          // Note: globalProcessedEvents is NOT cleared as it's shared across all instances
          this.emit('disconnected');
          // Log close reason for debugging
          console.log(`[OpenClaw] Disconnected from Gateway (code: ${event.code}, reason: "${event.reason}", wasClean: ${event.wasClean})`);
          // Only auto-reconnect if we were previously connected (not on initial connection failure)
          if (this.autoReconnect && wasConnected) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('[OpenClaw] WebSocket error');
          this.emit('error', error);
          if (!this.connected) {
            this.connecting = null;
            reject(new Error('Failed to connect to OpenClaw Gateway'));
          }
        };

        // Create message handler
        const messageHandler = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data as string);

            // Generate unique event ID using content hashing for proper deduplication
            const eventId = this.generateEventId(data);

            // Skip if we've already processed this event (using global cache for all instances)
            if (globalProcessedEvents.has(eventId)) {
              console.log('[OpenClaw] Skipping duplicate event:', eventId.slice(0, 16));
              return;
            }

            // Mark this event as processed in the global cache with current timestamp for LRU
            const now = Date.now();
            globalProcessedEvents.set(eventId, now);

            // Perform LRU cleanup if cache size exceeds limit
            this.performCacheCleanup();

            console.log('[OpenClaw] Received:', eventId.slice(0, 16));

            // Handle challenge-response authentication (OpenClaw RequestFrame format)
            if (data.type === 'event' && data.event === 'connect.challenge') {
              console.log('[OpenClaw] Challenge received, responding...');
              const requestId = crypto.randomUUID();
              const response = {
                type: 'req',
                id: requestId,
                method: 'connect',
                params: {
                  minProtocol: 3,
                  maxProtocol: 3,
                  client: {
                    id: 'gateway-client',
                    version: '1.0.0',
                    platform: 'web',
                    mode: 'ui'
                  },
                  auth: {
                    token: this.token
                  }
                }
              };

              // Set up response handler
              this.pendingRequests.set(requestId, {
                resolve: () => {
                  this.connected = true;
                  this.authenticated = true;
                  this.connecting = null;
                  this.emit('connected');
                  console.log('[OpenClaw] Authenticated successfully');
                  resolve();
                },
                reject: (error: Error) => {
                  this.connecting = null;
                  this.ws?.close();
                  reject(new Error(`Authentication failed: ${error.message}`));
                }
              });

              console.log('[OpenClaw] Sending challenge response');
              this.ws!.send(JSON.stringify(response));
              return;
            }

            // Handle RPC responses and other messages
            this.handleMessage(data as OpenClawMessage);
          } catch (err) {
            console.error('[OpenClaw] Failed to parse message:', err);
          }
        };

        // Track and assign the message handler
        this.messageHandlers.add(messageHandler);
        this.ws.onmessage = messageHandler;
      } catch (err) {
        this.connecting = null;
        reject(err);
      }
    });

    return this.connecting;
  }

  private handleMessage(data: OpenClawMessage & { type?: string; ok?: boolean; payload?: unknown }): void {
    // Handle OpenClaw ResponseFrame format (type: "res")
    if (data.type === 'res' && data.id !== undefined) {
      const requestId = data.id as string | number;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        const { resolve, reject } = pending;
        this.pendingRequests.delete(requestId);

        if (data.ok === false && data.error) {
          reject(new Error(data.error.message));
        } else {
          resolve(data.payload);
        }
        return;
      }
    }

    // Handle legacy JSON-RPC responses
    const legacyId = data.id as string | number | undefined;
    if (legacyId !== undefined && this.pendingRequests.has(legacyId)) {
      const { resolve, reject } = this.pendingRequests.get(legacyId)!;
      this.pendingRequests.delete(legacyId);

      if (data.error) {
        reject(new Error(data.error.message));
      } else {
        resolve(data.result);
      }
      return;
    }

    // Handle events/notifications
    if (data.method) {
      this.emit('notification', data);
      this.emit(data.method, data.params);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.autoReconnect) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.autoReconnect) return;

      console.log('[OpenClaw] Attempting reconnect...');
      try {
        await this.connect();
      } catch {
        // Don't spam logs on reconnect failure, just schedule another attempt
        this.scheduleReconnect();
      }
    }, 10000); // 10 seconds between reconnect attempts
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || !this.connected || !this.authenticated) {
      throw new Error('Not connected to OpenClaw Gateway');
    }

    const id = crypto.randomUUID();
    const message = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);

      this.ws!.send(JSON.stringify(message));
    });
  }

  // Session management methods
  async listSessions(): Promise<OpenClawSessionInfo[]> {
    return this.call<OpenClawSessionInfo[]>('sessions.list');
  }

  async getSessionHistory(sessionId: string): Promise<unknown[]> {
    return this.call<unknown[]>('sessions.history', { session_id: sessionId });
  }

  async sendMessage(sessionId: string, content: string): Promise<void> {
    await this.call('sessions.send', { session_id: sessionId, content });
  }

  async createSession(channel: string, peer?: string): Promise<OpenClawSessionInfo> {
    return this.call<OpenClawSessionInfo>('sessions.create', { channel, peer });
  }

  // Node methods (device capabilities)
  async listNodes(): Promise<unknown[]> {
    return this.call<unknown[]>('node.list');
  }

  async describeNode(nodeId: string): Promise<unknown> {
    return this.call('node.describe', { node_id: nodeId });
  }

  disconnect(): void {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.connecting = null;
    this.messageHandlers.clear(); // Clear all tracked handlers
    // Note: globalProcessedEvents is NOT cleared as it's shared across all instances
  }

  isConnected(): boolean {
    return this.connected && this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled;
    if (!enabled && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Singleton instance for server-side usage
let clientInstance: OpenClawClient | null = null;

export function getOpenClawClient(): OpenClawClient {
  if (!clientInstance) {
    clientInstance = new OpenClawClient();
  }
  return clientInstance;
}
