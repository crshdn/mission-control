'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react';

interface SLAMonitorProps {
  workspaceId: string;
}

interface SLAMetric {
  id: string;
  name: string;
  currentValue: number;
  target: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'success' | 'warning' | 'danger';
}

export function SLAMonitor({ workspaceId }: SLAMonitorProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<SLAMetric[]>([]);

  useEffect(() => {
    async function fetchSLAMetrics() {
      try {
        setLoading(true);
        
        // Fetch tasks to calculate real inbox timing metrics
        const response = await fetch(`/api/tasks?workspace_id=${workspaceId}&limit=100`);
        if (!response.ok) {
          throw new Error('Failed to fetch tasks');
        }
        
        const tasks = await response.json();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Calculate metrics from real task data
        const recentTasks = tasks.filter((task: any) => 
          new Date(task.created_at) > last24Hours
        );
        
        // Inbox time tracking - time from creation to first dispatch
        const inboxTimes = recentTasks
          .filter((task: any) => task.assigned_agent_id && task.updated_at !== task.created_at)
          .map((task: any) => {
            const created = new Date(task.created_at);
            const dispatched = new Date(task.updated_at);
            return (dispatched.getTime() - created.getTime()) / 1000; // seconds
          });
        
        const avgInboxTime = inboxTimes.length > 0 
          ? inboxTimes.reduce((a: number, b: number) => a + b, 0) / inboxTimes.length 
          : 0;
        
        // Task completion rate
        const completedTasks = recentTasks.filter((task: any) => 
          task.status === 'completed' || task.status === 'review'
        );
        const completionRate = recentTasks.length > 0 
          ? (completedTasks.length / recentTasks.length) * 100 
          : 0;
        
        // Failed task rate
        const failedTasks = recentTasks.filter((task: any) => 
          task.status === 'failed' || task.status === 'error'
        );
        const errorRate = recentTasks.length > 0 
          ? (failedTasks.length / recentTasks.length) * 100 
          : 0;
        
        // Current queue wait time (tasks in inbox)
        const queuedTasks = tasks.filter((task: any) => 
          task.status === 'pending' && !task.assigned_agent_id
        );
        const currentQueueTimes = queuedTasks.map((task: any) => {
          const created = new Date(task.created_at);
          return (now.getTime() - created.getTime()) / 1000; // seconds
        });
        const avgQueueTime = currentQueueTimes.length > 0 
          ? currentQueueTimes.reduce((a: number, b: number) => a + b, 0) / currentQueueTimes.length 
          : 0;
        
        // Average task completion time
        const taskCompletionTimes = completedTasks
          .filter((task: any) => task.result_captured_at)
          .map((task: any) => {
            const created = new Date(task.created_at);
            const completed = new Date(task.result_captured_at);
            return (completed.getTime() - created.getTime()) / (1000 * 60); // minutes
          });
        const avgCompletionTime = taskCompletionTimes.length > 0 
          ? taskCompletionTimes.reduce((a: number, b: number) => a + b, 0) / taskCompletionTimes.length 
          : 0;
        
        const calculatedMetrics: SLAMetric[] = [
          {
            id: 'inbox_dispatch_time',
            name: 'Inbox Dispatch Time',
            currentValue: Math.round(avgInboxTime),
            target: 60,
            unit: 'seconds',
            trend: avgInboxTime > 60 ? 'up' : avgInboxTime < 30 ? 'down' : 'stable',
            status: avgInboxTime > 120 ? 'danger' : avgInboxTime > 60 ? 'warning' : 'success'
          },
          {
            id: 'task_completion_rate',
            name: 'Task Completion Rate',
            currentValue: Math.round(completionRate * 10) / 10,
            target: 95.0,
            unit: '%',
            trend: completionRate > 95 ? 'up' : completionRate < 85 ? 'down' : 'stable',
            status: completionRate < 85 ? 'danger' : completionRate < 95 ? 'warning' : 'success'
          },
          {
            id: 'avg_completion_time',
            name: 'Average Completion Time',
            currentValue: Math.round(avgCompletionTime),
            target: 30,
            unit: 'minutes',
            trend: avgCompletionTime > 30 ? 'up' : avgCompletionTime < 15 ? 'down' : 'stable',
            status: avgCompletionTime > 60 ? 'danger' : avgCompletionTime > 30 ? 'warning' : 'success'
          },
          {
            id: 'error_rate',
            name: 'Task Error Rate',
            currentValue: Math.round(errorRate * 10) / 10,
            target: 5.0,
            unit: '%',
            trend: errorRate > 5 ? 'up' : errorRate < 2 ? 'down' : 'stable',
            status: errorRate > 10 ? 'danger' : errorRate > 5 ? 'warning' : 'success'
          },
          {
            id: 'queue_wait_time',
            name: 'Current Queue Wait',
            currentValue: Math.round(avgQueueTime / 60), // convert to minutes
            target: 5,
            unit: 'minutes',
            trend: avgQueueTime > 300 ? 'up' : avgQueueTime < 120 ? 'down' : 'stable',
            status: avgQueueTime > 600 ? 'danger' : avgQueueTime > 300 ? 'warning' : 'success'
          }
        ];

        setMetrics(calculatedMetrics);
      } catch (error) {
        console.error('Error fetching SLA metrics:', error);
        setMetrics([]);
      } finally {
        setLoading(false);
      }
    }

    fetchSLAMetrics();
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

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4" />;
      case 'down': return <TrendingDown className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
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

  return (
    <div className="h-full bg-mc-bg overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-mc-text mb-2">SLA Monitor</h2>
          <p className="text-mc-text-secondary">Service level agreement compliance tracking</p>
        </div>

        {/* SLA Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {metrics.map((metric) => (
            <div key={metric.id} className={`border rounded-lg p-4 ${getStatusBg(metric.status)}`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-mc-text">{metric.name}</h3>
                <div className={getStatusColor(metric.status)}>
                  {getTrendIcon(metric.trend)}
                </div>
              </div>
              
              <div className="mb-2">
                <span className="text-2xl font-bold text-mc-text">
                  {metric.currentValue}{metric.unit}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-mc-text-secondary">
                  Target: {metric.target}{metric.unit}
                </span>
                <span className={getStatusColor(metric.status)}>
                  {metric.status === 'success' && <CheckCircle className="w-4 h-4" />}
                  {metric.status === 'warning' && <AlertCircle className="w-4 h-4" />}
                  {metric.status === 'danger' && <AlertCircle className="w-4 h-4" />}
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

        {/* Recent Alerts */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <h3 className="font-medium text-mc-text mb-4">Recent SLA Events</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <AlertCircle className="w-4 h-4 text-mc-accent-yellow mt-0.5" />
              <div>
                <span className="text-mc-text">Task completion rate dropped below target</span>
                <div className="text-mc-text-secondary">2 minutes ago</div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <CheckCircle className="w-4 h-4 text-mc-accent-green mt-0.5" />
              <div>
                <span className="text-mc-text">Response time improved to 2.3s</span>
                <div className="text-mc-text-secondary">15 minutes ago</div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <AlertCircle className="w-4 h-4 text-mc-accent-red mt-0.5" />
              <div>
                <span className="text-mc-text">System experienced brief outage</span>
                <div className="text-mc-text-secondary">1 hour ago</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}