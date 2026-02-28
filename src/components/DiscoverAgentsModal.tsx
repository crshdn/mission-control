'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Download, Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { DiscoveredAgent } from '@/lib/types';

interface DiscoverAgentsModalProps {
  onClose: () => void;
  workspaceId?: string;
}

export function DiscoverAgentsModal({ onClose, workspaceId }: DiscoverAgentsModalProps) {
  const { addAgent } = useMissionControl();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  const discover = useCallback(async () => {
    setLoading(true);
    setError(null);
    setImportResult(null);

    try {
      const res = await fetch('/api/agents/discover');
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Failed to discover agents (${res.status})`);
        return;
      }
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err) {
      setError('Failed to connect to the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    discover();
  }, [discover]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllAvailable = () => {
    const available = agents.filter((a) => !a.already_imported).map((a) => a.id);
    setSelectedIds(new Set(available));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;

    setImporting(true);
    setError(null);

    try {
      const agentsToImport = agents
        .filter((a) => selectedIds.has(a.id))
        .map((a) => ({
          gateway_agent_id: a.id,
          name: a.name,
          model: a.model,
          workspace_id: workspaceId || 'default',
        }));

      const res = await fetch('/api/agents/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: agentsToImport }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to import agents');
        return;
      }

      const data = await res.json();

      // Add imported agents to the store
      for (const agent of data.imported) {
        addAgent(agent);
      }

      setImportResult({
        imported: data.imported.length,
        skipped: data.skipped.length,
      });

      // Refresh the discovery list
      await discover();
      setSelectedIds(new Set());
    } catch (err) {
      setError('Failed to import agents');
    } finally {
      setImporting(false);
    }
  };

  const availableCount = agents.filter((a) => !a.already_imported).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-t-xl sm:rounded-lg w-full max-w-2xl max-h-[88vh] sm:max-h-[80vh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search className="w-5 h-5 text-mc-accent" />
              Discover Gateway Agents
            </h2>
            <p className="text-sm text-mc-text-secondary mt-1">
              Import existing agents from the OpenClaw Gateway
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-mc-bg-tertiary rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-mc-accent mr-3" />
              <span className="text-mc-text-secondary">Discovering agents from Gateway...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}

          {importResult && (
            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg mb-4">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span className="text-sm text-green-400">
                Imported {importResult.imported} agent{importResult.imported !== 1 ? 's' : ''}
                {importResult.skipped > 0 && ` (${importResult.skipped} skipped)`}
              </span>
            </div>
          )}

          {!loading && !error && agents.length === 0 && (
            <div className="text-center py-12 text-mc-text-secondary">
              <p>No agents found in the Gateway.</p>
              <p className="text-sm mt-2">Make sure the OpenClaw Gateway is running and has agents configured.</p>
            </div>
          )}

          {!loading && agents.length > 0 && (
            <>
              {/* Selection controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-sm text-mc-text-secondary">
                  {agents.length} agent{agents.length !== 1 ? 's' : ''} found
                  {availableCount < agents.length && ` · ${agents.length - availableCount} already imported`}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={discover}
                    className="min-h-11 flex items-center gap-1 px-3 py-2 text-xs text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary rounded"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                  {availableCount > 0 && (
                    <>
                      <button
                        onClick={selectAllAvailable}
                        className="min-h-11 px-3 py-2 text-xs text-mc-accent hover:bg-mc-accent/10 rounded"
                      >
                        Select All
                      </button>
                      <button
                        onClick={deselectAll}
                        className="min-h-11 px-3 py-2 text-xs text-mc-text-secondary hover:bg-mc-bg-tertiary rounded"
                      >
                        Deselect All
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Agent list */}
              <div className="space-y-2">
                {agents.map((agent) => {
                  const isSelected = selectedIds.has(agent.id);
                  const isImported = agent.already_imported;

                  return (
                    <div
                      key={agent.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors min-h-11 ${
                        isImported
                          ? 'border-mc-border/50 bg-mc-bg/50 opacity-60'
                          : isSelected
                          ? 'border-mc-accent/50 bg-mc-accent/5'
                          : 'border-mc-border hover:border-mc-border/80 hover:bg-mc-bg-tertiary cursor-pointer'
                      }`}
                      onClick={() => !isImported && toggleSelection(agent.id)}
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isImported
                            ? 'border-green-500/50 bg-green-500/20'
                            : isSelected
                            ? 'border-mc-accent bg-mc-accent'
                            : 'border-mc-border'
                        }`}
                      >
                        {(isSelected || isImported) && (
                          <Check className={`w-3 h-3 ${isImported ? 'text-green-400' : 'text-mc-bg'}`} />
                        )}
                      </div>

                      {/* Avatar */}
                      <span className="text-2xl">{isImported ? '🔗' : '🤖'}</span>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{agent.name}</span>
                          {isImported && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                              Imported
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-mc-text-secondary mt-0.5">
                          {agent.model && <span>Model: {agent.model}</span>}
                          {agent.channel && <span>Channel: {agent.channel}</span>}
                          {agent.status && <span>Status: {agent.status}</span>}
                          <span className="text-mc-text-secondary/60">ID: {agent.id}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-mc-border">
          <span className="text-sm text-mc-text-secondary">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select agents to import'}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onClose}
              className="min-h-11 px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
            >
              {importResult ? 'Done' : 'Cancel'}
            </button>
            <button
              onClick={handleImport}
              disabled={selectedIds.size === 0 || importing}
              className="min-h-11 flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Import {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
