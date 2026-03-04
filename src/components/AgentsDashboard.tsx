'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Play, Pause, AlertTriangle, CheckCircle, Settings, Eye, Activity, Clock, TrendingUp } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { AgentModal } from './AgentModal';

interface AgentsDashboardProps {
  workspaceId: string;
}

interface SessionData {
  id: string;
  agentId: string;
  status: 'running' | 'completed' | 'failed' | 'stuck';
  runtime: string;
  startTime: string;
  lastActivity?: string;
  taskId?: string;
}

export function AgentsDashboard({ workspaceId }: AgentsDashboardProps) {
  const { agents, setAgents } = useMissionControl();
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [sessionsData, setSessionsData] = useState<SessionData[]>([]);
  const [dispatchMetrics, setDispatchMetrics] = useState({
    totalSpawns: 0,
    successRate: 0,
    failureRate: 0,
    stuckSessions: 0,
    activeSessions: 0
  });

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents?workspace_id=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  }, [workspaceId, setAgents]);

  const loadSessionData = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/sessions');
      if (res.ok) {
        const sessions = await res.json();
        setSessionsData(sessions);
        
        // Calculate dispatch metrics
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const recentSessions = sessions.filter((session: any) => 
          new Date(session.startTime || session.created_at) > last24Hours
        );
        
        const totalSpawns = recentSessions.length;
        const failedSessions = recentSessions.filter((s: any) => s.status === 'failed');
        const stuckSessions = sessions.filter((s: any) => {
          if (s.status !== 'running') return false;
          const lastActivity = new Date(s.lastActivity || s.startTime);
          return (now.getTime() - lastActivity.getTime()) > (30 * 60 * 1000); // 30 minutes
        });
        
        setDispatchMetrics({
          totalSpawns,
          successRate: totalSpawns > 0 ? ((totalSpawns - failedSessions.length) / totalSpawns) * 100 : 0,
          failureRate: totalSpawns > 0 ? (failedSessions.length / totalSpawns) * 100 : 0,
          stuckSessions: stuckSessions.length,
          activeSessions: sessions.filter((s: any) => s.status === 'running').length
        });
      }
    } catch (error) {
      console.error('Failed to load session data:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadAgents(), loadSessionData()]);
    setLoading(false);
  }, [loadAgents, loadSessionData]);

  useEffect(() => {
    loadData();
    
    // Refresh session data every 30 seconds
    const interval = setInterval(loadSessionData, 30000);
    return () => clearInterval(interval);
  }, [loadData, loadSessionData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working': return 'text-mc-accent-green';
      case 'standby': return 'text-mc-accent';
      case 'offline': return 'text-mc-accent-red';
      default: return 'text-mc-text-secondary';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'working': return 'bg-mc-accent-green/10';
      case 'standby': return 'bg-mc-accent/10';
      case 'offline': return 'bg-mc-accent-red/10';
      default: return 'bg-mc-bg-tertiary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working': return <Play className="w-4 h-4" />;
      case 'standby': return <CheckCircle className="w-4 h-4" />;
      case 'offline': return <AlertTriangle className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mc-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-mc-bg overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-mc-text mb-2">Agents Dashboard</h2>
            <p className="text-mc-text-secondary">Manage and monitor AI agents in your workspace</p>
          </div>
          <button 
            onClick={() => setShowAgentModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-mc-accent text-mc-bg rounded-lg hover:bg-mc-accent/90"
          >
            <Plus className="w-4 h-4" />
            New Agent
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Play className="w-4 h-4 text-mc-accent-green" />
              <span className="text-sm text-mc-text-secondary">Working</span>
            </div>
            <div className="text-xl font-bold text-mc-text">
              {agents.filter(agent => agent.status === 'working').length}
            </div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-mc-accent" />
              <span className="text-sm text-mc-text-secondary">Standby</span>
            </div>
            <div className="text-xl font-bold text-mc-text">
              {agents.filter(agent => agent.status === 'standby').length}
            </div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-mc-accent-red" />
              <span className="text-sm text-mc-text-secondary">Offline</span>
            </div>
            <div className="text-xl font-bold text-mc-text">
              {agents.filter(agent => agent.status === 'offline').length}
            </div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-mc-accent" />
              <span className="text-sm text-mc-text-secondary">Total</span>
            </div>
            <div className="text-xl font-bold text-mc-text">
              {agents.length}
            </div>
          </div>
        </div>

        {/* Dispatch Tracking */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-mc-accent" />
            <h3 className="font-medium text-mc-text">Agent Dispatch Tracking</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <div className="text-xl font-bold text-mc-text">{dispatchMetrics.totalSpawns}</div>
              <div className="text-sm text-mc-text-secondary">Spawns (24h)</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-mc-accent-green">{dispatchMetrics.successRate.toFixed(1)}%</div>
              <div className="text-sm text-mc-text-secondary">Success Rate</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-mc-accent-red">{dispatchMetrics.failureRate.toFixed(1)}%</div>
              <div className="text-sm text-mc-text-secondary">Failure Rate</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-mc-accent-yellow">{dispatchMetrics.stuckSessions}</div>
              <div className="text-sm text-mc-text-secondary">Stuck Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-mc-accent">{dispatchMetrics.activeSessions}</div>
              <div className="text-sm text-mc-text-secondary">Active Sessions</div>
            </div>
          </div>

          {/* Active Sessions List */}
          {sessionsData.length > 0 && (
            <div>
              <h4 className="font-medium text-mc-text mb-3">Recent Sessions</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {sessionsData.slice(0, 10).map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-2 bg-mc-bg rounded border border-mc-border">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        session.status === 'running' ? 'bg-mc-accent-green' :
                        session.status === 'failed' ? 'bg-mc-accent-red' :
                        session.status === 'stuck' ? 'bg-mc-accent-yellow' :
                        'bg-mc-accent'
                      }`} />
                      <span className="text-sm font-mono text-mc-text">{session.id.substring(0, 8)}</span>
                      <span className="text-sm text-mc-text-secondary">{session.agentId || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-mc-text-secondary">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(session.startTime).toLocaleTimeString('en-GB')}</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        session.status === 'running' ? 'bg-mc-accent-green/10 text-mc-accent-green' :
                        session.status === 'failed' ? 'bg-mc-accent-red/10 text-mc-accent-red' :
                        session.status === 'stuck' ? 'bg-mc-accent-yellow/10 text-mc-accent-yellow' :
                        'bg-mc-accent/10 text-mc-accent'
                      }`}>
                        {session.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Agents Grid */}
        {agents.length === 0 ? (
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-8 text-center">
            <Users className="w-12 h-12 text-mc-text-secondary mx-auto mb-4" />
            <h3 className="font-medium text-mc-text mb-2">No agents yet</h3>
            <p className="text-mc-text-secondary mb-4">Create your first agent to get started</p>
            <button 
              onClick={() => setShowAgentModal(true)}
              className="px-4 py-2 bg-mc-accent text-mc-bg rounded-lg hover:bg-mc-accent/90"
            >
              Create Agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 hover:border-mc-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-mc-bg-tertiary rounded-lg flex items-center justify-center text-lg">
                      {agent.avatar_emoji || '🤖'}
                    </div>
                    <div>
                      <h3 className="font-medium text-mc-text">{agent.name}</h3>
                      <p className="text-sm text-mc-text-secondary">{agent.role}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusBg(agent.status)} ${getStatusColor(agent.status)}`}>
                    {getStatusIcon(agent.status)}
                    <span className="capitalize">{agent.status}</span>
                  </div>
                </div>

                <div className="text-sm text-mc-text-secondary mb-4 line-clamp-2">
                  {agent.description || 'General purpose AI agent'}
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowAgentModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs bg-mc-bg hover:bg-mc-bg-tertiary rounded border border-mc-border"
                  >
                    <Eye className="w-3 h-3" />
                    View
                  </button>
                  <button 
                    className="flex items-center justify-center gap-1 px-2 py-2 text-xs bg-mc-bg hover:bg-mc-bg-tertiary rounded border border-mc-border"
                    title="Settings"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                  <button 
                    className="flex items-center justify-center gap-1 px-2 py-2 text-xs bg-mc-bg hover:bg-mc-bg-tertiary rounded border border-mc-border"
                    title={agent.status === 'working' ? 'Stop' : 'Start'}
                  >
                    {agent.status === 'working' ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Agent Modal */}
        {showAgentModal && (
          <AgentModal
            agent={selectedAgent}
            workspaceId={workspaceId}
            onClose={() => {
              setShowAgentModal(false);
              setSelectedAgent(null);
            }}
            onAgentCreated={() => {
              loadData();
              setShowAgentModal(false);
              setSelectedAgent(null);
            }}
          />
        )}
      </div>
    </div>
  );
}