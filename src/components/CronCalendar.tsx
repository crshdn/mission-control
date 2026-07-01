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

// Parse cron schedule to get occurrences for the week
function getCronOccurrences(schedule: string, jobs: CronJob[]): Map<string, CronJob[]> {
  const occurrences = new Map<string, CronJob[]>();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (const job of jobs) {
    const parts = job.schedule.split(' ');
    if (parts.length < 5) continue;
    
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    // Determine which days this job runs
    let runDays: number[] = [];
    if (dayOfWeek === '*') {
      runDays = [0, 1, 2, 3, 4, 5, 6]; // Every day
    } else if (dayOfWeek.includes(',')) {
      runDays = dayOfWeek.split(',').map(Number);
    } else if (dayOfWeek.includes('-')) {
      const [start, end] = dayOfWeek.split('-').map(Number);
      for (let i = start; i <= end; i++) runDays.push(i);
    } else {
      runDays = [parseInt(dayOfWeek)];
    }
    
    // Determine hour(s)
    let runHours: number[] = [];
    if (hour === '*') {
      runHours = Array.from({ length: 24 }, (_, i) => i);
    } else if (hour.startsWith('*/')) {
      const interval = parseInt(hour.slice(2));
      for (let h = 0; h < 24; h += interval) runHours.push(h);
    } else if (hour.includes(',')) {
      runHours = hour.split(',').map(Number);
    } else {
      runHours = [parseInt(hour)];
    }
    
    // Add to occurrences map
    for (const day of runDays) {
      for (const h of runHours) {
        const key = `${days[day]}-${h}`;
        const existing = occurrences.get(key) || [];
        existing.push(job);
        occurrences.set(key, existing);
      }
    }
  }
  
  return occurrences;
}

function WeeklyCalendarView({ jobs, getStatusColor }: { jobs: CronJob[]; getStatusColor: (status: string) => string }) {
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]; // Every 2 hours for compact view
  
  // Separate high-frequency jobs (more than 4x per day) from calendar view
  const frequentJobs: CronJob[] = [];
  const calendarJobs: CronJob[] = [];
  
  for (const job of jobs) {
    const parts = job.schedule.split(' ');
    if (parts.length < 5) {
      calendarJobs.push(job);
      continue;
    }
    const hour = parts[1];
    // Check if it runs frequently (every X hours where X <= 6)
    if (hour.startsWith('*/') && parseInt(hour.slice(2)) <= 6) {
      frequentJobs.push(job);
    } else if (hour === '*') {
      frequentJobs.push(job);
    } else {
      calendarJobs.push(job);
    }
  }
  
  const occurrences = getCronOccurrences('', calendarJobs);
  
  // Get current day/hour for highlighting
  const now = new Date();
  const currentDay = dayMap[now.getDay()];
  const currentHour = now.getHours();
  
  return (
    <>
    {/* Job Detail Modal */}
    {selectedJob && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedJob(null)}>
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-mc-text">{selectedJob.name}</h3>
            <button onClick={() => setSelectedJob(null)} className="text-mc-text-secondary hover:text-mc-text">✕</button>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-mc-text-secondary">Status: </span>
              <span className={getStatusColor(selectedJob.status)}>{selectedJob.status}</span>
            </div>
            <div>
              <span className="text-mc-text-secondary">Schedule: </span>
              <span className="text-mc-text font-mono">{selectedJob.schedule}</span>
            </div>
            <div>
              <span className="text-mc-text-secondary">Description: </span>
              <span className="text-mc-text">{selectedJob.description || 'No description'}</span>
            </div>
            {selectedJob.agent && (
              <div>
                <span className="text-mc-text-secondary">Agent: </span>
                <span className="text-mc-text">{selectedJob.agent}</span>
              </div>
            )}
            {selectedJob.lastRun && (
              <div>
                <span className="text-mc-text-secondary">Last Run: </span>
                <span className="text-mc-text">{new Date(selectedJob.lastRun).toLocaleString()}</span>
              </div>
            )}
            <div>
              <span className="text-mc-text-secondary">Next Run: </span>
              <span className="text-mc-text">{new Date(selectedJob.nextRun).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    )}
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header row with days */}
        <div className="grid grid-cols-8 gap-1 mb-1">
          <div className="p-2 text-xs text-mc-text-secondary font-medium">Time</div>
          {days.map(day => (
            <div 
              key={day} 
              className={`p-2 text-xs font-medium text-center rounded ${
                day === currentDay ? 'bg-mc-accent/20 text-mc-accent' : 'text-mc-text-secondary'
              }`}
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* Time rows */}
        {hours.map(hour => (
          <div key={hour} className="grid grid-cols-8 gap-1 mb-1">
            <div className="p-2 text-xs text-mc-text-secondary">
              {hour.toString().padStart(2, '0')}:00
            </div>
            {days.map(day => {
              // Check this hour and next hour for jobs
              const dayIndex = dayMap.indexOf(day === 'Sun' ? 'Sun' : day);
              const actualDay = day === 'Sun' ? 'Sun' : day;
              const jobsThisSlot: CronJob[] = [];
              
              for (let h = hour; h < hour + 2; h++) {
                const key = `${actualDay}-${h}`;
                const slotJobs = occurrences.get(key) || [];
                jobsThisSlot.push(...slotJobs);
              }
              
              const isCurrentSlot = day === currentDay && currentHour >= hour && currentHour < hour + 2;
              
              return (
                <div 
                  key={`${day}-${hour}`}
                  className={`p-1 min-h-[40px] rounded border ${
                    isCurrentSlot 
                      ? 'border-mc-accent bg-mc-accent/10' 
                      : 'border-mc-border/30 bg-mc-bg'
                  }`}
                >
                  {jobsThisSlot.length > 0 && (
                    <div className="space-y-1">
                      {jobsThisSlot.slice(0, 2).map((job, idx) => (
                        <button 
                          key={`${job.id}-${idx}`}
                          onClick={() => setSelectedJob(job)}
                          className={`text-xs px-1 py-0.5 rounded truncate ${getStatusColor(job.status)} bg-mc-bg-tertiary hover:bg-mc-bg-secondary cursor-pointer w-full text-left`}
                          title={job.name}
                        >
                          {job.name.length > 10 ? job.name.slice(0, 10) + '…' : job.name}
                        </button>
                      ))}
                      {jobsThisSlot.length > 2 && (
                        <div className="text-xs text-mc-text-secondary px-1">
                          +{jobsThisSlot.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
    
    {/* Frequent Jobs - shown separately to reduce noise */}
    {frequentJobs.length > 0 && (
      <div className="mt-4 p-3 bg-mc-bg rounded-lg border border-mc-border/50">
        <div className="text-xs text-mc-text-secondary mb-2">High-frequency jobs (not shown on calendar):</div>
        <div className="flex flex-wrap gap-2">
          {frequentJobs.map(job => (
            <button
              key={job.id}
              onClick={() => setSelectedJob(job)}
              className={`text-xs px-2 py-1 rounded ${getStatusColor(job.status)} bg-mc-bg-tertiary hover:bg-mc-bg-secondary`}
            >
              {job.name}
            </button>
          ))}
        </div>
      </div>
    )}
    </>
  );
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

        {/* Calendar View - Weekly Grid */}
        {viewMode === 'calendar' && (
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <WeeklyCalendarView jobs={cronJobs} getStatusColor={getStatusColor} />
          </div>
        )}
      </div>
    </div>
  );
}