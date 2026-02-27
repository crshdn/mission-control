'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Coins, Cpu, Hash, Loader2, RefreshCw } from 'lucide-react';

interface AgentStats {
  agentId: string;
  agentName: string;
  sessionCount: number;
  totalTokens: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  estimatedCost: number;
  models: string[];
  sessions: Array<{
    id: string;
    channel: string;
    model: string;
    status: string;
  }>;
}

interface AgentStatsTabProps {
  agentId: string;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function AgentStatsTab({ agentId }: AgentStatsTabProps) {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/stats`);
      if (!res.ok) {
        throw new Error('Failed to load stats');
      }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-mc-accent animate-spin" />
        <span className="ml-3 text-mc-text-secondary">Loading stats...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-mc-text-secondary">
        <p className="mb-3">Failed to load stats</p>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-3 py-2 bg-mc-bg-tertiary rounded hover:bg-mc-border text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Total Tokens */}
        <div className="bg-mc-bg rounded-lg border border-mc-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-mc-accent" />
            <span className="text-xs text-mc-text-secondary uppercase tracking-wide">Total Tokens</span>
          </div>
          <div className="text-2xl font-bold text-mc-text">
            {formatTokenCount(stats.totalTokens)}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-mc-text-secondary">
            <span>In: {formatTokenCount(stats.totalTokensInput)}</span>
            <span>Out: {formatTokenCount(stats.totalTokensOutput)}</span>
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="bg-mc-bg rounded-lg border border-mc-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Coins className="w-4 h-4 text-mc-accent-yellow" />
            <span className="text-xs text-mc-text-secondary uppercase tracking-wide">Est. Cost</span>
          </div>
          <div className="text-2xl font-bold text-mc-accent-yellow">
            {formatCost(stats.estimatedCost)}
          </div>
          <div className="text-xs text-mc-text-secondary mt-2">
            USD (approximate)
          </div>
        </div>

        {/* Sessions */}
        <div className="bg-mc-bg rounded-lg border border-mc-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-4 h-4 text-mc-accent-purple" />
            <span className="text-xs text-mc-text-secondary uppercase tracking-wide">Sessions</span>
          </div>
          <div className="text-2xl font-bold text-mc-accent-purple">
            {stats.sessionCount}
          </div>
          <div className="text-xs text-mc-text-secondary mt-2">
            Active & historic
          </div>
        </div>

        {/* Model */}
        <div className="bg-mc-bg rounded-lg border border-mc-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-mc-accent-cyan" />
            <span className="text-xs text-mc-text-secondary uppercase tracking-wide">Model</span>
          </div>
          <div className="text-sm font-medium text-mc-text truncate" title={stats.models.join(', ')}>
            {stats.models.length > 0
              ? stats.models[0].split('/').pop()
              : 'Unknown'}
          </div>
          {stats.models.length > 1 && (
            <div className="text-xs text-mc-text-secondary mt-2">
              +{stats.models.length - 1} more
            </div>
          )}
        </div>
      </div>

      {/* Sessions List */}
      {stats.sessions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 text-mc-text-secondary uppercase tracking-wide">
            Gateway Sessions
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {stats.sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between bg-mc-bg rounded-lg border border-mc-border px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-mc-text truncate">
                    {session.id}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {session.channel && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-mc-bg-tertiary rounded text-mc-text-secondary">
                        {session.channel}
                      </span>
                    )}
                    {session.model && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-mc-accent/10 rounded text-mc-accent">
                        {session.model.split('/').pop()}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded capitalize ${
                    session.status === 'active'
                      ? 'bg-mc-accent-green/20 text-mc-accent-green'
                      : 'bg-mc-bg-tertiary text-mc-text-secondary'
                  }`}
                >
                  {session.status || 'unknown'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refresh button */}
      <div className="flex justify-center">
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-4 py-2 bg-mc-bg-tertiary rounded-lg hover:bg-mc-border text-sm text-mc-text-secondary hover:text-mc-text transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Stats
        </button>
      </div>
    </div>
  );
}
