'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { Play, Loader2, Clock } from 'lucide-react';
import type { ResearchCycle } from '@/lib/types';

interface ResearchReportProps {
  productId: string;
}

function formatElapsed(startedAt: string, nowMs: number): string {
  const ms = nowMs - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

export function ResearchReport({ productId }: ResearchReportProps) {
  const [cycles, setCycles] = useState<ResearchCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const loadCycles = useCallback(async (): Promise<ResearchCycle[]> => {
    try {
      const res = await fetch(`/api/products/${productId}/research/cycles`);
      if (!res.ok) return [];
      const data = await res.json() as ResearchCycle[];
      setCycles(data);
      return data;
    } catch (error) {
      logger.error('Failed to load cycles:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void loadCycles(); }, [loadCycles]);

  const activeCycle = cycles.find(c => c.status === 'running') || null;

  // Poll while running
  useEffect(() => {
    if (!activeCycle) return;
    const interval = setInterval(() => { void loadCycles(); }, 4000);
    return () => clearInterval(interval);
  }, [activeCycle, loadCycles]);

  // Tick every second for elapsed timer
  useEffect(() => {
    if (!activeCycle) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeCycle]);

  const handleRunResearch = async () => {
    setStarting(true);
    try {
      await fetch(`/api/products/${productId}/research/run`, { method: 'POST' });
      await loadCycles();
    } catch (error) {
      logger.error('Failed to start research:', error);
    } finally {
      setStarting(false);
    }
  };

  const handleRunIdeation = async (cycleId: string) => {
    try {
      await fetch(`/api/products/${productId}/ideation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle_id: cycleId }),
      });
    } catch (error) {
      logger.error('Failed to start ideation:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-mc-text">Research Cycles</h3>
        <button
          onClick={handleRunResearch}
          disabled={starting || !!activeCycle}
          className="min-h-11 px-4 rounded-lg bg-mc-accent text-white hover:bg-mc-accent/90 disabled:opacity-50 flex items-center gap-2 text-sm"
        >
          {(starting || !!activeCycle) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {(starting || !!activeCycle) ? 'Research Running...' : 'Run Research'}
        </button>
      </div>

      {activeCycle && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-blue-300 font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            Research in progress
          </div>
          <div className="mt-1 text-mc-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Elapsed: {formatElapsed(activeCycle.started_at, nowMs)}</span>
            <span>Phase: {activeCycle.current_phase || 'running'}</span>
            <span>Started: {new Date(activeCycle.started_at).toLocaleTimeString()}</span>
          </div>
          <p className="mt-2 text-xs text-mc-text-secondary">
            Not stuck — research can take a few minutes. Live steps appear in the Activity panel on the right.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-mc-text-secondary animate-pulse">Loading cycles...</div>
      ) : cycles.length === 0 ? (
        <div className="text-center py-12 text-mc-text-secondary">No research cycles yet. Click &quot;Run Research&quot; to start.</div>
      ) : (
        <div className="space-y-3">
          {cycles.map(cycle => (
            <div key={cycle.id} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    cycle.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    cycle.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                    cycle.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-mc-bg-tertiary text-mc-text-secondary'
                  }`}>
                    {cycle.status}
                  </span>
                  <span className="text-sm text-mc-text-secondary">
                    {new Date(cycle.started_at).toLocaleDateString()} {new Date(cycle.started_at).toLocaleTimeString()}
                  </span>
                  {cycle.status === 'running' && (
                    <span className="text-xs text-blue-300">phase: {cycle.current_phase || 'running'}</span>
                  )}
                  {cycle.ideas_generated > 0 && (
                    <span className="text-xs text-mc-text-secondary">{cycle.ideas_generated} ideas</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {cycle.status === 'completed' && (
                    <button
                      onClick={() => handleRunIdeation(cycle.id)}
                      className="text-xs px-3 py-1.5 rounded bg-mc-accent/20 text-mc-accent hover:bg-mc-accent/30"
                    >
                      Generate Ideas
                    </button>
                  )}
                  <button
                    onClick={() => setExpanded(expanded === cycle.id ? null : cycle.id)}
                    className="text-xs text-mc-text-secondary hover:text-mc-text"
                  >
                    {expanded === cycle.id ? 'Collapse' : 'View Report'}
                  </button>
                </div>
              </div>
              {cycle.error_message && (
                <p className="text-sm text-red-400">{cycle.error_message}</p>
              )}
              {expanded === cycle.id && cycle.report && (
                <pre className="mt-3 p-3 bg-mc-bg rounded text-xs text-mc-text-secondary overflow-auto max-h-96 whitespace-pre-wrap">
                  {JSON.stringify(JSON.parse(cycle.report), null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
