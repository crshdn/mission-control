'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Play, Pause, Plus, Settings, AlertCircle } from 'lucide-react';

interface CronCalendarProps {
  workspaceId: string;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  description: string;
  lastRun?: string;
  nextRun: string;
  status: 'active' | 'paused' | 'failed';
  agent?: string;
}

export function CronCalendar({ workspaceId }: CronCalendarProps) {
  const [loading, setLoading] = useState(true);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    async function fetchCronJobs() {
      try {
        setLoading(true);
        const response = await fetch('/api/cron');
        if (response.ok) {
          const jobs = await response.json();
          setCronJobs(jobs);
        } else {
          console.error('Failed to fetch cron jobs:', response.statusText);
          setCronJobs([]);
        }
      } catch (error) {
        console.error('Error fetching cron jobs:', error);
        setCronJobs([]);
      } finally {
        setLoading(false);
      }
    }

    fetchCronJobs();
  }, [workspaceId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-mc-accent-green';
      case 'paused': return 'text-mc-accent-yellow';
      case 'failed': return 'text-mc-accent-red';
      default: return 'text-mc-text-secondary';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'active': return 'bg-mc-accent-green/10';
      case 'paused': return 'bg-mc-accent-yellow/10';
      case 'failed': return 'bg-mc-accent-red/10';
      default: return 'bg-mc-bg-tertiary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Play className="w-4 h-4" />;
      case 'paused': return <Pause className="w-4 h-4" />;
      case 'failed': return <AlertCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const parseCronSchedule = (schedule: string) => {
    // Simple cron schedule parser for display
    const parts = schedule.split(' ');
    const minute = parts[0];
    const hour = parts[1];
    const day = parts[2];
    const month = parts[3];
    const weekday = parts[4];

    if (schedule === '*/15 * * * *') return 'Every 15 minutes';
    if (schedule === '0 */6 * * *') return 'Every 6 hours';
    if (schedule === '0 */2 * * *') return 'Every 2 hours';
    if (schedule === '0 9 * * *') return 'Daily at 09:00';
    if (schedule === '0 2 * * 0') return 'Weekly on Sunday at 02:00';
    
    return schedule;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mc-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading scheduled tasks...</p>
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
            <h2 className="text-2xl font-bold text-mc-text mb-2">Cron Calendar</h2>
            <p className="text-mc-text-secondary">Scheduled task management and monitoring</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-mc-border">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-sm ${
                  viewMode === 'list'
                    ? 'bg-mc-accent text-mc-bg'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1 text-sm ${
                  viewMode === 'calendar'
                    ? 'bg-mc-accent text-mc-bg'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                Calendar
              </button>
            </div>
            <button className="flex items-center gap-2 px-3 py-2 bg-mc-accent text-mc-bg rounded-lg hover:bg-mc-accent/90">
              <Plus className="w-4 h-4" />
              New Job
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Play className="w-4 h-4 text-mc-accent-green" />
              <span className="text-sm text-mc-text-secondary">Active Jobs</span>
            </div>
            <div className="text-xl font-bold text-mc-text">
              {cronJobs.filter(job => job.status === 'active').length}
            </div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Pause className="w-4 h-4 text-mc-accent-yellow" />
              <span className="text-sm text-mc-text-secondary">Paused</span>
            </div>
            <div className="text-xl font-bold text-mc-text">
              {cronJobs.filter(job => job.status === 'paused').length}
            </div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-mc-accent-red" />
              <span className="text-sm text-mc-text-secondary">Failed</span>
            </div>
            <div className="text-xl font-bold text-mc-text">
              {cronJobs.filter(job => job.status === 'failed').length}
            </div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-mc-accent" />
              <span className="text-sm text-mc-text-secondary">Total Jobs</span>
            </div>
            <div className="text-xl font-bold text-mc-text">
              {cronJobs.length}
            </div>
          </div>
        </div>

        {/* Job List */}
        {viewMode === 'list' && (
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg">
            <div className="p-4 border-b border-mc-border">
              <h3 className="font-medium text-mc-text">Scheduled Jobs</h3>
            </div>
            <div className="divide-y divide-mc-border">
              {cronJobs.map((job) => (
                <div key={job.id} className="p-4 hover:bg-mc-bg-tertiary">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-medium text-mc-text">{job.name}</h4>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusBg(job.status)} ${getStatusColor(job.status)}`}>
                          {getStatusIcon(job.status)}
                          <span className="capitalize">{job.status}</span>
                        </div>
                      </div>
                      <p className="text-sm text-mc-text-secondary mb-2">{job.description}</p>
                      <div className="flex items-center gap-4 text-sm text-mc-text-secondary">
                        <span>Schedule: {parseCronSchedule(job.schedule)}</span>
                        {job.agent && <span>Agent: {job.agent}</span>}
                        {job.lastRun && <span>Last: {formatDate(job.lastRun)}</span>}
                        <span>Next: {formatDate(job.nextRun)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        className="p-2 hover:bg-mc-bg rounded"
                        title="Settings"
                      >
                        <Settings className="w-4 h-4 text-mc-text-secondary" />
                      </button>
                      <button 
                        className="p-2 hover:bg-mc-bg rounded"
                        title={job.status === 'active' ? 'Pause' : 'Resume'}
                      >
                        {job.status === 'active' ? (
                          <Pause className="w-4 h-4 text-mc-text-secondary" />
                        ) : (
                          <Play className="w-4 h-4 text-mc-text-secondary" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="flex items-center justify-center h-64 text-mc-text-secondary">
              <div className="text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Calendar view coming soon</p>
                <p className="text-sm">Use list view to manage scheduled jobs</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}