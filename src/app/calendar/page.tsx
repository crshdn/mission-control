'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { startOfWeek, addWeeks, subWeeks, addDays, format, isSameDay } from 'date-fns';
import { AgentBanner } from '@/components/AgentBanner';
import { SkeletonList } from '@/components/LoadingSkeleton';
import { formatTokens } from '@/lib/cost';
import type { GatewayCronJob, GatewayCronRun, GatewaySession } from '@/lib/types';

type ParsedSchedule = { hours: number[]; weekdays: number[] };
type JobFrequency = 'hourly' | 'daily' | 'weekly' | 'custom';

function parseCronExpr(expr: string): ParsedSchedule {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return { hours: [], weekdays: [] };

  const hourField = parts[1];
  const dowField = parts[4];

  const hours = parseField(hourField, 0, 23);
  const weekdays = parseField(dowField, 0, 6);
  return { hours, weekdays };
}

function parseField(field: string, min: number, max: number): number[] {
  if (field === '*') return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const result: number[] = [];
  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      const range = stepMatch[1] === '*' ? [min, max] : stepMatch[1].split('-').map(Number);
      for (let i = range[0]; i <= (range[1] ?? range[0]); i += step) result.push(i);
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let i = lo; i <= hi; i++) result.push(i);
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n)) result.push(n);
    }
  }
  return result.filter((n) => n >= min && n <= max);
}

function getJobFrequency(expr: string): JobFrequency {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return 'custom';
  const [, hour, , , dow] = parts;
  if (hour === '*' || hour.includes('/')) return 'hourly';
  if (dow === '*') return 'daily';
  return 'weekly';
}

function getSessionsAtCell(sessions: GatewaySession[], day: Date, hour: number): GatewaySession[] {
  return sessions.filter((s) => {
    const d = new Date(s.updatedAt);
    return isSameDay(d, day) && d.getHours() === hour;
  });
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const [jobs, setJobs] = useState<GatewayCronJob[]>([]);
  const [sessions, setSessions] = useState<GatewaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedJob, setSelectedJob] = useState<GatewayCronJob | null>(null);
  const [runs, setRuns] = useState<GatewayCronRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [visibleJobs, setVisibleJobs] = useState<Set<string>>(new Set());
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [hfExpanded, setHfExpanded] = useState(false);
  const [overflowCell, setOverflowCell] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [cronRes, sessionsRes] = await Promise.all([
        fetch('/api/gateway/cron'),
        fetch('/api/gateway/sessions'),
      ]);
      if (cronRes.ok) setJobs(await cronRes.json());
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (filtersInitialized || jobs.length === 0) return;
    const visible = new Set<string>();
    for (const job of jobs) {
      const freq = getJobFrequency(job.schedule.expr);
      if (freq !== 'hourly') visible.add(job.id);
    }
    setVisibleJobs(visible);
    setFiltersInitialized(true);
  }, [jobs, filtersInitialized]);

  const fetchRuns = useCallback(async (jobId: string) => {
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/gateway/cron/${jobId}/runs`);
      if (res.ok) setRuns(await res.json());
    } catch { setRuns([]); }
    finally { setRunsLoading(false); }
  }, []);

  const selectJob = (job: GatewayCronJob) => {
    setSelectedJob(job);
    fetchRuns(job.id);
  };

  const toggleJobVisibility = (jobId: string) => {
    setVisibleJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const showAll = () => setVisibleJobs(new Set(jobs.map((j) => j.id)));
  const hideHourly = () => {
    setVisibleJobs((prev) => {
      const next = new Set(prev);
      for (const job of jobs) {
        if (getJobFrequency(job.schedule.expr) === 'hourly') next.delete(job.id);
      }
      return next;
    });
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const jobSlots = jobs.map((job) => {
    const parsed = parseCronExpr(job.schedule.expr);
    const frequency = getJobFrequency(job.schedule.expr);
    return { job, frequency, ...parsed };
  });

  const hourlyJobs = jobSlots.filter((s) => s.frequency === 'hourly');

  function getJobsAt(dayOfWeek: number, hour: number) {
    return jobSlots.filter(
      (s) => visibleJobs.has(s.job.id) && s.weekdays.includes(dayOfWeek) && s.hours.includes(hour),
    );
  }

  const upcomingCronJobs = jobs
    .filter((j) => j.enabled && j.next_run)
    .sort((a, b) => (a.next_run ?? 0) - (b.next_run ?? 0))
    .slice(0, 10);

  const recentSessions = sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in">
      <AgentBanner />

      <div className="mt-6 flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-mc-text">Cron Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-mc-text min-w-40 text-center">
            {format(weekStart, 'MMM d')} &ndash; {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : jobs.length === 0 && sessions.length === 0 ? (
        <div className="text-center py-12 text-mc-text-secondary">
          <p className="text-lg mb-2">No activity found</p>
          <p className="text-sm">Cron jobs and session activity will appear here.</p>
        </div>
      ) : (
        <>
          {/* High-Frequency Summary */}
          {hourlyJobs.length > 0 && (
            <div className="mb-3 bg-mc-bg-secondary border border-mc-border rounded-lg">
              <button
                onClick={() => setHfExpanded((p) => !p)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-mc-bg-tertiary/50 transition-colors rounded-lg"
              >
                <span className="text-xs font-medium text-mc-text-secondary">
                  High-Frequency Jobs ({hourlyJobs.length})
                </span>
                <span className="ml-auto text-mc-text-secondary">
                  {hfExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {hfExpanded && (
                <div className="px-3 pb-2 space-y-1 border-t border-mc-border pt-2">
                  {hourlyJobs.map((s) => (
                    <div key={s.job.id} className="flex items-center gap-2 text-xs">
                      <span className="text-mc-text font-medium">{s.job.label}</span>
                      <span className="text-mc-text-secondary font-mono text-[10px]">
                        {s.job.schedule.expr}
                      </span>
                      <span
                        className={`ml-auto px-1.5 py-0.5 rounded text-[10px] ${
                          s.job.enabled
                            ? 'bg-mc-accent-green/15 text-mc-accent-green'
                            : 'bg-mc-accent-red/15 text-mc-accent-red'
                        }`}
                      >
                        {s.job.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filter toggles */}
          {jobSlots.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-mc-text-secondary mr-1">Filter:</span>
              {jobSlots.map((s) => {
                const freq = s.frequency;
                return (
                  <label
                    key={s.job.id}
                    className="flex items-center gap-1.5 text-xs text-mc-text cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={visibleJobs.has(s.job.id)}
                      onChange={() => toggleJobVisibility(s.job.id)}
                      className="rounded border-mc-border text-mc-accent focus:ring-mc-accent h-3 w-3"
                    />
                    <span>{s.job.label}</span>
                    <span className="text-mc-text-secondary/60 text-[10px]">({freq})</span>
                  </label>
                );
              })}
              <div className="flex gap-1 ml-2">
                <button
                  onClick={showAll}
                  className="px-2 py-0.5 rounded text-[10px] text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary transition-colors"
                >
                  Show all
                </button>
                <button
                  onClick={hideHourly}
                  className="px-2 py-0.5 rounded text-[10px] text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary transition-colors"
                >
                  Hide hourly
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <div className="flex-1 overflow-auto">
              <div className="grid grid-cols-[60px_repeat(7,1fr)] min-w-[700px]">
                {/* Header row */}
                <div className="sticky top-0 bg-mc-bg z-10" />
                {weekDays.map((day, di) => (
                  <div
                    key={di}
                    className={`sticky top-0 z-10 text-center py-2 text-xs font-medium border-b border-mc-border ${
                      isSameDay(day, today)
                        ? 'bg-mc-accent/10 text-mc-accent'
                        : 'bg-mc-bg text-mc-text-secondary'
                    }`}
                  >
                    {DAY_LABELS[di]}
                    <br />
                    <span className="text-[10px]">{format(day, 'd')}</span>
                  </div>
                ))}

                {/* Hour rows */}
                {HOURS.map((hour) => (
                  <GridRow
                    key={hour}
                    hour={hour}
                    weekDays={weekDays}
                    today={today}
                    sessions={sessions}
                    getJobsAt={getJobsAt}
                    selectedJob={selectedJob}
                    selectJob={selectJob}
                    overflowCell={overflowCell}
                    setOverflowCell={setOverflowCell}
                  />
                ))}
              </div>
            </div>

            {/* Run history panel */}
            {selectedJob && (
              <div className="w-72 shrink-0 bg-mc-bg-secondary border border-mc-border rounded-lg p-4 h-fit sticky top-20 animate-fade-in">
                <h3 className="font-medium text-sm text-mc-text mb-1">{selectedJob.label}</h3>
                <p className="text-[10px] text-mc-text-secondary mb-1 font-mono">
                  {selectedJob.schedule.expr}
                </p>
                <p className="text-[10px] text-mc-text-secondary mb-3">
                  {selectedJob.enabled ? 'Enabled' : 'Disabled'}
                  {selectedJob.next_run && (
                    <> &middot; Next: {new Date(selectedJob.next_run).toLocaleString()}</>
                  )}
                </p>

                <h4 className="text-xs text-mc-text-secondary mb-2">Recent Runs</h4>
                {runsLoading ? (
                  <SkeletonList rows={3} />
                ) : runs.length === 0 ? (
                  <p className="text-xs text-mc-text-secondary">No runs recorded</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-auto">
                    {runs.slice(0, 20).map((run) => (
                      <div key={run.id} className="p-2 rounded bg-mc-bg border border-mc-border text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              run.status === 'success'
                                ? 'bg-mc-accent-green'
                                : run.status === 'running'
                                  ? 'bg-mc-accent-yellow animate-pulse'
                                  : 'bg-mc-accent-red'
                            }`}
                          />
                          <span className="text-mc-text capitalize">{run.status}</span>
                          <span className="text-mc-text-secondary ml-auto text-[10px]">
                            {new Date(run.started_at).toLocaleTimeString()}
                          </span>
                        </div>
                        {run.output && (
                          <pre className="mt-1 text-[10px] text-mc-text-secondary truncate">
                            {run.output}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Agenda list view */}
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming scheduled jobs */}
            {upcomingCronJobs.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-mc-text mb-3">Upcoming Scheduled Jobs</h2>
                <div className="space-y-1">
                  {upcomingCronJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center gap-3 px-3 py-2 bg-mc-bg-secondary border border-mc-border rounded-lg"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-mc-accent-purple shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-mc-text truncate">{job.label}</p>
                        <p className="text-[10px] text-mc-text-secondary">
                          {job.next_run ? new Date(job.next_run).toLocaleString() : 'No next run'}
                        </p>
                      </div>
                      <span className="text-[10px] text-mc-text-secondary font-mono shrink-0">
                        {job.schedule.expr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent session activity */}
            {recentSessions.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-mc-text mb-3">Recent Session Activity</h2>
                <div className="space-y-1">
                  {recentSessions.map((session) => (
                    <div
                      key={session.key}
                      className="flex items-center gap-3 px-3 py-2 bg-mc-bg-secondary border border-mc-border rounded-lg"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-mc-accent-green shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-mc-text truncate">
                          {session.displayName ?? session.label ?? session.key}
                        </p>
                        <p className="text-[10px] text-mc-text-secondary">
                          {new Date(session.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {session.totalTokens != null && session.totalTokens > 0 && (
                          <span className="text-[10px] text-mc-text-secondary">
                            {formatTokens(session.totalTokens)}
                          </span>
                        )}
                        {session.model && (
                          <p className="text-[10px] text-mc-text-secondary">{session.model}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type JobSlot = { job: GatewayCronJob; frequency: JobFrequency; hours: number[]; weekdays: number[] };

function GridRow({
  hour,
  weekDays,
  today,
  sessions,
  getJobsAt,
  selectedJob,
  selectJob,
  overflowCell,
  setOverflowCell,
}: {
  hour: number;
  weekDays: Date[];
  today: Date;
  sessions: GatewaySession[];
  getJobsAt: (dow: number, h: number) => JobSlot[];
  selectedJob: GatewayCronJob | null;
  selectJob: (job: GatewayCronJob) => void;
  overflowCell: string | null;
  setOverflowCell: (key: string | null) => void;
}) {
  return (
    <>
      <div className="text-[10px] text-mc-text-secondary pr-2 text-right pt-1 border-r border-mc-border">
        {String(hour).padStart(2, '0')}:00
      </div>
      {Array.from({ length: 7 }, (_, di) => {
        const cronDow = di === 6 ? 0 : di + 1;
        const slotsHere = getJobsAt(cronDow, hour);
        const sessionsHere = getSessionsAtCell(sessions, weekDays[di], hour);
        const cellKey = `${hour}-${di}`;
        const showOverflow = slotsHere.length > 2;
        const visibleSlots = showOverflow ? slotsHere.slice(0, 2) : slotsHere;
        const overflowCount = slotsHere.length - 2;

        return (
          <div
            key={cellKey}
            className={`relative min-h-[28px] border-b border-r border-mc-border/30 p-0.5 ${
              isSameDay(weekDays[di], today) ? 'bg-mc-accent/5' : ''
            }`}
          >
            {visibleSlots.map((s) => (
              <button
                key={s.job.id}
                onClick={() => selectJob(s.job)}
                className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate transition-colors ${
                  selectedJob?.id === s.job.id
                    ? 'bg-mc-accent/25 text-mc-accent'
                    : 'bg-mc-accent-purple/15 text-mc-accent-purple hover:bg-mc-accent-purple/25'
                }`}
              >
                {s.job.label}
              </button>
            ))}
            {showOverflow && (
              <div className="relative">
                <button
                  onClick={() => setOverflowCell(overflowCell === cellKey ? null : cellKey)}
                  className="text-[10px] text-mc-accent-purple/70 hover:text-mc-accent-purple px-1"
                >
                  +{overflowCount} more
                </button>
                {overflowCell === cellKey && (
                  <div className="absolute left-0 top-full z-20 bg-mc-bg-secondary border border-mc-border rounded shadow-lg p-1.5 min-w-[120px] space-y-0.5 animate-fade-in">
                    {slotsHere.slice(2).map((s) => (
                      <button
                        key={s.job.id}
                        onClick={() => {
                          selectJob(s.job);
                          setOverflowCell(null);
                        }}
                        className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate transition-colors ${
                          selectedJob?.id === s.job.id
                            ? 'bg-mc-accent/25 text-mc-accent'
                            : 'bg-mc-accent-purple/15 text-mc-accent-purple hover:bg-mc-accent-purple/25'
                        }`}
                      >
                        {s.job.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Session activity dots */}
            {sessionsHere.length > 0 && (
              <div className="flex gap-0.5 mt-0.5 px-0.5" title={`${sessionsHere.length} session${sessionsHere.length > 1 ? 's' : ''} active`}>
                {sessionsHere.slice(0, 4).map((s) => (
                  <span
                    key={s.key}
                    className="w-1.5 h-1.5 rounded-full bg-mc-accent-green"
                    title={s.displayName ?? s.label ?? s.key}
                  />
                ))}
                {sessionsHere.length > 4 && (
                  <span className="text-[8px] text-mc-accent-green">+{sessionsHere.length - 4}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
