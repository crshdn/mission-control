'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

interface SLAMonitorProps {
  workspaceId: string;
}

interface SLAMetric {
  id: string;
  name: string;
  currentValue: number;
  target: number;
  unit: string;
  status: 'success' | 'warning' | 'danger';
  violations?: number;
}

interface SLAViolation {
  id: string;
  title: string;
  status: string;
  wait_time: number;
  created_at: string;
}

interface SLAData {
  inbox_dispatch_time: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
    violations: number;
  };
  completion_rate: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
  };
  queue_wait_time: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
    violations: number;
  };
  avg_completion_time: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
  };
  error_rate: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
  };
  sla_violations: {
    total: number;
    tasks: SLAViolation[];
  };
}

export function SLAMonitor({ workspaceId }: SLAMonitorProps) {
  const [loading, setLoading] = useState(true);
  const [slaData, setSlaData] = useState<SLAData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSLAMetrics() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/sla?workspace_id=${workspaceId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch SLA metrics');
        }
        
        const data = await response.json();
        setSlaData(data);
      } catch (error) {
        console.error('Error fetching SLA metrics:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
        setSlaData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchSLAMetrics();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchSLAMetrics, 30000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-mc-accent-green';
      case 'warning': return 'text-mc-accent-yellow';
      case 'danger': return 'text-mc-accent-red';
      default: return 'text-mc-text-secondary';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'success': return 'bg-mc-accent-green/10 border-mc-accent-green/20';
      case 'warning': return 'bg-mc-accent-yellow/10 border-mc-accent-yellow/20';
      case 'danger': return 'bg-mc-accent-red/10 border-mc-accent-red/20';
      default: return 'bg-mc-bg-tertiary border-mc-border';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'danger': return <AlertCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mc-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading SLA metrics...</p>
        </div>
      </div>
    );
  }

  if (error || !slaData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-mc-accent-red mx-auto mb-4" />
          <p className="text-mc-text mb-2">Failed to load SLA metrics</p>
          <p className="text-mc-text-secondary text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Convert SLA data to metrics format for display
  const metrics: SLAMetric[] = [
    {
      id: 'inbox_dispatch_time',
      name: 'Inbox Dispatch Time',
      currentValue: slaData.inbox_dispatch_time.current,
      target: slaData.inbox_dispatch_time.target,
      unit: slaData.inbox_dispatch_time.unit,
      status: slaData.inbox_dispatch_time.status,
      violations: slaData.inbox_dispatch_time.violations
    },
    {
      id: 'completion_rate',
      name: 'Task Completion Rate',
      currentValue: slaData.completion_rate.current,
      target: slaData.completion_rate.target,
      unit: slaData.completion_rate.unit,
      status: slaData.completion_rate.status
    },
    {
      id: 'queue_wait_time',
      name: 'Current Queue Wait',
      currentValue: slaData.queue_wait_time.current,
      target: slaData.queue_wait_time.target,
      unit: slaData.queue_wait_time.unit,
      status: slaData.queue_wait_time.status,
      violations: slaData.queue_wait_time.violations
    },
    {
      id: 'avg_completion_time',
      name: 'Average Completion Time',
      currentValue: slaData.avg_completion_time.current,
      target: slaData.avg_completion_time.target,
      unit: slaData.avg_completion_time.unit,
      status: slaData.avg_completion_time.status
    },
    {
      id: 'error_rate',
      name: 'Task Error Rate',
      currentValue: slaData.error_rate.current,
      target: slaData.error_rate.target,
      unit: slaData.error_rate.unit,
      status: slaData.error_rate.status
    }
  ];

  return (
    <div className="h-full bg-mc-bg overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-mc-text mb-2">SLA Monitor</h2>
              <p className="text-mc-text-secondary">Service level agreement compliance tracking</p>
            </div>
            {slaData.sla_violations.total > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-mc-accent-red/10 border border-mc-accent-red/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-mc-accent-red" />
                <span className="text-mc-accent-red font-medium">
                  {slaData.sla_violations.total} SLA Violation{slaData.sla_violations.total !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SLA Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {metrics.map((metric) => (
            <div key={metric.id} className={`border rounded-lg p-4 ${getStatusBg(metric.status)}`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-mc-text">{metric.name}</h3>
                <div className={getStatusColor(metric.status)}>
                  {getStatusIcon(metric.status)}
                </div>
              </div>
              
              <div className="mb-2">
                <span className="text-2xl font-bold text-mc-text">
                  {metric.currentValue}{metric.unit}
                </span>
                {metric.violations !== undefined && metric.violations > 0 && (
                  <div className="text-sm text-mc-accent-red mt-1">
                    {metric.violations} violation{metric.violations !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-mc-text-secondary">
                  Target: {metric.target}{metric.unit}
                </span>
                <span className={getStatusColor(metric.status)}>
                  {metric.status === 'success' && 'Within SLA'}
                  {metric.status === 'warning' && 'At Risk'}
                  {metric.status === 'danger' && 'Breached'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 w-full bg-mc-bg-tertiary rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${
                    metric.status === 'success' ? 'bg-mc-accent-green' :
                    metric.status === 'warning' ? 'bg-mc-accent-yellow' :
                    'bg-mc-accent-red'
                  }`}
                  style={{ 
                    width: `${Math.min((metric.currentValue / metric.target) * 100, 100)}%` 
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* SLA Violations */}
        {slaData.sla_violations.total > 0 && (
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 mb-6">
            <h3 className="font-medium text-mc-text mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-mc-accent-red" />
              Current SLA Violations ({slaData.sla_violations.total})
            </h3>
            <div className="space-y-3">
              {slaData.sla_violations.tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-mc-accent-red/5 border border-mc-accent-red/20 rounded-lg">
                  <div>
                    <div className="font-medium text-mc-text">{task.title}</div>
                    <div className="text-sm text-mc-text-secondary">
                      Status: {task.status} • Created: {new Date(task.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-mc-accent-red font-medium">
                      {task.wait_time}m overdue
                    </div>
                    <div className="text-sm text-mc-text-secondary">
                      SLA: 5m
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Status */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <h3 className="font-medium text-mc-text mb-4">System Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${getStatusColor(
                metrics.find(m => m.id === 'inbox_dispatch_time')?.status || 'success'
              )}`}>
                {metrics.find(m => m.id === 'inbox_dispatch_time')?.status === 'success' ? 'GREEN' : 
                 metrics.find(m => m.id === 'inbox_dispatch_time')?.status === 'warning' ? 'YELLOW' : 'RED'}
              </div>
              <div className="text-sm text-mc-text-secondary">Dispatch SLA</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getStatusColor(
                metrics.find(m => m.id === 'completion_rate')?.status || 'success'
              )}`}>
                {metrics.find(m => m.id === 'completion_rate')?.status === 'success' ? 'GREEN' : 
                 metrics.find(m => m.id === 'completion_rate')?.status === 'warning' ? 'YELLOW' : 'RED'}
              </div>
              <div className="text-sm text-mc-text-secondary">Completion Rate</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getStatusColor(
                metrics.find(m => m.id === 'queue_wait_time')?.status || 'success'
              )}`}>
                {metrics.find(m => m.id === 'queue_wait_time')?.status === 'success' ? 'GREEN' : 
                 metrics.find(m => m.id === 'queue_wait_time')?.status === 'warning' ? 'YELLOW' : 'RED'}
              </div>
              <div className="text-sm text-mc-text-secondary">Queue SLA</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}