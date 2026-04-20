'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trash2, Play, Pause, ChevronDown, ChevronRight, Users, ListX, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DebugEvent, DebugEventType, DebugEventDirection } from '@/lib/debug-log';

const EVENT_TYPE_OPTIONS: Array<{ value: '' | DebugEventType; label: string }> = [
  { value: '', label: 'All event types' },
  // Outbound
  { value: 'chat.send', label: '↑ chat.send' },
  { value: 'gateway.rpc', label: '↑ gateway.rpc (all RPCs)' },
  { value: 'gateway.list_agents', label: '↑ gateway.list_agents' },
  // Inbound
  { value: 'chat.response', label: '↓ chat.response' },
  { value: 'agent.event', label: '↓ agent.event (stream)' },
  { value: 'agent.activity_post', label: '↓ agent.activity_post' },
  { value: 'agent.deliverable_post', label: '↓ agent.deliverable_post' },
  { value: 'agent.status_patch', label: '↓ agent.status_patch' },
  { value: 'agent.fail_post', label: '↓ agent.fail_post' },
  // Lifecycle
  { value: 'session.create', label: '• session.create' },
  { value: 'session.end', label: '• session.end' },
  { value: 'ws.connect', label: '• ws.connect' },
  { value: 'ws.authenticated', label: '• ws.authenticated' },
  { value: 'ws.disconnect', label: '• ws.disconnect' },
  { value: 'ws.error', label: '• ws.error' },
  { value: 'ws.reconnect', label: '• ws.reconnect' },
  // Scheduler / diagnostic
  { value: 'stall.flagged', label: '• stall.flagged' },
  { value: 'stall.cleared', label: '• stall.cleared' },
  { value: 'diagnostic.step', label: '• diagnostic.step' },
];

const DIRECTION_OPTIONS: Array<{ value: '' | DebugEventDirection; label: string }> = [
  { value: '', label: 'All directions' },
  { value: 'outbound', label: 'Outbound (MC → agent)' },
  { value: 'inbound', label: 'Inbound (agent → MC)' },
  { value: 'internal', label: 'Internal' },
];

export default function DebugConsolePage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    taskId: '',
    agentId: '',
    eventType: '' as '' | DebugEventType,
    direction: '' as '' | DebugEventDirection,
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<null | {
    ok: boolean;
    message: string;
    task_id?: string;
    steps?: Array<{ name: string; ok: boolean; detail?: string; duration_ms?: number }>;
  }>(null);

  // Keep the latest filter in a ref so the SSE handler (which is stable
  // across renders) reads the current value without having to re-register.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const refetch = async () => {
    const qs = new URLSearchParams();
    if (filter.taskId) qs.set('task_id', filter.taskId);
    if (filter.agentId) qs.set('agent_id', filter.agentId);
    if (filter.eventType) qs.set('event_type', filter.eventType);
    if (filter.direction) qs.set('direction', filter.direction);
    qs.set('limit', '200');
    const res = await fetch(`/api/debug/events?${qs.toString()}`);
    const data = await res.json();
    setEvents(data.events || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  useEffect(() => {
    fetch('/api/debug/settings').then(r => r.json()).then(d => setEnabled(Boolean(d.collection_enabled)));
  }, []);

  useEffect(() => {
    setLoading(true);
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.taskId, filter.agentId, filter.eventType, filter.direction]);

  // Live tail — subscribe to SSE, react only to debug-specific events.
  useEffect(() => {
    const es = new EventSource('/api/events/stream');
    es.onmessage = (event) => {
      if (event.data.startsWith(':')) return;
      try {
        const parsed = JSON.parse(event.data) as { type: string; payload: unknown };
        if (parsed.type === 'debug_event_logged') {
          const incoming = parsed.payload as DebugEvent;
          // Respect active filters — if the incoming row doesn't match, skip.
          const f = filterRef.current;
          if (f.taskId && incoming.task_id !== f.taskId) return;
          if (f.agentId && incoming.agent_id !== f.agentId) return;
          if (f.eventType && incoming.event_type !== f.eventType) return;
          if (f.direction && incoming.direction !== f.direction) return;
          setEvents(prev => [incoming, ...prev].slice(0, 200));
          setTotal(prev => prev + 1);
        } else if (parsed.type === 'debug_events_cleared') {
          setEvents([]);
          setTotal(0);
        } else if (parsed.type === 'debug_collection_toggled') {
          const p = parsed.payload as { collection_enabled: boolean };
          setEnabled(p.collection_enabled);
        }
      } catch { /* ignore malformed */ }
    };
    return () => es.close();
  }, []);

  const toggleCollection = async () => {
    const next = !enabled;
    setEnabled(next);
    await fetch('/api/debug/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection_enabled: next }),
    });
  };

  const clearAll = async () => {
    if (!confirm(`Delete all ${total} debug event(s)?`)) return;
    await fetch('/api/debug/events', { method: 'DELETE' });
    setEvents([]);
    setTotal(0);
    setExpandedIds(new Set());
  };

  const clearLocalAgents = async () => {
    if (!confirm('Delete all non-gateway (local) agents from Mission Control? Gateway-synced agents will be kept.')) return;
    try {
      const res = await fetch('/api/agents/local', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to clear local agents');
        return;
      }
      alert(`Cleared ${data.deleted} local agent(s).`);
    } catch (err) {
      alert(`Failed to clear local agents: ${(err as Error).message}`);
    }
  };

  const clearAllTasks = async () => {
    if (!confirm('Delete ALL tasks from the Mission Control DB? This cannot be undone. (OpenClaw and workspace directories are not affected.)')) return;
    try {
      const res = await fetch('/api/tasks/clear', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to clear tasks');
        return;
      }
      alert(`Cleared ${data.deleted} task(s).`);
    } catch (err) {
      alert(`Failed to clear tasks: ${(err as Error).message}`);
    }
  };

  const runDiagnostic = async () => {
    setDiagnosticBusy(true);
    setDiagnosticResult(null);
    try {
      const res = await fetch('/api/debug/diagnostic', { method: 'POST' });
      const data = await res.json();
      setDiagnosticResult({
        ok: Boolean(data.ok),
        message: data.hint || data.error || (data.ok ? 'Diagnostic complete' : 'Diagnostic failed'),
        task_id: data.task_id,
        steps: data.steps,
      });
      // Auto-filter the event stream to this run so the operator can see
      // exactly the traffic this test triggered, without the rest of the
      // noise on the page.
      if (data.task_id) {
        setFilter(f => ({ ...f, taskId: data.task_id }));
      }
    } catch (err) {
      setDiagnosticResult({ ok: false, message: (err as Error).message });
    } finally {
      setDiagnosticBusy(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      <header className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-mc-text-secondary hover:text-mc-text">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-2xl">🔬</span>
            <div>
              <h1 className="text-xl font-bold">Debug Console</h1>
              <p className="text-xs text-mc-text-secondary">
                Raw capture of Mission Control ↔ agent traffic
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleCollection}
              disabled={enabled === null}
              className={`min-h-11 px-4 rounded-lg border flex items-center gap-2 text-sm font-medium transition-colors ${
                enabled
                  ? 'bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25'
                  : 'bg-green-500/15 border-green-500/40 text-green-300 hover:bg-green-500/25'
              }`}
            >
              {enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {enabled === null ? '...' : enabled ? 'Stop collection' : 'Start collection'}
            </button>
            <button
              onClick={clearAll}
              disabled={total === 0}
              className="min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Clear ({total})
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Status banner */}
        <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${
          enabled
            ? 'bg-green-500/10 border-green-500/30 text-green-300'
            : 'bg-mc-bg-tertiary border-mc-border text-mc-text-secondary'
        }`}>
          {enabled === null
            ? 'Loading collection state...'
            : enabled
            ? `Collection is ON — capturing every outbound chat.send. ${total} event(s) stored.`
            : `Collection is OFF. ${total} event(s) stored from previous sessions. Click "Start collection" to capture new traffic.`}
        </div>

        {/* Diagnostic tools */}
        <div className="mb-4 px-4 py-3 rounded-lg border border-mc-border bg-mc-bg-secondary">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">Diagnostic tools</div>
              <div className="text-xs text-mc-text-secondary">
                Reset local state and run an end-to-end ping against the coordinator.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={runDiagnostic}
                disabled={diagnosticBusy}
                className="min-h-11 px-4 rounded-lg border border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Activity className="w-4 h-4" />
                {diagnosticBusy ? 'Running...' : 'Run diagnostic'}
              </button>
              <button
                onClick={clearLocalAgents}
                className="min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary flex items-center gap-2 text-sm"
                title="Delete every agent that was not synced from the OpenClaw Gateway"
              >
                <Users className="w-4 h-4" />
                Clear local agents
              </button>
              <button
                onClick={clearAllTasks}
                className="min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary flex items-center gap-2 text-sm"
                title="Delete all tasks from the Mission Control DB (OpenClaw untouched)"
              >
                <ListX className="w-4 h-4" />
                Clear all tasks
              </button>
            </div>
          </div>

          {diagnosticResult && (
            <div className={`mt-3 px-3 py-2 rounded border text-xs ${
              diagnosticResult.ok
                ? 'border-green-500/30 bg-green-500/10 text-green-300'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
            }`}>
              <div className="font-medium mb-1">
                {diagnosticResult.ok ? '✅' : '❌'} {diagnosticResult.message}
              </div>
              {diagnosticResult.task_id && (
                <div className="text-mc-text-secondary font-mono">
                  task_id={diagnosticResult.task_id} (filter applied below)
                </div>
              )}
              {diagnosticResult.steps && diagnosticResult.steps.length > 0 && (
                <ul className="mt-2 space-y-0.5 font-mono">
                  {diagnosticResult.steps.map((s, i) => (
                    <li key={i}>
                      {s.ok ? '✓' : '✗'} {s.name}
                      {s.duration_ms != null && ` (${s.duration_ms}ms)`}
                      {s.detail && ` — ${s.detail}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <input
            type="text"
            placeholder="Filter by task_id"
            value={filter.taskId}
            onChange={e => setFilter(f => ({ ...f, taskId: e.target.value }))}
            className="min-h-11 px-3 rounded-lg border border-mc-border bg-mc-bg-secondary text-sm"
          />
          <input
            type="text"
            placeholder="Filter by agent_id"
            value={filter.agentId}
            onChange={e => setFilter(f => ({ ...f, agentId: e.target.value }))}
            className="min-h-11 px-3 rounded-lg border border-mc-border bg-mc-bg-secondary text-sm"
          />
          <select
            value={filter.eventType}
            onChange={e => setFilter(f => ({ ...f, eventType: e.target.value as '' | DebugEventType }))}
            className="min-h-11 px-3 rounded-lg border border-mc-border bg-mc-bg-secondary text-sm"
          >
            {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={filter.direction}
            onChange={e => setFilter(f => ({ ...f, direction: e.target.value as '' | DebugEventDirection }))}
            className="min-h-11 px-3 rounded-lg border border-mc-border bg-mc-bg-secondary text-sm"
          >
            {DIRECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Event list */}
        {loading ? (
          <div className="text-center py-12 text-mc-text-secondary">Loading...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-mc-text-secondary border border-mc-border rounded-lg bg-mc-bg-secondary">
            No events match the current filter.
            {!enabled && total === 0 && (
              <div className="mt-2 text-xs">Turn collection ON and dispatch a task to see traffic here.</div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(event => (
              <DebugEventRow
                key={event.id}
                event={event}
                expanded={expandedIds.has(event.id)}
                onToggle={() => toggleExpanded(event.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DebugEventRow({
  event,
  expanded,
  onToggle,
}: {
  event: DebugEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const directionBadge = useMemo(() => {
    const m = {
      outbound: { label: 'OUT', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
      inbound: { label: 'IN', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
      internal: { label: 'INT', cls: 'bg-mc-text-secondary/10 text-mc-text-secondary border-mc-border' },
    }[event.direction];
    return m || { label: event.direction, cls: '' };
  }, [event.direction]);

  const hasError = Boolean(event.error);

  return (
    <div className={`rounded-lg border ${hasError ? 'border-red-500/40 bg-red-500/5' : 'border-mc-border bg-mc-bg-secondary'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-mc-bg-tertiary/40 rounded-lg"
      >
        {expanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${directionBadge.cls} flex-shrink-0`}>
          {directionBadge.label}
        </span>
        <span className="font-mono text-sm flex-shrink-0">{event.event_type}</span>
        <span className="text-xs text-mc-text-secondary truncate flex-1">
          {event.task_id && <span className="mr-3">task={event.task_id.slice(0, 8)}</span>}
          {event.agent_id && <span className="mr-3">agent={event.agent_id.slice(0, 8)}</span>}
          {event.duration_ms != null && <span className="mr-3">{event.duration_ms}ms</span>}
          {hasError && <span className="text-red-300">error</span>}
        </span>
        <span className="text-[11px] text-mc-text-secondary/70 flex-shrink-0">
          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-mc-border px-4 py-3 text-xs font-mono space-y-3">
          <DebugField label="created_at" value={event.created_at} />
          {event.session_key && <DebugField label="session_key" value={event.session_key} />}
          {event.task_id && <DebugField label="task_id" value={event.task_id} />}
          {event.agent_id && <DebugField label="agent_id" value={event.agent_id} />}
          {event.duration_ms != null && <DebugField label="duration_ms" value={String(event.duration_ms)} />}
          {event.error && <DebugField label="error" value={event.error} tone="error" />}
          {event.metadata && <DebugField label="metadata" value={prettyJson(event.metadata)} block />}
          {event.request_body && <DebugField label="request_body" value={prettyJson(event.request_body)} block />}
          {event.response_body && <DebugField label="response_body" value={prettyJson(event.response_body)} block />}
        </div>
      )}
    </div>
  );
}

function DebugField({
  label,
  value,
  block = false,
  tone,
}: {
  label: string;
  value: string;
  block?: boolean;
  tone?: 'error';
}) {
  const toneCls = tone === 'error' ? 'text-red-300' : 'text-mc-text';
  if (block) {
    return (
      <div>
        <div className="text-mc-text-secondary mb-1">{label}</div>
        <pre className={`whitespace-pre-wrap break-all bg-mc-bg px-3 py-2 rounded border border-mc-border max-h-96 overflow-auto ${toneCls}`}>{value}</pre>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="text-mc-text-secondary w-28 flex-shrink-0">{label}</span>
      <span className={`break-all ${toneCls}`}>{value}</span>
    </div>
  );
}

function prettyJson(value: string | null): string {
  if (value == null) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
