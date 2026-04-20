'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronRight, ChevronLeft, Zap, ZapOff, Loader2, Search, Power, Megaphone, X, MoreVertical, RotateCcw } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Agent, AgentStatus, AgentHealthState, OpenClawSession } from '@/lib/types';
import { AgentModal } from './AgentModal';
import { DiscoverAgentsModal } from './DiscoverAgentsModal';
import { HealthIndicator } from './HealthIndicator';

interface RollCallEntryView {
  id: string;
  target_agent_id: string;
  target_agent_name?: string;
  target_agent_role?: string;
  delivery_status: 'pending' | 'sent' | 'failed' | 'skipped';
  delivery_error: string | null;
  replied_at: string | null;
  reply_body: string | null;
}

interface RollCallResultView {
  rollcall_id: string;
  mode: 'direct' | 'coordinator';
  seconds_remaining: number;
  entries: RollCallEntryView[];
  error?: string;
  reason?: 'no_master' | 'multiple_masters' | 'no_active_agents';
}

type FilterTab = 'all' | 'working' | 'standby';

interface AgentsSidebarProps {
  workspaceId?: string;
  mobileMode?: boolean;
  isPortrait?: boolean;
}

export function AgentsSidebar({ workspaceId, mobileMode = false, isPortrait = true }: AgentsSidebarProps) {
  const { agents, selectedAgent, setSelectedAgent, agentOpenClawSessions, setAgentOpenClawSession, updateAgent } = useMissionControl();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [connectingAgentId, setConnectingAgentId] = useState<string | null>(null);
  const [activeSubAgents, setActiveSubAgents] = useState(0);
  const [agentHealth, setAgentHealth] = useState<Record<string, AgentHealthState>>({});
  const [isMinimized, setIsMinimized] = useState(false);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);
  const [rollCallBusy, setRollCallBusy] = useState(false);
  const [rollCallResult, setRollCallResult] = useState<RollCallResultView | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [resetSessionsBusy, setResetSessionsBusy] = useState(false);

  // Close the action menu when clicking outside it. We watch document mousedown
  // and check that the target isn't inside the menu or the trigger button.
  useEffect(() => {
    if (!showActionMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-agents-action-menu]')) {
        setShowActionMenu(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showActionMenu]);

  const effectiveMinimized = mobileMode ? false : isMinimized;
  const toggleMinimize = () => setIsMinimized(!isMinimized);

  const loadOpenClawSessions = useCallback(async () => {
    for (const agent of agents) {
      try {
        const res = await fetch(`/api/agents/${agent.id}/openclaw`);
        if (res.ok) {
          const data = await res.json();
          if (data.linked && data.session) {
            setAgentOpenClawSession(agent.id, data.session as OpenClawSession);
          }
        }
      } catch (error) {
        console.error(`Failed to load OpenClaw session for ${agent.name}:`, error);
      }
    }
  }, [agents, setAgentOpenClawSession]);

  useEffect(() => {
    if (agents.length > 0) {
      loadOpenClawSessions();
    }
  }, [loadOpenClawSessions, agents.length]);

  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();
    const interval = setInterval(loadSubAgentCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Poll agent health
  useEffect(() => {
    const loadHealth = async () => {
      try {
        const res = await fetch('/api/agents/health');
        if (res.ok) {
          const data = await res.json();
          const healthMap: Record<string, AgentHealthState> = {};
          for (const h of data) {
            healthMap[h.agent_id] = h.health_state;
          }
          setAgentHealth(healthMap);
        }
      } catch {}
    };

    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Toggle is_active for an agent. Optimistic update — on failure we roll
  // back and surface the error.
  const toggleAgentActive = async (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const nextActive = !(Number(agent.is_active ?? 1) === 1);
    setTogglingAgentId(agent.id);
    const optimistic: Agent = { ...agent, is_active: nextActive ? 1 : 0 };
    updateAgent(optimistic);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive }),
      });
      if (!res.ok) {
        updateAgent(agent); // rollback
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to toggle agent');
      } else {
        const fresh = await res.json();
        updateAgent(fresh as Agent);
      }
    } catch (err) {
      updateAgent(agent); // rollback
      alert(`Failed to toggle agent: ${(err as Error).message}`);
    } finally {
      setTogglingAgentId(null);
    }
  };

  // Kick off a roll-call and open the results panel. Failures
  // (no/multiple master orchestrators) are surfaced in the same panel so
  // the operator can act on the alert without leaving the sidebar.
  const runRollCall = async () => {
    setRollCallBusy(true);
    setRollCallResult(null);
    try {
      const res = await fetch('/api/agents/rollcall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId || 'default',
          mode: 'direct',
          timeout_seconds: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRollCallResult({
          rollcall_id: '',
          mode: 'direct',
          seconds_remaining: 0,
          entries: [],
          error: data.error,
          reason: data.reason,
        });
        return;
      }
      setRollCallResult({
        rollcall_id: data.rollcall_id,
        mode: data.rollcall.mode,
        seconds_remaining: 30,
        entries: data.entries,
      });
    } catch (err) {
      setRollCallResult({
        rollcall_id: '',
        mode: 'direct',
        seconds_remaining: 0,
        entries: [],
        error: (err as Error).message,
      });
    } finally {
      setRollCallBusy(false);
    }
  };

  // Reset all OpenClaw sessions — both MC-side (session rows) and
  // gateway-side (via `/reset` sent to each active gateway-synced agent's
  // main session, which forces the gateway to re-init and reload the
  // agent's persona files on its next turn). One click, two phases.
  const resetAllSessions = async () => {
    if (!confirm(
      'Reset ALL agent sessions?\n\n' +
      'This does two things:\n' +
      '  1. Wipes Mission Control\'s session tracking (the "OpenClaw Connected" badges).\n' +
      '  2. Sends `/reset` to every active gateway-synced agent\'s main session, which forces OpenClaw to re-initialize the session and reload the agent\'s SOUL.md / AGENTS.md / MESSAGING-PROTOCOL.md on its next turn.\n\n' +
      'Use this after editing agent persona files, or when sessionKey routing has drifted.'
    )) return;
    setResetSessionsBusy(true);
    try {
      const res = await fetch('/api/openclaw/sessions', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to reset sessions');
        return;
      }
      // Drop in-memory OpenClaw session state so badges update immediately.
      for (const agent of agents) {
        setAgentOpenClawSession(agent.id, null);
      }
      // Summarise both phases. Gateway /reset can fail per-agent (allow-list,
      // offline, etc.) — surface those in the alert so the operator knows
      // which ones to hit manually in the chat.
      const resets: Array<{ name: string; ok: boolean; error?: string }> = data.agents_reset || [];
      const ok = resets.filter(r => r.ok).map(r => r.name);
      const failed = resets.filter(r => !r.ok);
      const lines: string[] = [
        `Cleared ${data.deleted} MC session record(s).`,
      ];
      if (ok.length) lines.push(`Sent /reset to: ${ok.join(', ')}`);
      if (failed.length) {
        lines.push(`Failed to /reset: ${failed.map(f => `${f.name} (${f.error || 'unknown'})`).join('; ')}`);
        lines.push('Fall back: run `/reset` in those agents\' OpenClaw chats directly.');
      }
      if (data.gateway_error) lines.push(`Gateway unreachable: ${data.gateway_error}`);
      alert(lines.join('\n'));
    } catch (err) {
      alert(`Failed to reset sessions: ${(err as Error).message}`);
    } finally {
      setResetSessionsBusy(false);
    }
  };

  // Poll roll-call status while panel is open and timer hasn't expired.
  // SSE would be nicer; polling is simpler and fine for the small entry
  // counts this feature fans out to.
  useEffect(() => {
    if (!rollCallResult?.rollcall_id) return;
    const rid = rollCallResult.rollcall_id;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/agents/rollcall/${rid}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setRollCallResult(prev => prev && prev.rollcall_id === rid
          ? { ...prev, entries: data.entries, seconds_remaining: data.summary.seconds_remaining }
          : prev
        );
      } catch {}
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [rollCallResult?.rollcall_id]);

  const handleConnectToOpenClaw = async (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation();
    setConnectingAgentId(agent.id);

    try {
      const existingSession = agentOpenClawSessions[agent.id];

      if (existingSession) {
        const res = await fetch(`/api/agents/${agent.id}/openclaw`, { method: 'DELETE' });
        if (res.ok) {
          setAgentOpenClawSession(agent.id, null);
        }
      } else {
        const res = await fetch(`/api/agents/${agent.id}/openclaw`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setAgentOpenClawSession(agent.id, data.session as OpenClawSession);
        } else {
          const error = await res.json();
          console.error('Failed to connect to OpenClaw:', error);
          alert(`Failed to connect: ${error.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('OpenClaw connection error:', error);
    } finally {
      setConnectingAgentId(null);
    }
  };

  const filteredAgents = agents.filter((agent) => {
    if (filter === 'all') return true;
    return agent.status === filter;
  });

  const getStatusBadge = (status: AgentStatus) => {
    const styles = {
      standby: 'status-standby',
      working: 'status-working',
      offline: 'status-offline',
    };
    return styles[status] || styles.standby;
  };

  return (
    <aside
      className={`bg-mc-bg-secondary ${mobileMode ? 'border border-mc-border rounded-lg h-full' : 'border-r border-mc-border'} flex flex-col transition-all duration-300 ease-in-out ${
        effectiveMinimized ? 'w-12' : mobileMode ? 'w-full' : 'w-80'
      }`}
    >
      <div className="p-3 border-b border-mc-border">
        <div className="flex items-center">
          {!mobileMode && (
            <button
              onClick={toggleMinimize}
              className="p-1 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text transition-colors"
              aria-label={effectiveMinimized ? 'Expand agents' : 'Minimize agents'}
            >
              {effectiveMinimized ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}
          {!effectiveMinimized && (
            <>
              <span className="text-sm font-medium uppercase tracking-wider">Agents</span>
              <span className="bg-mc-bg-tertiary text-mc-text-secondary text-xs px-2 py-0.5 rounded ml-2">{agents.length}</span>
              <div className="relative ml-auto" data-agents-action-menu>
                <button
                  onClick={() => setShowActionMenu(v => !v)}
                  className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text transition-colors"
                  aria-label="Agent actions"
                  title="Agent actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showActionMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-mc-border bg-mc-bg shadow-lg z-30 py-1">
                    <button
                      onClick={() => { setShowActionMenu(false); runRollCall(); }}
                      disabled={rollCallBusy}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-300 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      {rollCallBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                      {rollCallBusy ? 'Calling…' : 'Roll Call'}
                    </button>
                    <button
                      onClick={() => { setShowActionMenu(false); resetAllSessions(); }}
                      disabled={resetSessionsBusy}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                      title="Clear all OpenClaw session records so next dispatch starts fresh"
                    >
                      {resetSessionsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      {resetSessionsBusy ? 'Resetting…' : 'Reset all sessions'}
                    </button>
                    <div className="h-px bg-mc-border my-1" />
                    <button
                      onClick={() => { setShowActionMenu(false); setShowCreateModal(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-mc-text hover:bg-mc-bg-tertiary text-left"
                    >
                      <Plus className="w-4 h-4" />
                      Add Agent
                    </button>
                    <button
                      onClick={() => { setShowActionMenu(false); setShowDiscoverModal(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/10 text-left"
                    >
                      <Search className="w-4 h-4" />
                      Import from Gateway
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!effectiveMinimized && (
          <>
            {activeSubAgents > 0 && (
              <div className="mb-3 mt-3 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-400">●</span>
                  <span className="text-mc-text">Active Sub-Agents:</span>
                  <span className="font-bold text-green-400">{activeSubAgents}</span>
                </div>
              </div>
            )}

            <div className={`mt-3 ${mobileMode && isPortrait ? 'grid grid-cols-3 gap-2' : 'flex gap-1'}`}>
              {(['all', 'working', 'standby'] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`min-h-11 text-xs rounded uppercase ${mobileMode && isPortrait ? 'px-1' : 'px-3'} ${
                    filter === tab ? 'bg-mc-accent text-mc-bg font-medium' : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredAgents.map((agent) => {
          const openclawSession = agentOpenClawSessions[agent.id];

          if (effectiveMinimized) {
            return (
              <div key={agent.id} className="flex justify-center py-3">
                <button
                  onClick={() => {
                    setSelectedAgent(agent);
                    setEditingAgent(agent);
                  }}
                  className="relative group"
                  title={`${agent.name} - ${agent.role}`}
                >
                  <span className="text-2xl">{agent.avatar_emoji}</span>
                  {openclawSession && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-mc-bg-secondary" />}
                  {!!agent.is_master && <span className="absolute -top-1 -right-1 text-xs text-mc-accent-yellow">★</span>}
                  <span
                    className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${
                      agent.status === 'working' ? 'bg-mc-accent-green' : agent.status === 'standby' ? 'bg-mc-text-secondary' : 'bg-gray-500'
                    }`}
                  />
                  <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-mc-bg text-mc-text text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-mc-border">
                    {agent.name}
                  </div>
                </button>
              </div>
            );
          }

          const isConnecting = connectingAgentId === agent.id;
          const isActive = Number(agent.is_active ?? 1) === 1;
          const isToggling = togglingAgentId === agent.id;
          return (
            <div key={agent.id} className={`w-full rounded hover:bg-mc-bg-tertiary transition-colors ${selectedAgent?.id === agent.id ? 'bg-mc-bg-tertiary' : ''} ${!isActive ? 'opacity-50' : ''}`}>
              <button
                onClick={() => {
                  setSelectedAgent(agent);
                  setEditingAgent(agent);
                }}
                className="w-full flex items-center gap-3 p-3 text-left min-h-11"
              >
                <div className="text-2xl relative">
                  {agent.avatar_emoji}
                  {openclawSession && <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-mc-bg-secondary" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{agent.name}</span>
                    {!!agent.is_master && <span className="text-xs text-mc-accent-yellow">★</span>}
                    {!isActive && (
                      <span className="text-[9px] px-1 py-0 bg-amber-500/20 text-amber-400 rounded uppercase tracking-wider" title="Excluded from routing + roll-call">
                        paused
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-mc-text-secondary truncate flex items-center gap-1">
                    {agent.role}
                    {agent.source === 'gateway' && (
                      <span className="text-[10px] px-1 py-0 bg-blue-500/20 text-blue-400 rounded" title="Imported from Gateway">
                        GW
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => toggleAgentActive(agent, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAgentActive(agent, e as unknown as React.MouseEvent); }
                    }}
                    title={isActive ? 'Active — click to pause (excludes from routing + roll-call)' : 'Paused — click to activate'}
                    className={`p-1.5 rounded transition-colors cursor-pointer ${
                      isActive
                        ? 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
                        : 'text-amber-400 hover:bg-amber-500/20'
                    } ${isToggling ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </span>
                  {agentHealth[agent.id] && agentHealth[agent.id] !== 'idle' && (
                    <HealthIndicator state={agentHealth[agent.id]} size="sm" />
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded uppercase ${getStatusBadge(agent.status)}`}>{agent.status}</span>
                </div>
              </button>

              {!!agent.is_master && (
                <div className="px-2 pb-2">
                  <button
                    onClick={(e) => handleConnectToOpenClaw(agent, e)}
                    disabled={isConnecting}
                    className={`w-full min-h-11 flex items-center justify-center gap-2 px-2 rounded text-xs transition-colors ${
                      openclawSession
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-mc-bg text-mc-text-secondary hover:bg-mc-bg-tertiary hover:text-mc-text'
                    }`}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : openclawSession ? (
                      <>
                        <Zap className="w-3 h-3" />
                        <span>OpenClaw Connected</span>
                      </>
                    ) : (
                      <>
                        <ZapOff className="w-3 h-3" />
                        <span>Connect to OpenClaw</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!effectiveMinimized && rollCallResult && (
        <div className="border-t border-mc-border bg-mc-bg-secondary">
          <RollCallResultsPanel
            result={rollCallResult}
            onClose={() => setRollCallResult(null)}
          />
        </div>
      )}


      {showCreateModal && <AgentModal onClose={() => setShowCreateModal(false)} workspaceId={workspaceId} />}
      {editingAgent && <AgentModal agent={editingAgent} onClose={() => setEditingAgent(null)} workspaceId={workspaceId} />}
      {showDiscoverModal && <DiscoverAgentsModal onClose={() => setShowDiscoverModal(false)} workspaceId={workspaceId} />}
    </aside>
  );
}

/**
 * Inline panel that shows the live roll-call results. Renders above the
 * action buttons so the operator can watch replies land without leaving
 * the sidebar context. Also surfaces alert-level errors (no master
 * orchestrator / multiple master orchestrators) in the same surface.
 */
function RollCallResultsPanel({
  result,
  onClose,
}: {
  result: RollCallResultView;
  onClose: () => void;
}) {
  // Error state: no master, multiple masters, or other failure.
  if (result.error) {
    const alertTitle =
      result.reason === 'no_master'
        ? '⚠️ No Master Orchestrator'
        : result.reason === 'multiple_masters'
          ? '⚠️ Multiple Master Orchestrators'
          : '⚠️ Roll-call Failed';
    return (
      <div className="p-3 border-l-4 border-amber-500 bg-amber-500/10">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-sm font-semibold text-amber-300">{alertTitle}</span>
          <button onClick={onClose} className="text-mc-text-secondary hover:text-mc-text p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs text-mc-text-secondary">{result.error}</p>
      </div>
    );
  }

  const delivered = result.entries.filter(e => e.delivery_status === 'sent').length;
  const skipped = result.entries.filter(e => e.delivery_status === 'skipped').length;
  const failed = result.entries.filter(e => e.delivery_status === 'failed').length;
  const replied = result.entries.filter(e => e.replied_at).length;
  const expired = result.seconds_remaining <= 0;

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs">
          <div className="font-semibold text-mc-text flex items-center gap-2">
            📢 Roll Call ({expired ? 'complete' : `${result.seconds_remaining}s left`})
          </div>
          <div className="text-mc-text-secondary mt-0.5">
            {replied}/{result.entries.length} replied · {delivered} delivered · {skipped + failed} undelivered
          </div>
        </div>
        <button onClick={onClose} className="text-mc-text-secondary hover:text-mc-text p-0.5" title="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1 max-h-40 overflow-auto">
        {result.entries.map(e => {
          const replyGlyph = e.replied_at ? '✓' : expired ? '✗' : '⏳';
          const replyColor = e.replied_at
            ? 'text-green-400'
            : expired
              ? 'text-red-400'
              : 'text-mc-text-secondary';
          const deliveryBadge = e.delivery_status === 'sent'
            ? null
            : e.delivery_status === 'skipped'
              ? <span className="text-[9px] px-1 bg-mc-text-secondary/20 text-mc-text-secondary rounded" title={e.delivery_error || ''}>no session</span>
              : e.delivery_status === 'failed'
                ? <span className="text-[9px] px-1 bg-red-500/20 text-red-400 rounded" title={e.delivery_error || ''}>fail</span>
                : null;
          return (
            <div key={e.id} className="flex items-center gap-2 text-xs">
              <span className={`w-4 text-center ${replyColor}`}>{replyGlyph}</span>
              <span className="flex-1 truncate">
                {e.target_agent_name} <span className="text-mc-text-secondary">({e.target_agent_role})</span>
              </span>
              {deliveryBadge}
            </div>
          );
        })}
      </div>
    </div>
  );
}
