'use client';

import { useState, useEffect } from 'react';
import { Scale, RefreshCw, User, TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface AgentWorkload {
  agentId: string;
  agentName: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  failedTasks: number;
  completionRate: number;
  avgCompletionTime: number; // in minutes
  currentLoad: 'light' | 'normal' | 'heavy' | 'overloaded';
  lastActive: string;
  tasksLast24h: number;
  tasksLast7d: number;
}

interface AgentWorkloadBalanceProps {
  workspaceId: string;
}

export function AgentWorkloadBalance({ workspaceId }: AgentWorkloadBalanceProps) {
  const [workloads, setWorkloads] = useState<AgentWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    loadWorkloads();
    
    // Refresh every minute
    const interval = setInterval(loadWorkloads, 60000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  const loadWorkloads = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agent-workload');
      if (response.ok) {
        const workloadData = await response.json();
        setWorkloads(workloadData);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to load workloads:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLoadColor = (load: string) => {
    const colors: Record<string, string> = {
      'light': 'bg-mc-accent-green/10 text-mc-accent-green border-mc-accent-green/20',
      'normal': 'bg-mc-accent/10 text-mc-accent border-mc-accent/20',
      'heavy': 'bg-mc-accent-yellow/10 text-mc-accent-yellow border-mc-accent-yellow/20',
      'overloaded': 'bg-mc-accent-red/10 text-mc-accent-red border-mc-accent-red/20'
    };
    return colors[load] || colors['normal'];
  };

  const getLoadIcon = (load: string) => {
    switch (load) {
      case 'light':
        return <TrendingDown className="w-4 h-4" />;
      case 'heavy':
      case 'overloaded':
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  const getTotalStats = () => {
    return {
      totalTasks: workloads.reduce((sum, w) => sum + w.totalTasks, 0),
      totalCompleted: workloads.reduce((sum, w) => sum + w.completedTasks, 0),
      totalPending: workloads.reduce((sum, w) => sum + w.pendingTasks, 0),
      totalFailed: workloads.reduce((sum, w) => sum + w.failedTasks, 0),
      avgCompletionRate: workloads.length > 0 
        ? workloads.reduce((sum, w) => sum + w.completionRate, 0) / workloads.length 
        : 0
    };
  };

  const stats = getTotalStats();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-mc-accent" />
          <h2 className="text-xl font-semibold text-mc-text">Agent Workload Balance</h2>
          <span className="text-sm text-mc-text-secondary">
            ({workloads.length} agents)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadWorkloads}
            disabled={loading}
            className="p-2 hover:bg-mc-bg-secondary rounded-lg transition-colors"
            title="Refresh workload data"
          >
            <RefreshCw className={`w-4 h-4 text-mc-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="text-sm text-mc-text-secondary">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-mc-bg-secondary rounded-lg p-8 text-center">
          <RefreshCw className="w-8 h-8 text-mc-accent animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Analyzing agent workloads...</p>
        </div>
      ) : workloads.length === 0 ? (
        <div className="bg-mc-bg-secondary rounded-lg p-8 text-center">
          <Scale className="w-12 h-12 text-mc-text-secondary mx-auto mb-4" />
          <p className="text-mc-text-secondary">No workload data available</p>
          <p className="text-sm text-mc-text-muted mt-2">No assigned tasks found in the last 30 days</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overall Stats */}
          <div className="bg-mc-bg-secondary rounded-lg p-4">
            <h3 className="font-medium text-mc-text mb-3">Team Overview (30 days)</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-text">{stats.totalTasks}</div>
                <div className="text-sm text-mc-text-secondary">Total Tasks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-accent-green">{stats.totalCompleted}</div>
                <div className="text-sm text-mc-text-secondary">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-accent-yellow">{stats.totalPending}</div>
                <div className="text-sm text-mc-text-secondary">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-accent-red">{stats.totalFailed}</div>
                <div className="text-sm text-mc-text-secondary">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-accent">{Math.round(stats.avgCompletionRate)}%</div>
                <div className="text-sm text-mc-text-secondary">Avg Success</div>
              </div>
            </div>
          </div>

          {/* Load Distribution */}
          <div className="bg-mc-bg-secondary rounded-lg p-4">
            <h3 className="font-medium text-mc-text mb-3">Current Load Distribution</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['overloaded', 'heavy', 'normal', 'light'].map(load => {
                const count = workloads.filter(w => w.currentLoad === load).length;
                return (
                  <div key={load} className={`border rounded-lg p-3 ${getLoadColor(load)}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {getLoadIcon(load)}
                      <span className="text-sm font-medium capitalize">{load}</span>
                    </div>
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-xs opacity-75">
                      {workloads.length > 0 ? Math.round((count / workloads.length) * 100) : 0}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {workloads.map((agent) => (
              <div
                key={agent.agentId}
                className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-mc-text-secondary" />
                    <div>
                      <h4 className="font-medium text-mc-text">{agent.agentName}</h4>
                      <div className="text-sm text-mc-text-secondary">
                        Last active: {formatTimeAgo(agent.lastActive)}
                      </div>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded border ${getLoadColor(agent.currentLoad)}`}>
                    {getLoadIcon(agent.currentLoad)}
                    <span className="text-xs font-medium capitalize">{agent.currentLoad}</span>
                  </div>
                </div>

                {/* Task Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-mc-text">{agent.totalTasks}</div>
                    <div className="text-xs text-mc-text-secondary">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-mc-accent-green">{agent.completedTasks}</div>
                    <div className="text-xs text-mc-text-secondary">Done</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-mc-accent-yellow">{agent.pendingTasks}</div>
                    <div className="text-xs text-mc-text-secondary">Pending</div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-mc-text-secondary">Completion Rate</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-mc-border rounded-full h-2">
                        <div
                          className="bg-mc-accent-green h-2 rounded-full"
                          style={{ width: `${Math.min(100, agent.completionRate)}%` }}
                        />
                      </div>
                      <span className="text-sm text-mc-text">{agent.completionRate}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-mc-text-secondary">Avg Completion Time</span>
                    <span className="text-sm text-mc-text">
                      {agent.avgCompletionTime > 0 ? formatDuration(agent.avgCompletionTime) : 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-mc-text-secondary">Recent Activity</span>
                    <div className="text-sm text-mc-text">
                      {agent.tasksLast24h} today, {agent.tasksLast7d} this week
                    </div>
                  </div>

                  {agent.failedTasks > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-mc-text-secondary">Failed Tasks</span>
                      <span className="text-sm text-mc-accent-red">{agent.failedTasks}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Load Balancing Recommendations */}
          {workloads.some(w => w.currentLoad === 'overloaded') && (
            <div className="bg-mc-accent-red/10 border border-mc-accent-red/20 rounded-lg p-4">
              <h3 className="font-medium text-mc-accent-red mb-2">Load Balancing Alert</h3>
              <p className="text-sm text-mc-text-secondary mb-3">
                Some agents are overloaded. Consider redistributing tasks or scaling capacity.
              </p>
              <div className="space-y-2">
                {workloads
                  .filter(w => w.currentLoad === 'overloaded')
                  .map(agent => (
                    <div key={agent.agentId} className="text-sm">
                      <span className="font-medium text-mc-text">{agent.agentName}</span>
                      <span className="text-mc-text-secondary">: {agent.pendingTasks} pending tasks</span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
