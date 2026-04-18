/**
 * MCP Server management for a product
 *
 * GET    /api/products/[id]/mcp           — list MCP servers
 * POST   /api/products/[id]/mcp           — add MCP server
 * PATCH  /api/products/[id]/mcp?serverId= — update MCP server
 * DELETE /api/products/[id]/mcp?serverId= — remove MCP server
 * POST   /api/products/[id]/mcp?action=test&serverId=      — test connection
 * POST   /api/products/[id]/mcp?action=discover&serverId=  — discover tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { testConnection, discoverTools } from '@/lib/mcp/client';
import type { MCPServer } from '@/lib/mcp/types';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ── GET — list MCP servers for a product ───────────────────────

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const product = queryOne<Product>('SELECT id FROM products WHERE id = ?', [id]);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const servers = queryAll<MCPServer>(
    'SELECT * FROM product_mcp_servers WHERE product_id = ? ORDER BY created_at ASC',
    [id],
  );

  // Parse available_tools JSON for each server
  const parsed = servers.map(s => ({
    ...s,
    available_tools: s.available_tools ? JSON.parse(s.available_tools) : [],
    env_vars: s.env_vars ? JSON.parse(s.env_vars) : {},
  }));

  return NextResponse.json(parsed);
}

// ── POST — add MCP server, or test/discover ────────────────────

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const serverId = searchParams.get('serverId');

  const product = queryOne<Product>('SELECT id FROM products WHERE id = ?', [id]);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  // ── Test connection ──
  if (action === 'test' && serverId) {
    const server = queryOne<MCPServer>(
      'SELECT * FROM product_mcp_servers WHERE id = ? AND product_id = ?',
      [serverId, id],
    );
    if (!server) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
    }

    const result = await testConnection(server);
    return NextResponse.json(result);
  }

  // ── Discover tools ──
  if (action === 'discover' && serverId) {
    const server = queryOne<MCPServer>(
      'SELECT * FROM product_mcp_servers WHERE id = ? AND product_id = ?',
      [serverId, id],
    );
    if (!server) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
    }

    try {
      const tools = await discoverTools(server);
      // Store discovered tools
      run(
        'UPDATE product_mcp_servers SET available_tools = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [JSON.stringify(tools), serverId],
      );
      return NextResponse.json({ tools });
    } catch (err) {
      return NextResponse.json(
        { error: `Tool discovery failed: ${(err as Error).message}` },
        { status: 502 },
      );
    }
  }

  // ── Add new MCP server ──
  try {
    const body = await request.json();
    const { name, transport, command, url, env_vars } = body as {
      name?: string;
      transport?: string;
      command?: string;
      url?: string;
      env_vars?: Record<string, string>;
    };

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (transport !== 'stdio' && transport !== 'sse') {
      return NextResponse.json({ error: 'transport must be "stdio" or "sse"' }, { status: 400 });
    }
    if (transport === 'stdio' && !command) {
      return NextResponse.json({ error: 'command is required for stdio transport' }, { status: 400 });
    }
    if (transport === 'sse' && !url) {
      return NextResponse.json({ error: 'url is required for sse transport' }, { status: 400 });
    }

    const servId = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO product_mcp_servers (id, product_id, name, transport, command, url, env_vars, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [servId, id, name, transport, command || null, url || null, env_vars ? JSON.stringify(env_vars) : null, now, now],
    );

    const created = queryOne<MCPServer>(
      'SELECT * FROM product_mcp_servers WHERE id = ?',
      [servId],
    );

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[MCP API] Error creating server:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PATCH — update MCP server ──────────────────────────────────

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get('serverId');

  if (!serverId) {
    return NextResponse.json({ error: 'serverId query param required' }, { status: 400 });
  }

  const existing = queryOne<MCPServer>(
    'SELECT * FROM product_mcp_servers WHERE id = ? AND product_id = ?',
    [serverId, id],
  );
  if (!existing) {
    return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.transport !== undefined) { updates.push('transport = ?'); values.push(body.transport); }
    if (body.command !== undefined) { updates.push('command = ?'); values.push(body.command); }
    if (body.url !== undefined) { updates.push('url = ?'); values.push(body.url); }
    if (body.env_vars !== undefined) {
      updates.push('env_vars = ?');
      values.push(typeof body.env_vars === 'string' ? body.env_vars : JSON.stringify(body.env_vars));
    }
    if (body.enabled !== undefined) { updates.push('enabled = ?'); values.push(body.enabled ? 1 : 0); }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push("updated_at = datetime('now')");
    values.push(serverId);

    run(
      `UPDATE product_mcp_servers SET ${updates.join(', ')} WHERE id = ?`,
      values,
    );

    const updated = queryOne<MCPServer>(
      'SELECT * FROM product_mcp_servers WHERE id = ?',
      [serverId],
    );
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[MCP API] Error updating server:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE — remove MCP server ─────────────────────────────────

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get('serverId');

  if (!serverId) {
    return NextResponse.json({ error: 'serverId query param required' }, { status: 400 });
  }

  const result = run(
    'DELETE FROM product_mcp_servers WHERE id = ? AND product_id = ?',
    [serverId, id],
  );

  if (result.changes === 0) {
    return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
