// OpenClaw Gateway WebSocket Client

import { EventEmitter } from 'events';
import type { OpenClawMessage, OpenClawSessionInfo } from '../types';

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private connected = false;

  constructor(private url: string = GATEWAY_URL) {
    super();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.connected = true;
          this.emit('connected');
          console.log('[OpenClaw] Connected to Gateway');
          resolve();
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.emit('disconnected');
          console.log('[OpenClaw] Disconnected from Gateway');
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[OpenClaw] WebSocket error:', error);
          this.emit('error', error);
          if (!this.connected) {
            reject(new Error('Failed to connect to OpenClaw Gateway'));
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string) as OpenClawMessage;
            this.handleMessage(data);
          } catch (err) {
            console.error('[OpenClaw] Failed to parse message:', err);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleMessage(data: OpenClawMessage): void {
    // Handle RPC responses
    if (data.id !== undefined && this.pendingRequests.has(data.id)) {
      const { resolve, reject } = this.pendingRequests.get(data.id)!;
      this.pendingRequests.delete(data.id);

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
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      console.log('[OpenClaw] Attempting reconnect...');
      try {
        await this.connect();
      } catch (err) {
        console.error('[OpenClaw] Reconnect failed:', err);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to OpenClaw Gateway');
    }

    const id = ++this.messageId;
    const message: OpenClawMessage = { id, method, params };

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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
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
