/**
 * MCP (Model Context Protocol) type definitions
 *
 * JSON-RPC 2.0 over stdio or SSE transport.
 * Covers tool schemas, server config, and protocol messages.
 */

// ── JSON-RPC 2.0 ──────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ── MCP Tool Schema ────────────────────────────────────────────

export interface MCPToolInputSchema {
  type: 'object';
  properties?: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    default?: unknown;
  }>;
  required?: string[];
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: MCPToolInputSchema;
}

export interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ── MCP Server Config (DB row) ─────────────────────────────────

export interface MCPServer {
  id: string;
  product_id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;       // stdio: shell command to spawn
  url?: string;           // sse: endpoint URL
  env_vars?: string;      // JSON: {"KEY": "value"}
  available_tools?: string; // JSON: MCPTool[]
  enabled: number;        // 0 | 1
  created_at: string;
  updated_at: string;
}

// ── MCP Call Marker (parsed from agent output) ─────────────────

export interface MCPCallMarker {
  server: string;   // server name
  tool: string;     // tool name
  args: Record<string, unknown>;
}

// ── MCP Server Presets ─────────────────────────────────────────

export interface MCPServerPreset {
  name: string;
  transport: 'stdio';
  command: string;
  description: string;
}

export const MCP_SERVER_PRESETS: MCPServerPreset[] = [
  {
    name: 'PostgreSQL',
    transport: 'stdio',
    command: 'npx @modelcontextprotocol/server-postgres',
    description: 'Query production database',
  },
  {
    name: 'GitHub',
    transport: 'stdio',
    command: 'npx @modelcontextprotocol/server-github',
    description: 'Issues, PRs, code search',
  },
  {
    name: 'Sentry',
    transport: 'stdio',
    command: 'npx @mcp/sentry-server',
    description: 'Error monitoring',
  },
  {
    name: 'Filesystem',
    transport: 'stdio',
    command: 'npx @modelcontextprotocol/server-filesystem',
    description: 'Read project files',
  },
];
