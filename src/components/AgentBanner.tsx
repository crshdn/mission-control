'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { GatewaySessionStatus } from '@/lib/types';

type StatusPayload = GatewaySessionStatus & { error?: string };

export function AgentBanner() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [npmVersion, setNpmVersion] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('mc-banner-expanded') === '1';
  });

  const fetchData = useCallback(() => {
    fetch('/api/gateway/status')
      .then((r) => r.json())
      .then((d: StatusPayload) => setStatus(d))
      .catch(() => setStatus(null));
    fetch('/api/gateway/npm-version?pkg=openclaw')
      .then((r) => r.json())
      .then((d: { version: string }) => setNpmVersion(d.version))
      .catch(() => setNpmVersion(null));
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    localStorage.setItem('mc-banner-expanded', expanded ? '1' : '0');
  }, [expanded]);

  if (!status || status.error) return null;

  const isUpToDate = npmVersion && status.version && npmVersion === status.version;
  const ctx = status.context_usage;

  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg animate-fade-in">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-mc-bg-tertiary/50 transition-colors rounded-lg"
      >
        <span className="text-lg">🤖</span>
        <span className="font-medium text-mc-text">{status.agent_name ?? 'OpenClaw Agent'}</span>
        {status.version && (
          <span className="text-xs text-mc-text-secondary">v{status.version}</span>
        )}
        {npmVersion && status.version && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              isUpToDate
                ? 'bg-mc-accent-green/15 text-mc-accent-green'
                : 'bg-mc-accent-yellow/15 text-mc-accent-yellow'
            }`}
          >
            {isUpToDate ? 'up to date' : `latest: ${npmVersion}`}
          </span>
        )}
        <span className="ml-auto text-mc-text-secondary">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-mc-border pt-3 animate-fade-in">
          {/* Stats row */}
          <div className="flex flex-wrap gap-4 text-sm">
            {status.model && (
              <Stat label="Model" value={status.model} />
            )}
            {ctx && (
              <div className="flex items-center gap-2">
                <span className="text-mc-text-secondary text-xs">Context</span>
                <div className="w-24 h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-mc-accent rounded-full transition-all"
                    style={{ width: `${Math.min(100, ctx.percent)}%` }}
                  />
                </div>
                <span className="text-xs text-mc-text-secondary">
                  {ctx.percent}%
                </span>
              </div>
            )}
            {status.session_key && (
              <Stat label="Session" value={status.session_key} />
            )}
            {status.runtime_mode && (
              <Stat label="Mode" value={status.runtime_mode} />
            )}
          </div>

          {/* Raw status text */}
          {status.raw && (
            <Section title="Raw Status">
              <pre className="text-xs text-mc-text-secondary font-mono whitespace-pre-wrap bg-mc-bg rounded p-2 border border-mc-border max-h-40 overflow-auto">
                {status.raw}
              </pre>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-mc-text-secondary text-xs">{label}</span>
      <span className="text-mc-text text-xs font-medium">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs text-mc-text-secondary mb-1.5">{title}</h4>
      {children}
    </div>
  );
}

