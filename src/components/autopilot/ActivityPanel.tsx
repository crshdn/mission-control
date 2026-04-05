'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, ChevronRight, ChevronLeft, Zap, Clock, CheckCircle, AlertCircle, Loader, X } from 'lucide-react';
import type { AutopilotActivityEntry } from '@/lib/types';

interface ActivityPanelProps {
  productId: string;
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  phase_init: <Zap className="w-3.5 h-3.5 text-blue-400" />,
  phase_llm_submitted: <Loader className="w-3.5 h-3.5 text-yellow-400" />,
  phase_llm_polling: <Clock className="w-3.5 h-3.5 text-yellow-400 animate-spin" />,
  phase_report_received: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  phase_ideas_parsed: <Zap className="w-3.5 h-3.5 text-purple-400" />,
  phase_ideas_stored: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  phase_completed: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  idea_stored: <Zap className="w-3.5 h-3.5 text-purple-400" />,
  error: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
  recovery_requeued: <Loader className="w-3.5 h-3.5 text-orange-400" />,
  recovery_interrupted: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
  recovery_completed: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
};

function getEventIcon(eventType: string) {
  return EVENT_ICONS[eventType] || <Activity className="w-3.5 h-3.5 text-autensa-text-secondary" />;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function groupByCycle(entries: AutopilotActivityEntry[]): Map<string, AutopilotActivityEntry[]> {
  const groups = new Map<string, AutopilotActivityEntry[]>();
  for (const entry of entries) {
    const key = `${entry.cycle_type}-${entry.cycle_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }
  return groups;
}

function cycleLabel(cycleType: string, index: number): string {
  const type = cycleType === 'research' ? 'Research' : 'Ideation';
  return `${type} Cycle #${index}`;
}

export function ActivityPanel({ productId }: ActivityPanelProps) {
  const [entries, setEntries] = useState<AutopilotActivityEntry[]>([]);
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(`autopilot-activity-open-${productId}`) !== 'false';
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const initialLoadDone = useRef(false);

  // Persist open/closed state
  useEffect(() => {
    localStorage.setItem(`autopilot-activity-open-${productId}`, String(isOpen));
  }, [isOpen, productId]);

  // Fetch initial entries (no auto-scroll on mount)
  useEffect(() => {
    fetch(`/api/products/${productId}/activity?limit=50`)
      .then(res => res.ok ? res.json() : { entries: [] })
      .then(data => {
        setEntries(data.entries.reverse()); // Oldest first for display
        // Mark initial load done after a tick so the scroll effect skips this batch
        requestAnimationFrame(() => { initialLoadDone.current = true; });
      })
      .catch(err => logger.error('[ActivityPanel] Fetch failed:', err));
  }, [productId]);

  // Subscribe to SSE for live updates
  const handleSSEMessage = useCallback((event: MessageEvent) => {
    try {
      if (event.data.startsWith(':')) return;
      const sseEvent = JSON.parse(event.data);
      if (sseEvent.type === 'autopilot_activity' && sseEvent.payload?.product_id === productId) {
        setEntries(prev => [...prev, sseEvent.payload as AutopilotActivityEntry]);
      }
    } catch {
      // ignore parse errors
    }
  }, [productId]);

  useEffect(() => {
    const es = new EventSource('/api/events/stream');
    eventSourceRef.current = es;
    es.onmessage = handleSSEMessage;
    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [handleSSEMessage]);

  // Auto-scroll to bottom only for new live entries (not initial load)
  useEffect(() => {
    if (initialLoadDone.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries]);

  const grouped = groupByCycle(entries);
  const cycleKeys = Array.from(grouped.keys());

  // Mobile drawer state
  const [mobileOpen, setMobileOpen] = useState(false);

  const panelContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-autensa-border">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-autensa-accent" />
          <span className="text-sm font-medium text-autensa-text">Activity</span>
          <span className="text-xs text-autensa-text-secondary">({entries.length})</span>
        </div>
        {/* Desktop: collapse button */}
        <button
          onClick={() => setIsOpen(false)}
          className="hidden lg:block text-autensa-text-secondary hover:text-autensa-text"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {/* Mobile: close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-autensa-text-secondary hover:text-autensa-text"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {entries.length === 0 && (
          <p className="text-xs text-autensa-text-secondary text-center py-4">No activity yet</p>
        )}

        {cycleKeys.map((key, idx) => {
          const group = grouped.get(key)!;
          const cycleType = key.split('-')[0];

          return (
            <div key={key}>
              <div className="text-[10px] font-semibold text-autensa-text-secondary uppercase tracking-wider mb-1">
                {cycleLabel(cycleType, cycleKeys.length - idx)}
              </div>
              <div className="space-y-1">
                {group.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 text-xs group">
                    <div className="mt-0.5 shrink-0">{getEventIcon(entry.event_type)}</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-autensa-text">{entry.message}</span>
                      {entry.detail && (
                        <span className="text-autensa-text-secondary ml-1">— {entry.detail}</span>
                      )}
                      {(entry.cost_usd != null && entry.cost_usd > 0) && (
                        <span className="text-green-400 ml-1">${entry.cost_usd.toFixed(4)}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-autensa-text-secondary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {relativeTime(entry.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: side panel */}
      {isOpen ? (
        <div className="hidden lg:flex w-80 border-l border-autensa-border bg-autensa-bg-secondary flex-col">
          {panelContent}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="hidden lg:flex items-center justify-center w-8 border-l border-autensa-border bg-autensa-bg-secondary hover:bg-autensa-bg text-autensa-text-secondary hover:text-autensa-text"
          title="Show activity panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* Mobile: floating button + slide-over */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-autensa-accent text-white shadow-lg flex items-center justify-center"
      >
        <Activity className="w-5 h-5" />
        {entries.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
            {Math.min(entries.length, 99)}
          </span>
        )}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-autensa-bg-secondary">
            {panelContent}
          </div>
        </div>
      )}
    </>
  );
}
