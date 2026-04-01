/**
 * MCP Proxy — intercepts %%MCP_CALL%% markers from agent output,
 * executes tool calls against configured MCP servers, returns results.
 *
 * Marker format:
 *   %%MCP_CALL%%{"server":"sentry","tool":"get_issues","args":{...}}%%END%%
 */

import { queryAll } from '@/lib/db';
import { createMCPClient } from './client';
import type { MCPServer, MCPCallMarker, MCPToolCallResult } from './types';

const MCP_CALL_RE = /%%MCP_CALL%%([\s\S]*?)%%END%%/g;

/**
 * Parse all %%MCP_CALL%% markers from a text string.
 */
export function parseMCPCalls(text: string): MCPCallMarker[] {
  const markers: MCPCallMarker[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  MCP_CALL_RE.lastIndex = 0;
  while ((match = MCP_CALL_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as MCPCallMarker;
      if (parsed.server && parsed.tool) {
        markers.push({
          server: parsed.server,
          tool: parsed.tool,
          args: parsed.args || {},
        });
      }
    } catch {
      console.warn('[MCP Proxy] Failed to parse MCP_CALL marker:', match[1]);
    }
  }

  return markers;
}

/**
 * Execute a single MCP call against the matching server for a product.
 */
export async function executeMCPCall(
  productId: string,
  marker: MCPCallMarker,
): Promise<MCPToolCallResult> {
  // Find the server by name for this product
  const server = queryAll<MCPServer>(
    'SELECT * FROM product_mcp_servers WHERE product_id = ? AND name = ? AND enabled = 1',
    [productId, marker.server],
  )[0];

  if (!server) {
    return {
      content: [{ type: 'text', text: `MCP server "${marker.server}" not found or disabled for this product.` }],
      isError: true,
    };
  }

  const client = createMCPClient(server);
  try {
    await client.connect();
    const result = await client.callTool(marker.tool, marker.args);
    return result;
  } catch (err) {
    return {
      content: [{ type: 'text', text: `MCP call failed: ${(err as Error).message}` }],
      isError: true,
    };
  } finally {
    await client.disconnect();
  }
}

/**
 * Process agent output: find all %%MCP_CALL%% markers, execute them,
 * and return the original text with markers replaced by results.
 */
export async function processMCPCalls(
  productId: string,
  text: string,
): Promise<{ processed: string; callCount: number }> {
  const markers = parseMCPCalls(text);
  if (markers.length === 0) {
    return { processed: text, callCount: 0 };
  }

  let processed = text;
  let callCount = 0;

  // Reset lastIndex for replacement pass
  MCP_CALL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  const replacements: Array<{ full: string; result: string }> = [];

  MCP_CALL_RE.lastIndex = 0;
  while ((match = MCP_CALL_RE.exec(text)) !== null) {
    const marker = markers[callCount];
    if (!marker) break;

    const result = await executeMCPCall(productId, marker);
    const resultText = result.content
      .map(c => c.text || '[non-text content]')
      .join('\n');

    replacements.push({
      full: match[0],
      result: result.isError
        ? `[MCP Error: ${resultText}]`
        : `[MCP Result from ${marker.server}.${marker.tool}]:\n${resultText}`,
    });

    callCount++;
  }

  // Apply replacements
  for (const { full, result } of replacements) {
    processed = processed.replace(full, result);
  }

  return { processed, callCount };
}

/**
 * Format MCP tool descriptions for injection into a dispatch message.
 * Returns empty string if no MCP servers are configured/enabled.
 */
export function formatMCPToolsForDispatch(productId: string): string {
  const servers = queryAll<MCPServer>(
    'SELECT * FROM product_mcp_servers WHERE product_id = ? AND enabled = 1',
    [productId],
  );

  if (servers.length === 0) return '';

  const toolLines: string[] = [];

  for (const server of servers) {
    if (!server.available_tools) continue;
    try {
      const tools = JSON.parse(server.available_tools) as Array<{ name: string; description?: string; inputSchema?: { properties?: Record<string, { type: string; description?: string }> } }>;
      for (const tool of tools) {
        const params = tool.inputSchema?.properties
          ? Object.keys(tool.inputSchema.properties).join(', ')
          : '';
        const desc = tool.description || 'No description';
        toolLines.push(`- ${server.name}.${tool.name}(${params}) — ${desc}`);
      }
    } catch {
      // Skip servers with malformed tool schemas
    }
  }

  if (toolLines.length === 0) return '';

  return `
---
## Available External Tools (MCP)

You have access to these external tools via the MCP protocol:
${toolLines.join('\n')}

To use them, output: %%MCP_CALL%%{"server":"<server_name>","tool":"<tool_name>","args":{...}}%%END%%
Mission Control will execute the call and return the result.
`;
}
