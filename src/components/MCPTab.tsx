'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Terminal,
  Globe,
  ChevronDown,
  ChevronRight,
  Loader,
  CheckCircle,
  XCircle,
  Power,
  PowerOff,
} from 'lucide-react';

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

interface MCPServerRow {
  id: string;
  product_id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  url?: string;
  env_vars: Record<string, string>;
  available_tools: MCPTool[];
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface MCPServerPreset {
  name: string;
  transport: 'stdio';
  command: string;
  description: string;
}

const PRESETS: MCPServerPreset[] = [
  { name: 'PostgreSQL', transport: 'stdio', command: 'npx @modelcontextprotocol/server-postgres', description: 'Query production database' },
  { name: 'GitHub', transport: 'stdio', command: 'npx @modelcontextprotocol/server-github', description: 'Issues, PRs, code search' },
  { name: 'Sentry', transport: 'stdio', command: 'npx @mcp/sentry-server', description: 'Error monitoring' },
  { name: 'Filesystem', transport: 'stdio', command: 'npx @modelcontextprotocol/server-filesystem', description: 'Read project files' },
];

interface Props {
  productId: string;
}

export function MCPTab({ productId }: Props) {
  const [servers, setServers] = useState<MCPServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; tools?: number; error?: string }>>({});
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  // Add form state
  const [addForm, setAddForm] = useState({
    name: '',
    transport: 'stdio' as 'stdio' | 'sse',
    command: '',
    url: '',
    env_vars: '',
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/${productId}/mcp`);
      if (res.ok) {
        setServers(await res.json());
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  async function handleAdd() {
    setAdding(true);
    setAddError(null);
    try {
      let envVars: Record<string, string> = {};
      if (addForm.env_vars.trim()) {
        envVars = JSON.parse(addForm.env_vars);
      }

      const res = await fetch(`/api/products/${productId}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          transport: addForm.transport,
          command: addForm.transport === 'stdio' ? addForm.command : undefined,
          url: addForm.transport === 'sse' ? addForm.url : undefined,
          env_vars: envVars,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to add server' }));
        throw new Error(err.error);
      }

      setAddForm({ name: '', transport: 'stdio', command: '', url: '', env_vars: '' });
      setShowAdd(false);
      await fetchServers();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(serverId: string) {
    const res = await fetch(`/api/products/${productId}/mcp?serverId=${serverId}`, { method: 'DELETE' });
    if (res.ok) {
      setServers(prev => prev.filter(s => s.id !== serverId));
    }
  }

  async function handleToggle(serverId: string, enabled: boolean) {
    await fetch(`/api/products/${productId}/mcp?serverId=${serverId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    setServers(prev => prev.map(s => s.id === serverId ? { ...s, enabled: enabled ? 1 : 0 } : s));
  }

  async function handleTest(serverId: string) {
    setTesting(prev => ({ ...prev, [serverId]: true }));
    try {
      const res = await fetch(`/api/products/${productId}/mcp?action=test&serverId=${serverId}`, {
        method: 'POST',
      });
      const result = await res.json();
      setTestResults(prev => ({ ...prev, [serverId]: result }));
    } catch {
      setTestResults(prev => ({ ...prev, [serverId]: { ok: false, error: 'Request failed' } }));
    } finally {
      setTesting(prev => ({ ...prev, [serverId]: false }));
    }
  }

  async function handleDiscover(serverId: string) {
    setDiscovering(prev => ({ ...prev, [serverId]: true }));
    try {
      const res = await fetch(`/api/products/${productId}/mcp?action=discover&serverId=${serverId}`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchServers();
      }
    } finally {
      setDiscovering(prev => ({ ...prev, [serverId]: false }));
    }
  }

  function applyPreset(preset: MCPServerPreset) {
    setAddForm({
      name: preset.name,
      transport: preset.transport,
      command: preset.command,
      url: '',
      env_vars: '',
    });
    setShowAdd(true);
  }

  const inputClass =
    'w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2 text-sm text-mc-text placeholder:text-mc-text-secondary/50 focus:outline-none focus:border-mc-accent';
  const labelClass = 'block text-xs font-medium text-mc-text-secondary uppercase tracking-wider mb-1.5';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-mc-text-secondary">
        <Loader className="w-5 h-5 animate-spin mr-2" /> Loading MCP servers...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-mc-text">MCP Integrations</h3>
          <p className="text-xs text-mc-text-secondary mt-0.5">
            Connect external tools via the Model Context Protocol. Agents can use these tools during tasks.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 rounded-lg bg-mc-accent text-white text-sm font-medium hover:bg-mc-accent/90 flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add Server
        </button>
      </div>

      {/* Presets */}
      {servers.length === 0 && !showAdd && (
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <p className="text-xs text-mc-text-secondary mb-3">Quick start with a preset:</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(preset => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="text-left px-3 py-2 rounded-lg border border-mc-border bg-mc-bg hover:border-mc-accent/50 transition-colors"
              >
                <span className="text-sm text-mc-text font-medium">{preset.name}</span>
                <span className="block text-xs text-mc-text-secondary mt-0.5">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-mc-text">Add MCP Server</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Sentry"
              />
            </div>
            <div>
              <label className={labelClass}>Transport</label>
              <select
                value={addForm.transport}
                onChange={e => setAddForm(f => ({ ...f, transport: e.target.value as 'stdio' | 'sse' }))}
                className={inputClass}
              >
                <option value="stdio">stdio (local command)</option>
                <option value="sse">SSE (remote endpoint)</option>
              </select>
            </div>
          </div>

          {addForm.transport === 'stdio' ? (
            <div>
              <label className={labelClass}>Command</label>
              <input
                type="text"
                value={addForm.command}
                onChange={e => setAddForm(f => ({ ...f, command: e.target.value }))}
                className={inputClass}
                placeholder="npx @modelcontextprotocol/server-postgres"
              />
            </div>
          ) : (
            <div>
              <label className={labelClass}>SSE Endpoint URL</label>
              <input
                type="url"
                value={addForm.url}
                onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))}
                className={inputClass}
                placeholder="https://mcp.example.com/sse"
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Environment Variables (JSON)</label>
            <input
              type="text"
              value={addForm.env_vars}
              onChange={e => setAddForm(f => ({ ...f, env_vars: e.target.value }))}
              className={inputClass}
              placeholder='{"DATABASE_URL": "postgres://..."}'
            />
          </div>

          {addError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
              {addError}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setAddError(null); }}
              className="px-3 py-1.5 rounded-lg text-sm text-mc-text-secondary hover:text-mc-text"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || !addForm.name || (addForm.transport === 'stdio' ? !addForm.command : !addForm.url)}
              className="px-3 py-1.5 rounded-lg bg-mc-accent text-white text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {adding ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Server List */}
      {servers.map(server => {
        const expanded = expandedServer === server.id;
        const testResult = testResults[server.id];
        const tools = server.available_tools || [];

        return (
          <div
            key={server.id}
            className="bg-mc-bg-secondary border border-mc-border rounded-lg overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => setExpandedServer(expanded ? null : server.id)}
                className="text-mc-text-secondary hover:text-mc-text"
              >
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {server.transport === 'stdio' ? (
                <Terminal className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
              ) : (
                <Globe className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-mc-text">{server.name}</span>
                <span className="ml-2 text-xs text-mc-text-secondary">
                  {server.transport === 'stdio' ? server.command : server.url}
                </span>
              </div>

              <span className="text-xs text-mc-text-secondary">
                {tools.length} tool{tools.length !== 1 ? 's' : ''}
              </span>

              {/* Toggle */}
              <button
                onClick={() => handleToggle(server.id, !server.enabled)}
                className={`p-1 rounded ${server.enabled ? 'text-green-400 hover:text-green-300' : 'text-mc-text-secondary hover:text-mc-text'}`}
                title={server.enabled ? 'Disable' : 'Enable'}
              >
                {server.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
              </button>

              {/* Test */}
              <button
                onClick={() => handleTest(server.id)}
                disabled={testing[server.id]}
                className="p-1 rounded text-mc-text-secondary hover:text-mc-text"
                title="Test connection"
              >
                {testing[server.id] ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
              </button>

              {/* Discover */}
              <button
                onClick={() => handleDiscover(server.id)}
                disabled={discovering[server.id]}
                className="p-1 rounded text-mc-text-secondary hover:text-mc-text"
                title="Discover tools"
              >
                {discovering[server.id] ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(server.id)}
                className="p-1 rounded text-red-400/60 hover:text-red-400"
                title="Remove server"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Test result banner */}
            {testResult && (
              <div className={`mx-4 mb-2 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${
                testResult.ok
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}>
                {testResult.ok ? (
                  <><CheckCircle className="w-3.5 h-3.5" /> Connected — {testResult.tools} tools available</>
                ) : (
                  <><XCircle className="w-3.5 h-3.5" /> {testResult.error}</>
                )}
              </div>
            )}

            {/* Expanded: Tool list */}
            {expanded && tools.length > 0 && (
              <div className="border-t border-mc-border px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-mc-text-secondary uppercase tracking-wider">Available Tools</p>
                {tools.map(tool => (
                  <div key={tool.name} className="pl-3 border-l-2 border-mc-border">
                    <span className="text-sm text-mc-accent font-mono">{tool.name}</span>
                    {tool.description && (
                      <span className="text-xs text-mc-text-secondary ml-2">{tool.description}</span>
                    )}
                    {tool.inputSchema?.properties && (
                      <div className="mt-1 text-xs text-mc-text-secondary font-mono">
                        ({Object.entries(tool.inputSchema.properties)
                          .map(([k, v]) => `${k}: ${v.type}`)
                          .join(', ')})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {expanded && tools.length === 0 && (
              <div className="border-t border-mc-border px-4 py-3">
                <p className="text-xs text-mc-text-secondary">
                  No tools discovered yet. Click <RefreshCw className="w-3 h-3 inline" /> to discover tools.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {servers.length === 0 && !showAdd && (
        <p className="text-xs text-mc-text-secondary text-center py-4">
          No MCP servers configured. Add one to give agents access to external tools.
        </p>
      )}
    </div>
  );
}
