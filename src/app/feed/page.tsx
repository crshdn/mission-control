'use client';

import { useState, useEffect, useCallback } from 'react';
import { AgentBanner } from '@/components/AgentBanner';
import { SkeletonTimeline } from '@/components/LoadingSkeleton';
import type { GatewaySession, GatewayHistoryMessage, GatewayMessagePart } from '@/lib/types';

type Filter = 'all' | 'tool' | 'assistant' | 'user';

type FeedEntry = {
  sessionKey: string;
  role: string;
  timestamp: number;
  type: 'text' | 'toolCall';
  content: string;
  toolName?: string;
  toolArgs?: string;
};

export default function FeedPage() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  const fetchFeed = useCallback(async () => {
    try {
      const sessRes = await fetch('/api/gateway/sessions');
      if (!sessRes.ok) { setLoading(false); return; }
      const sessions: GatewaySession[] = await sessRes.json();

      const recentSessions = sessions
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10);

      const allEntries: FeedEntry[] = [];

      const historyResults = await Promise.allSettled(
        recentSessions.map((s) =>
          fetch(`/api/gateway/sessions/${s.sessionId}/history`).then((r) =>
            r.ok ? r.json() : [],
          ),
        ),
      );

      for (let si = 0; si < recentSessions.length; si++) {
        const sess = recentSessions[si];
        const result = historyResults[si];
        if (result.status !== 'fulfilled') continue;
        const messages: GatewayHistoryMessage[] = result.value;

        for (let mi = 0; mi < messages.length; mi++) {
          const msg = messages[mi];
          const ts = msg.timestamp ?? sess.updatedAt - (messages.length - mi) * 1000;

          if (typeof msg.content === 'string') {
            allEntries.push({
              sessionKey: sess.key,
              role: msg.role,
              timestamp: ts,
              type: 'text',
              content: msg.content,
            });
          } else if (Array.isArray(msg.content)) {
            for (const part of msg.content as GatewayMessagePart[]) {
              if (part.type === 'toolCall') {
                allEntries.push({
                  sessionKey: sess.key,
                  role: msg.role,
                  timestamp: ts,
                  type: 'toolCall',
                  content: part.name ?? 'unknown tool',
                  toolName: part.name,
                  toolArgs: part.arguments,
                });
              } else {
                allEntries.push({
                  sessionKey: sess.key,
                  role: msg.role,
                  timestamp: ts,
                  type: 'text',
                  content: part.text ?? '',
                });
              }
            }
          }
        }
      }

      allEntries.sort((a, b) => b.timestamp - a.timestamp);
      setEntries(allEntries);
    } catch {
      // keep existing entries on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const id = setInterval(fetchFeed, 30_000);
    return () => clearInterval(id);
  }, [fetchFeed]);

  const filtered = entries.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'tool') return e.type === 'toolCall';
    if (filter === 'assistant') return e.role === 'assistant' && e.type === 'text';
    if (filter === 'user') return e.role === 'user';
    return true;
  });

  const toggleTool = (idx: number) =>
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 animate-fade-in">
      <AgentBanner />

      <div className="mt-6 flex items-center gap-2 mb-4">
        <h1 className="text-lg font-semibold text-mc-text mr-4">Activity Feed</h1>
        {(['all', 'tool', 'assistant', 'user'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === f
                ? 'bg-mc-accent/15 text-mc-accent'
                : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
            }`}
          >
            {f === 'all' ? 'All' : f === 'tool' ? 'Tools' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonTimeline rows={10} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-mc-text-secondary">
          <p className="text-lg mb-2">No activity yet</p>
          <p className="text-sm">Gateway messages will appear here as they come in.</p>
        </div>
      ) : (
        <div className="space-y-0">
          {filtered.map((entry, idx) => (
            <div key={idx} className="flex gap-3 group">
              <div className="flex flex-col items-center">
                <DotIcon type={entry.type} role={entry.role} />
                {idx < filtered.length - 1 && (
                  <div className="w-px flex-1 bg-mc-border group-hover:bg-mc-border/80 mt-1" />
                )}
              </div>
              <div className="flex-1 pb-4 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[10px] text-mc-text-secondary">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-[10px] text-mc-text-secondary/50 truncate">
                    {entry.sessionKey}
                  </span>
                </div>
                {entry.type === 'toolCall' ? (
                  <div>
                    <button
                      onClick={() => toggleTool(idx)}
                      className="text-sm text-mc-accent hover:underline"
                    >
                      {entry.toolName}
                    </button>
                    {expandedTools.has(idx) && entry.toolArgs && (
                      <pre className="mt-1 text-xs text-mc-text-secondary bg-mc-bg rounded p-2 overflow-x-auto max-h-40 border border-mc-border">
                        {formatArgs(entry.toolArgs)}
                      </pre>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-mc-text whitespace-pre-wrap break-words line-clamp-6">
                    {entry.content}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DotIcon({ type, role }: { type: string; role: string }) {
  let cls = 'bg-mc-accent-purple';
  if (type === 'toolCall') cls = 'bg-mc-accent';
  else if (role === 'user') cls = 'bg-mc-accent-green';
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${cls}`} />;
}

function formatArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
