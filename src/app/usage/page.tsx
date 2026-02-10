'use client';

import { useState, useEffect, useCallback } from 'react';
import { AgentBanner } from '@/components/AgentBanner';
import { SkeletonList } from '@/components/LoadingSkeleton';
import { formatCost, formatTokens, getModelInfo } from '@/lib/cost';
import type { GatewayUsageResponse } from '@/lib/types';

type SortKey = 'tokens' | 'cost' | 'time';

const MODEL_COLOR_MAP: Record<string, string> = {
  purple: 'bg-mc-accent-purple/15 text-mc-accent-purple',
  accent: 'bg-mc-accent/15 text-mc-accent',
  cyan: 'bg-mc-accent-cyan/15 text-mc-accent-cyan',
  'text-secondary': 'bg-mc-bg-tertiary text-mc-text-secondary',
};

function modelBadgeClass(model: string): string {
  const info = getModelInfo(model);
  return MODEL_COLOR_MAP[info.color] ?? MODEL_COLOR_MAP['text-secondary'];
}

export default function UsagePage() {
  const [data, setData] = useState<GatewayUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('tokens');

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/usage');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GatewayUsageResponse;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    const id = setInterval(fetchUsage, 30_000);
    return () => clearInterval(id);
  }, [fetchUsage]);

  const sortedSessions = data?.sessions.slice().sort((a, b) => {
    if (sortBy === 'cost') return b.cost - a.cost;
    if (sortBy === 'time') return b.updatedAt - a.updatedAt;
    return b.totalTokens - a.totalTokens;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in">
      <AgentBanner />

      <h1 className="mt-6 text-lg font-semibold text-mc-text mb-4">Usage &amp; Cost</h1>

      {loading ? (
        <SkeletonList rows={6} />
      ) : error ? (
        <div className="text-center py-12 text-mc-text-secondary">
          <p className="text-lg mb-2">Failed to load usage data</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Total Tokens" value={formatTokens(data.totalTokens)} />
            <SummaryCard label="Estimated Cost" value={formatCost(data.totalCost)} />
            <SummaryCard label="Sessions" value={String(data.sessions.length)} />
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <p className="text-xs text-mc-text-secondary mb-1">Context Window</p>
              {data.context ? (
                <>
                  <p className="text-lg font-semibold text-mc-text">{data.context.percent}%</p>
                  <div className="w-full h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        data.context.percent > 80 ? 'bg-mc-accent-red' :
                        data.context.percent > 60 ? 'bg-mc-accent-yellow' :
                        'bg-mc-accent-green'
                      }`}
                      style={{ width: `${Math.min(100, data.context.percent)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-mc-text-secondary mt-1">
                    {formatTokens(data.context.used)} / {formatTokens(data.context.total)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-mc-text-secondary">No active session</p>
              )}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sessions table */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-mc-text">Sessions</h2>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-mc-text-secondary mr-1">Sort:</span>
                  {(['tokens', 'cost', 'time'] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        sortBy === key
                          ? 'bg-mc-accent/15 text-mc-accent'
                          : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
                      }`}
                    >
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {sortedSessions && sortedSessions.length > 0 ? (
                <div className="space-y-1">
                  {sortedSessions.map((session) => (
                    <div
                      key={session.key}
                      className="flex items-center gap-3 px-3 py-2.5 bg-mc-bg-secondary border border-mc-border rounded-lg hover:bg-mc-bg-tertiary/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-mc-text truncate">{session.displayName}</p>
                        <p className="text-[10px] text-mc-text-secondary">
                          {new Date(session.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${modelBadgeClass(session.model)}`}>
                        {getModelInfo(session.model).name}
                      </span>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-mc-text">{formatTokens(session.totalTokens)}</p>
                        <p className="text-[10px] text-mc-text-secondary">{formatCost(session.cost)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-mc-text-secondary text-center py-8">No sessions found</p>
              )}
            </div>

            {/* Model breakdown */}
            <div className="w-full lg:w-64 shrink-0">
              <h2 className="text-sm font-medium text-mc-text mb-3">By Model</h2>
              <div className="space-y-3">
                {Object.entries(data.models)
                  .sort(([, a], [, b]) => b.cost - a.cost)
                  .map(([name, breakdown]) => {
                    const pct = data.totalTokens > 0
                      ? Math.round((breakdown.tokens / data.totalTokens) * 100)
                      : 0;
                    return (
                      <div key={name} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-mc-text">{name}</span>
                          <span className="text-[10px] text-mc-text-secondary">{formatCost(breakdown.cost)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden mb-1.5">
                          <div
                            className="h-full bg-mc-accent rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-mc-text-secondary">
                          <span>{formatTokens(breakdown.tokens)}</span>
                          <span>{breakdown.sessions} session{breakdown.sessions !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
      <p className="text-xs text-mc-text-secondary mb-1">{label}</p>
      <p className="text-lg font-semibold text-mc-text">{value}</p>
    </div>
  );
}
