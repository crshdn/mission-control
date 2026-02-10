'use client';

import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { AgentBanner } from '@/components/AgentBanner';
import { SkeletonList } from '@/components/LoadingSkeleton';
import type { GatewaySearchResults } from '@/lib/types';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GatewaySearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/gateway/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((d: GatewaySearchResults) => setResults(d))
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const hasResults = results && (
    results.memories.length > 0 ||
    results.files.length > 0 ||
    results.sessions.length > 0 ||
    results.cron_jobs.length > 0
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 animate-fade-in">
      <AgentBanner />

      <div className="mt-6 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mc-text-secondary" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories, files, sessions, cron jobs..."
            className="w-full bg-mc-bg-secondary border border-mc-border rounded-lg pl-10 pr-4 py-3 text-sm text-mc-text placeholder:text-mc-text-secondary/50 focus:outline-none focus:border-mc-accent transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={5} />
      ) : !query.trim() ? (
        <div className="text-center py-12 text-mc-text-secondary">
          <p className="text-lg mb-2">Search across everything</p>
          <p className="text-sm">Memories, files, conversations, and scheduled tasks.</p>
        </div>
      ) : !hasResults ? (
        <div className="text-center py-12 text-mc-text-secondary">
          <p className="text-lg mb-2">No results</p>
          <p className="text-sm">Try a different query.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {results!.memories.length > 0 && (
            <ResultSection title="Memories" count={results!.memories.length}>
              {results!.memories.map((m, i) => (
                <div key={i} className="p-3 rounded bg-mc-bg-secondary border border-mc-border">
                  <p className="text-sm text-mc-text whitespace-pre-wrap">
                    <Highlight text={m.content} query={query} />
                  </p>
                  {m.session && (
                    <span className="text-[10px] text-mc-text-secondary mt-1 inline-block">
                      from: {m.session}
                    </span>
                  )}
                </div>
              ))}
            </ResultSection>
          )}

          {results!.files.length > 0 && (
            <ResultSection title="Files" count={results!.files.length}>
              {results!.files.map((f, i) => (
                <div key={i} className="p-3 rounded bg-mc-bg-secondary border border-mc-border">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-mono text-mc-accent truncate">{f.path}</span>
                    <span className="text-[10px] text-mc-text-secondary">:{f.line}</span>
                  </div>
                  {f.context && (
                    <p className="text-xs text-mc-text-secondary font-mono truncate">
                      <Highlight text={f.context} query={query} />
                    </p>
                  )}
                </div>
              ))}
            </ResultSection>
          )}

          {results!.sessions.length > 0 && (
            <ResultSection title="Conversations" count={results!.sessions.length}>
              {results!.sessions.map((s) => (
                <div key={s.sessionId ?? s.key} className="p-3 rounded bg-mc-bg-secondary border border-mc-border flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-mc-accent-green shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-mc-text truncate">
                      <Highlight text={s.displayName ?? s.key} query={query} />
                    </p>
                    <p className="text-[10px] text-mc-text-secondary">
                      {s.model ?? 'unknown'} &middot; {new Date(s.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </ResultSection>
          )}

          {results!.cron_jobs.length > 0 && (
            <ResultSection title="Tasks" count={results!.cron_jobs.length}>
              {results!.cron_jobs.map((j) => (
                <div key={j.id} className="p-3 rounded bg-mc-bg-secondary border border-mc-border">
                  <p className="text-sm text-mc-text">
                    <Highlight text={j.label} query={query} />
                  </p>
                  <p className="text-[10px] text-mc-text-secondary font-mono">
                    {j.schedule.expr} &middot; {j.enabled ? 'enabled' : 'disabled'}
                  </p>
                </div>
              ))}
            </ResultSection>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-mc-text mb-2">
        {title} <span className="text-mc-text-secondary font-normal">({count})</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-mc-accent/20 text-mc-accent rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
