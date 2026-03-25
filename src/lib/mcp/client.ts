/**
 * MCP Client — connects to MCP servers via stdio or SSE transport
 *
 * Implements the Model Context Protocol (JSON-RPC 2.0):
 *   - initialize handshake
 *   - tools/list  (discover available tools)
 *   - tools/call  (execute a tool)
 */

import { spawn, type ChildProcess } from 'child_process';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  MCPTool,
  MCPToolCallResult,
  MCPServer,
} from './types';

// ── Helpers ────────────────────────────────────────────────────

let _nextId = 1;
function nextId(): number {
  return _nextId++;
}

function buildRequest(method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: '2.0', id: nextId(), method, params };
}

function parseEnvVars(envJson?: string): Record<string, string> {
  if (!envJson) return {};
  try {
    return JSON.parse(envJson);
  } catch {
    return {};
  }
}

// ── Stdio Transport ────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: JsonRpcResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 30_000;

export class StdioMCPClient {
  private proc: ChildProcess | null = null;
  private pending = new Map<number | string, PendingRequest>();
  private buffer = '';
  private initialized = false;

  constructor(private server: MCPServer) {}

  /** Spawn the child process and perform MCP initialize handshake */
  async connect(): Promise<void> {
    if (this.proc) return;

    const env = { ...process.env, ...parseEnvVars(this.server.env_vars) };
    const parts = this.server.command!.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    this.proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: true,
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr!.on('data', (chunk: Buffer) => {
      console.error(`[MCP:${this.server.name}:stderr]`, chunk.toString().trim());
    });

    this.proc.on('exit', (code) => {
      console.log(`[MCP:${this.server.name}] process exited with code ${code}`);
      this.cleanup();
    });

    this.proc.on('error', (err) => {
      console.error(`[MCP:${this.server.name}] spawn error:`, err.message);
      this.cleanup();
    });

    // MCP initialize handshake
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'autensa', version: '1.0.0' },
    });

    if (initResult.error) {
      throw new Error(`MCP initialize failed: ${initResult.error.message}`);
    }

    // Send initialized notification (no id — it's a notification)
    this.sendNotification('notifications/initialized');
    this.initialized = true;
  }

  /** List tools available on this MCP server */
  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) await this.connect();
    const res = await this.sendRequest('tools/list', {});
    if (res.error) {
      throw new Error(`tools/list failed: ${res.error.message}`);
    }
    const result = res.result as { tools?: MCPTool[] } | undefined;
    return result?.tools ?? [];
  }

  /** Call a tool on this MCP server */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.initialized) await this.connect();
    const res = await this.sendRequest('tools/call', { name, arguments: args });
    if (res.error) {
      return {
        content: [{ type: 'text', text: `Error: ${res.error.message}` }],
        isError: true,
      };
    }
    return res.result as MCPToolCallResult;
  }

  /** Cleanly shut down the MCP server */
  async disconnect(): Promise<void> {
    if (!this.proc) return;
    try {
      await this.sendRequest('shutdown', {});
      this.sendNotification('exit');
    } catch {
      // Best-effort
    }
    this.proc.kill('SIGTERM');
    this.cleanup();
  }

  // ── Internal ──

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin?.writable) {
        return reject(new Error('MCP process not running'));
      }
      const req = buildRequest(method, params);
      const timer = setTimeout(() => {
        this.pending.delete(req.id);
        reject(new Error(`MCP request ${method} timed out`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(req.id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.proc?.stdin?.writable) return;
    // Notifications have no id
    const msg = { jsonrpc: '2.0', method, params } as const;
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id != null && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!;
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          p.resolve(msg);
        }
        // Ignore notifications from server (no id)
      } catch {
        // Non-JSON line — ignore
      }
    }
  }

  private cleanup(): void {
    this.pending.forEach(p => {
      clearTimeout(p.timer);
      p.reject(new Error('MCP connection closed'));
    });
    this.pending.clear();
    this.proc = null;
    this.initialized = false;
    this.buffer = '';
  }
}

// ── SSE Transport ──────────────────────────────────────────────

export class SseMCPClient {
  private messageEndpoint: string | null = null;
  private initialized = false;
  private abortController: AbortController | null = null;
  private pendingResponses = new Map<number | string, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(private server: MCPServer) {}

  /** Connect to SSE endpoint and perform initialize handshake */
  async connect(): Promise<void> {
    if (this.initialized) return;

    const sseUrl = this.server.url!;
    this.abortController = new AbortController();

    // Open SSE connection to discover the message endpoint
    const messageEndpoint = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SSE connection timed out')), REQUEST_TIMEOUT_MS);

      fetch(sseUrl, {
        headers: { Accept: 'text/event-stream' },
        signal: this.abortController!.signal,
      }).then(async (res) => {
        if (!res.ok || !res.body) {
          clearTimeout(timer);
          return reject(new Error(`SSE connection failed: ${res.status}`));
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        const read = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) return;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: endpoint')) {
              // Next data line has the endpoint
              continue;
            }
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              // Check if this is the endpoint announcement
              if (data.startsWith('/') || data.startsWith('http')) {
                clearTimeout(timer);
                resolve(data);
                // Continue reading for responses
                this.startResponseReader(reader, decoder, buf);
                return;
              }
              // Otherwise it might be a JSON-RPC response
              try {
                const msg = JSON.parse(data) as JsonRpcResponse;
                if (msg.id != null && this.pendingResponses.has(msg.id)) {
                  const p = this.pendingResponses.get(msg.id)!;
                  clearTimeout(p.timer);
                  this.pendingResponses.delete(msg.id);
                  p.resolve(msg);
                }
              } catch {
                // Not JSON — ignore
              }
            }
          }
          await read();
        };
        read().catch(() => {});
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // Resolve relative endpoint against SSE URL
    const base = new URL(sseUrl);
    this.messageEndpoint = messageEndpoint.startsWith('http')
      ? messageEndpoint
      : `${base.origin}${messageEndpoint}`;

    // MCP initialize handshake
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'autensa', version: '1.0.0' },
    });

    if (initResult.error) {
      throw new Error(`MCP initialize failed: ${initResult.error.message}`);
    }

    // Send initialized notification
    await this.sendNotification('notifications/initialized');
    this.initialized = true;
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) await this.connect();
    const res = await this.sendRequest('tools/list', {});
    if (res.error) throw new Error(`tools/list failed: ${res.error.message}`);
    const result = res.result as { tools?: MCPTool[] } | undefined;
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.initialized) await this.connect();
    const res = await this.sendRequest('tools/call', { name, arguments: args });
    if (res.error) {
      return {
        content: [{ type: 'text', text: `Error: ${res.error.message}` }],
        isError: true,
      };
    }
    return res.result as MCPToolCallResult;
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    this.pendingResponses.forEach(p => {
      clearTimeout(p.timer);
      p.reject(new Error('SSE connection closed'));
    });
    this.pendingResponses.clear();
    this.initialized = false;
    this.messageEndpoint = null;
  }

  // ── Internal ──

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.messageEndpoint) throw new Error('SSE not connected — no message endpoint');

    const req = buildRequest(method, params);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(req.id);
        reject(new Error(`MCP SSE request ${method} timed out`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingResponses.set(req.id, { resolve, reject, timer });

      fetch(this.messageEndpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }).catch((err) => {
        clearTimeout(timer);
        this.pendingResponses.delete(req.id);
        reject(err);
      });
    });
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.messageEndpoint) return;
    const msg = { jsonrpc: '2.0', method, params };
    await fetch(this.messageEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch(() => {});
  }

  private startResponseReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    initialBuf: string,
  ): void {
    let buf = initialBuf;

    const read = async (): Promise<void> => {
      try {
        const { done, value } = await reader.read();
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            try {
              const msg = JSON.parse(data) as JsonRpcResponse;
              if (msg.id != null && this.pendingResponses.has(msg.id)) {
                const p = this.pendingResponses.get(msg.id)!;
                clearTimeout(p.timer);
                this.pendingResponses.delete(msg.id);
                p.resolve(msg);
              }
            } catch {
              // Not JSON — ignore
            }
          }
        }
        await read();
      } catch {
        // Stream ended or aborted
      }
    };
    read();
  }
}

// ── Factory ────────────────────────────────────────────────────

export type MCPClient = StdioMCPClient | SseMCPClient;

export function createMCPClient(server: MCPServer): MCPClient {
  if (server.transport === 'sse') {
    return new SseMCPClient(server);
  }
  return new StdioMCPClient(server);
}

/**
 * Connect to an MCP server, discover its tools, and disconnect.
 * Returns the list of tools for storage in product_mcp_servers.available_tools.
 */
export async function discoverTools(server: MCPServer): Promise<MCPTool[]> {
  const client = createMCPClient(server);
  try {
    await client.connect();
    const tools = await client.listTools();
    return tools;
  } finally {
    await client.disconnect();
  }
}

/**
 * Test connectivity to an MCP server.
 * Returns { ok: true, tools: number } or { ok: false, error: string }.
 */
export async function testConnection(server: MCPServer): Promise<{ ok: boolean; tools?: number; error?: string }> {
  try {
    const tools = await discoverTools(server);
    return { ok: true, tools: tools.length };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
