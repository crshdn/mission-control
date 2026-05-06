'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Gauge,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  task_type?: string | null;
  qc_status?: string | null;
  tags?: string | string[] | null;
  created_at: string;
  updated_at: string;
  assigned_agent_id?: string | null;
  assigned_agent_name?: string;
  assigned_agent?: {
    id?: string;
    name?: string;
    avatar_emoji?: string;
  };
}

interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: 'working' | 'standby' | 'offline';
  avatar_emoji?: string;
  current_task?: string | null;
  working_on?: string | null;
  last_active?: string | null;
}

interface Opportunity {
  id: string;
  query: string;
  impressions: number;
  position: number;
  priority: 'high' | 'medium' | 'low';
  page?: string;
  ctr?: number;
  flagged_at?: string;
}

interface Measurement {
  id: string;
  tool: string;
  query: string;
  before_position: number;
  after_position: number;
  before_impressions: number;
  after_impressions: number;
  measured_at: string;
  deployed_at: string;
}

interface EventItem {
  id: string;
  type: string;
  message: string;
  created_at: string;
  agent?: {
    name?: string;
    avatar_emoji?: string;
  };
  task?: {
    id?: string;
    title?: string;
  };
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const OPEN_STATUSES = new Set(['pending_dispatch', 'planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review']);
const EXECUTION_STATUSES = new Set(['assigned', 'in_progress', 'testing', 'review']);
const REVIEW_STATUSES = new Set(['testing', 'review']);
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const STATUS_LABELS: Record<string, string> = {
  pending_dispatch: 'Pending Dispatch',
  planning: 'Planning',
  inbox: 'Inbox',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  testing: 'Testing',
  review: 'Review',
  done: 'Done',
};

function parseTags(raw: TaskItem['tags']): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-GB').format(value);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date);
}

function isWithinDays(value: string, days: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function getGrowthStage(task: TaskItem): string {
  const title = task.title.toLowerCase();
  const tags = parseTags(task.tags).map((tag) => tag.toLowerCase());

  if (task.status === 'done') return 'complete';
  if (tags.some((tag) => tag.includes('measuring')) || title.includes('measure')) return 'measuring';
  if (task.status === 'review' || task.status === 'testing') return 'deployed';
  if (tags.some((tag) => tag.includes('content')) || title.includes('content') || title.includes('copy') || title.includes('blog')) {
    return 'content';
  }
  return 'research';
}

function getStageTone(stage: string) {
  switch (stage) {
    case 'research':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'content':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    case 'deployed':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'measuring':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'complete':
      return 'bg-green-500/15 text-green-300 border-green-500/30';
    default:
      return 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border';
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case 'done':
      return 'bg-green-500/15 text-green-300 border-green-500/30';
    case 'review':
    case 'testing':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'in_progress':
    case 'assigned':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'inbox':
    case 'planning':
    case 'pending_dispatch':
      return 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border';
    default:
      return 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border';
  }
}

function getPriorityTone(priority: string) {
  switch (priority) {
    case 'urgent':
    case 'high':
      return 'text-red-300';
    case 'medium':
    case 'normal':
      return 'text-amber-300';
    default:
      return 'text-green-300';
  }
}

function getMeasurementResult(before: number, after: number) {
  const change = before - after;
  if (change >= 10) return { label: 'Win', tone: 'text-green-300' };
  if (change <= -10) return { label: 'Loss', tone: 'text-red-300' };
  return { label: 'Neutral', tone: 'text-mc-text-secondary' };
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accentClass,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Gauge;
  accentClass: string;
}) {
  return (
    <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-mc-text-secondary">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-mc-text">{value}</p>
          <p className="mt-2 text-sm text-mc-text-secondary">{hint}</p>
        </div>
        <div className={`rounded-xl border p-3 ${accentClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function CountBadge({ label, count, tone }: { label: string; count: number; tone?: string }) {
  return (
    <div className={`rounded-full border px-3 py-1 text-xs font-medium ${tone || 'border-mc-border text-mc-text-secondary bg-mc-bg-tertiary'}`}>
      {label}: <span className="text-mc-text">{count}</span>
    </div>
  );
}

export default function GrowthPage() {
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatched, setDispatched] = useState<Set<string>>(new Set());
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [tasksRes, agentsRes, eventsRes, opportunitiesRes, measurementsRes] = await Promise.all([
        fetch('/api/tasks', { cache: 'no-store' }),
        fetch('/api/agents', { cache: 'no-store' }),
        fetch('/api/events?limit=8', { cache: 'no-store' }),
        fetch('/api/growth/opportunities', { cache: 'no-store' }),
        fetch('/api/growth/measurements', { cache: 'no-store' }),
      ]);

      if (![tasksRes, agentsRes, eventsRes, opportunitiesRes, measurementsRes].every((res) => res.ok)) {
        throw new Error('One or more dashboard data sources failed to load');
      }

      const [tasksData, agentsData, eventsData, opportunitiesData, measurementsData] = await Promise.all([
        tasksRes.json(),
        agentsRes.json(),
        eventsRes.json(),
        opportunitiesRes.json(),
        measurementsRes.json(),
      ]);

      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setAgents(Array.isArray(agentsData) ? agentsData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setOpportunities(Array.isArray(opportunitiesData) ? opportunitiesData : []);
      setMeasurements(Array.isArray(measurementsData) ? measurementsData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchData(true);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [fetchData]);

  const derived = useMemo(() => {
    const openTasks = tasks.filter((task) => OPEN_STATUSES.has(task.status));
    const activeExecutionTasks = tasks.filter((task) => EXECUTION_STATUSES.has(task.status));
    const reviewQueue = tasks.filter((task) => REVIEW_STATUSES.has(task.status));
    const completedLast7d = tasks.filter((task) => task.status === 'done' && isWithinDays(task.updated_at, 7)).length;
    const createdLast7d = tasks.filter((task) => isWithinDays(task.created_at, 7)).length;
    const failedQc = tasks.filter((task) => task.qc_status === 'failed' && task.status !== 'done').length;
    const activeAgents = agents.filter((agent) => agent.status === 'working');
    const standbyAgents = agents.filter((agent) => agent.status === 'standby');
    const wins = measurements.filter((item) => item.before_position - item.after_position >= 10).length;
    const losses = measurements.filter((item) => item.before_position - item.after_position <= -10).length;
    const recentActivity = events.filter((event) => isWithinDays(event.created_at, 1)).length;
    const highPriorityOpportunities = opportunities.filter((item) => item.priority === 'high').length;

    const growthTasks = tasks
      .filter((task) => {
        const title = task.title.toLowerCase();
        const tags = parseTags(task.tags).map((tag) => tag.toLowerCase());
        return (
          tags.some((tag) => /(growth|seo|ranking|keyword|content)/.test(tag)) ||
          /(growth|seo|search optimization|keyword|gsc|content)/.test(title)
        );
      })
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));

    const statusCounts = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});

    const priorityCounts = tasks.reduce<Record<string, number>>((acc, task) => {
      const key = task.priority || 'normal';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const typeCounts = tasks.reduce<Record<string, number>>((acc, task) => {
      const key = task.task_type || 'untyped';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const today = new Date();
    const throughput = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - (6 - index));
      const next = new Date(date);
      next.setDate(date.getDate() + 1);
      const created = tasks.filter((task) => {
        const createdAt = new Date(task.created_at);
        return createdAt >= date && createdAt < next;
      }).length;
      const completed = tasks.filter((task) => {
        const updatedAt = new Date(task.updated_at);
        return task.status === 'done' && updatedAt >= date && updatedAt < next;
      }).length;
      return { label: formatDay(date.toISOString()), created, completed };
    });

    let healthScore = 88;
    if (openTasks.length > 0 && activeAgents.length === 0) healthScore -= 30;
    if (reviewQueue.length > 3) healthScore -= 12;
    else if (reviewQueue.length > 0) healthScore -= 4;
    if (failedQc > 0) healthScore -= 18;
    if (recentActivity === 0) healthScore -= 10;
    if (wins > losses && wins > 0) healthScore += 4;
    if (highPriorityOpportunities > 0 && openTasks.length === 0) healthScore -= 4;
    healthScore = Math.max(0, Math.min(100, healthScore));

    let healthLabel = 'Healthy';
    let healthTone = 'text-green-300 border-green-500/30 bg-green-500/15';
    let healthSummary = 'Pipeline is moving cleanly and ready for the next optimization cycle.';

    if (openTasks.length > 0 && activeAgents.length === 0) {
      healthLabel = 'Stalled';
      healthTone = 'text-red-300 border-red-500/30 bg-red-500/15';
      healthSummary = 'There is open work in Mission Control, but no agents appear active right now.';
    } else if (reviewQueue.length > 0 || failedQc > 0) {
      healthLabel = 'Watch';
      healthTone = 'text-amber-300 border-amber-500/30 bg-amber-500/15';
      healthSummary = 'Most risk is concentrated in testing and review. Clear the queue to restore flow.';
    } else if (opportunities.length > 0 && openTasks.length === 0) {
      healthLabel = 'Ready';
      healthTone = 'text-blue-300 border-blue-500/30 bg-blue-500/15';
      healthSummary = 'No active growth work is open. Opportunity queue is ready to dispatch.';
    }

    return {
      openTasks,
      activeExecutionTasks,
      reviewQueue,
      completedLast7d,
      createdLast7d,
      failedQc,
      activeAgents,
      standbyAgents,
      wins,
      losses,
      growthTasks,
      statusCounts,
      priorityCounts,
      typeCounts,
      throughput,
      highPriorityOpportunities,
      healthScore,
      healthLabel,
      healthTone,
      healthSummary,
    };
  }, [agents, events, measurements, opportunities, tasks]);

  const sortedOpportunities = useMemo(() => {
    return [...opportunities].sort((a, b) => {
      const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      if (b.impressions !== a.impressions) return b.impressions - a.impressions;
      return a.position - b.position;
    });
  }, [opportunities]);

  const topMeasurements = useMemo(() => {
    return [...measurements].sort((a, b) => +new Date(b.measured_at) - +new Date(a.measured_at));
  }, [measurements]);

  async function handleDispatch(opportunity: Opportunity) {
    setDispatchingId(opportunity.id);
    setDispatchError(null);

    try {
      const response = await fetch('/api/growth/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: opportunity.query,
          impressions: opportunity.impressions,
          position: opportunity.position,
          page: opportunity.page,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Dispatch failed');
      }

      setDispatched((current) => new Set(current).add(opportunity.id));
      await fetchData(true);
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Dispatch failed');
    } finally {
      setDispatchingId(null);
    }
  }

  const maxThroughput = Math.max(1, ...derived.throughput.flatMap((item) => [item.created, item.completed]));

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      <div className="sticky top-0 z-10 border-b border-mc-border bg-mc-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="rounded-lg border border-mc-border bg-mc-bg-secondary p-2 text-mc-text-secondary transition hover:bg-mc-bg-tertiary hover:text-mc-text"
              title="Back to Mission Control"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-mc-accent-cyan" />
                <h1 className="text-xl font-semibold text-mc-text">Growth Dashboard</h1>
              </div>
              <p className="mt-1 text-sm text-mc-text-secondary">
                Task metrics, agent status, pipeline health, and SEO opportunity flow for Mission Control.
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-mc-border bg-mc-bg-secondary px-4 py-2 text-sm text-mc-text-secondary transition hover:bg-mc-bg-tertiary hover:text-mc-text disabled:opacity-60"
          >
            {loading || refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {dispatchError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Dispatch failed: {dispatchError}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Health score" value={derived.healthScore} hint={derived.healthSummary} icon={Gauge} accentClass={derived.healthTone} />
          <MetricCard label="Total tasks" value={formatNumber(tasks.length)} hint={`${formatNumber(derived.openTasks.length)} currently open`} icon={FolderKanban} accentClass="border-mc-border bg-mc-bg-tertiary text-mc-accent-cyan" />
          <MetricCard label="Completed 7d" value={formatNumber(derived.completedLast7d)} hint={`${formatNumber(derived.createdLast7d)} created in the same window`} icon={CheckCircle2} accentClass="border-green-500/30 bg-green-500/15 text-green-300" />
          <MetricCard label="Active agents" value={formatNumber(derived.activeAgents.length)} hint={`${formatNumber(derived.standbyAgents.length)} on standby`} icon={Users} accentClass="border-blue-500/30 bg-blue-500/15 text-blue-300" />
          <MetricCard label="Opportunities" value={formatNumber(opportunities.length)} hint={`${formatNumber(derived.highPriorityOpportunities)} high priority queued`} icon={Zap} accentClass="border-amber-500/30 bg-amber-500/15 text-amber-300" />
          <MetricCard label="Measurement wins" value={formatNumber(derived.wins)} hint={`${formatNumber(derived.losses)} losses tracked`} icon={Rocket} accentClass="border-purple-500/30 bg-purple-500/15 text-purple-300" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-mc-accent-cyan" />
              <h2 className="text-base font-semibold text-mc-text">Pipeline health</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-mc-border bg-mc-bg p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">Intake</p>
                <p className="mt-3 text-2xl font-semibold text-mc-text">{opportunities.length}</p>
                <p className="mt-2 text-sm text-mc-text-secondary">{derived.highPriorityOpportunities} high-priority opportunities waiting to dispatch.</p>
              </div>
              <div className="rounded-xl border border-mc-border bg-mc-bg p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">Execution</p>
                <p className="mt-3 text-2xl font-semibold text-mc-text">{derived.activeExecutionTasks.length}</p>
                <p className="mt-2 text-sm text-mc-text-secondary">{derived.activeAgents.length} agents currently active across build, testing, and review.</p>
              </div>
              <div className="rounded-xl border border-mc-border bg-mc-bg p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">QA / Review</p>
                <p className="mt-3 text-2xl font-semibold text-mc-text">{derived.reviewQueue.length}</p>
                <p className="mt-2 text-sm text-mc-text-secondary">{derived.failedQc} open QC failure{derived.failedQc === 1 ? '' : 's'} in the live queue.</p>
              </div>
              <div className="rounded-xl border border-mc-border bg-mc-bg p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">Impact</p>
                <p className="mt-3 text-2xl font-semibold text-mc-text">{measurements.length}</p>
                <p className="mt-2 text-sm text-mc-text-secondary">{derived.wins} wins, {derived.losses} losses, rest neutral from measured changes.</p>
              </div>
            </div>
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${derived.healthTone}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">Pipeline status: {derived.healthLabel}</span>
                <span>{derived.healthScore}/100</span>
              </div>
              <p className="mt-2 text-sm text-current/90">{derived.healthSummary}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-mc-accent-purple" />
              <h2 className="text-base font-semibold text-mc-text">7 day throughput</h2>
            </div>
            <div className="mt-5 space-y-4">
              {derived.throughput.map((day) => (
                <div key={day.label}>
                  <div className="mb-1 flex items-center justify-between text-xs text-mc-text-secondary">
                    <span>{day.label}</span>
                    <span>{day.created} created, {day.completed} completed</span>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-mc-bg">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${(day.created / maxThroughput) * 100}%` }} />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-mc-bg">
                      <div className="h-full rounded-full bg-green-400" style={{ width: `${(day.completed / maxThroughput) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-mc-text-secondary">
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-400" />Created</span>
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-400" />Completed</span>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr,1fr]">
          <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-mc-accent" />
              <h2 className="text-base font-semibold text-mc-text">Task metrics</h2>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.18em] text-mc-text-secondary">By status</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(derived.statusCounts).map(([status, count]) => (
                    <CountBadge
                      key={status}
                      label={STATUS_LABELS[status] || status}
                      count={count}
                      tone={`border ${getStatusTone(status)}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.18em] text-mc-text-secondary">By priority</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(derived.priorityCounts).map(([priority, count]) => (
                    <CountBadge key={priority} label={priority} count={count} />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.18em] text-mc-text-secondary">By type</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(derived.typeCounts).map(([type, count]) => (
                    <CountBadge key={type} label={type.replace(/_/g, ' ')} count={count} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-mc-accent-cyan" />
              <h2 className="text-base font-semibold text-mc-text">Agent status</h2>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <CountBadge label="Working" count={derived.activeAgents.length} tone="border border-blue-500/30 bg-blue-500/15 text-blue-300" />
              <CountBadge label="Standby" count={derived.standbyAgents.length} tone="border border-mc-border bg-mc-bg-tertiary text-mc-text-secondary" />
              <CountBadge label="Offline" count={agents.filter((agent) => agent.status === 'offline').length} tone="border border-red-500/30 bg-red-500/15 text-red-300" />
            </div>
            <div className="mt-4 space-y-3">
              {agents.map((agent) => (
                <div key={agent.id} className="rounded-xl border border-mc-border bg-mc-bg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{agent.avatar_emoji || '•'}</span>
                        <div>
                          <p className="font-medium text-mc-text">{agent.name}</p>
                          <p className="text-sm text-mc-text-secondary">{agent.role}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-mc-text-secondary">
                        {agent.current_task || agent.working_on || 'No current assignment reported.'}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${agent.status === 'working' ? 'border-blue-500/30 bg-blue-500/15 text-blue-300' : agent.status === 'offline' ? 'border-red-500/30 bg-red-500/15 text-red-300' : 'border-mc-border bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-mc-text-secondary">Last active: {formatDate(agent.last_active)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-mc-accent-cyan" />
              <h2 className="text-base font-semibold text-mc-text">Active optimizations</h2>
            </div>
            <div className="mt-4 overflow-x-auto">
              {loading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-mc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading active optimizations…</div>
              ) : derived.growthTasks.length === 0 ? (
                <p className="py-6 text-sm text-mc-text-secondary">No growth tasks found yet. Dispatch research from the opportunity queue below.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-mc-border text-left text-xs uppercase tracking-[0.18em] text-mc-text-secondary">
                      <th className="px-3 py-3">Task</th>
                      <th className="px-3 py-3">Stage</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Owner</th>
                      <th className="px-3 py-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.growthTasks.slice(0, 8).map((task) => {
                      const stage = getGrowthStage(task);
                      return (
                        <tr key={task.id} className="border-b border-mc-border/60 last:border-b-0">
                          <td className="px-3 py-3 text-mc-text">{task.title}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium capitalize ${getStageTone(stage)}`}>
                              {stage}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(task.status)}`}>
                              {STATUS_LABELS[task.status] || task.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-mc-text-secondary">{task.assigned_agent?.name || task.assigned_agent_name || 'Unassigned'}</td>
                          <td className="px-3 py-3 text-mc-text-secondary">{formatDate(task.updated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-mc-accent-purple" />
              <h2 className="text-base font-semibold text-mc-text">Recent activity</h2>
            </div>
            <div className="mt-4 space-y-3">
              {events.length === 0 ? (
                <p className="py-6 text-sm text-mc-text-secondary">No recent events recorded.</p>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-mc-border bg-mc-bg p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-mc-text">{event.message}</p>
                      <span className="text-xs text-mc-text-secondary">{formatDate(event.created_at)}</span>
                    </div>
                    <p className="mt-2 text-xs text-mc-text-secondary">
                      {(event.agent?.name || 'System')} {event.task?.title ? `• ${event.task.title}` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-300" />
              <h2 className="text-base font-semibold text-mc-text">Opportunity queue</h2>
            </div>
            <div className="mt-4 overflow-x-auto">
              {opportunities.length === 0 ? (
                <p className="py-6 text-sm text-mc-text-secondary">No SEO opportunities queued right now.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-mc-border text-left text-xs uppercase tracking-[0.18em] text-mc-text-secondary">
                      <th className="px-3 py-3">Query</th>
                      <th className="px-3 py-3">Impressions</th>
                      <th className="px-3 py-3">Position</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOpportunities.slice(0, 8).map((opportunity) => {
                      const isDispatching = dispatchingId === opportunity.id;
                      const alreadyDispatched = dispatched.has(opportunity.id);

                      return (
                        <tr key={opportunity.id} className="border-b border-mc-border/60 last:border-b-0">
                          <td className="px-3 py-3">
                            <div className="font-medium text-mc-text">{opportunity.query}</div>
                            {opportunity.page ? <div className="text-xs text-mc-text-secondary">{opportunity.page}</div> : null}
                          </td>
                          <td className="px-3 py-3 text-mc-text">{formatNumber(opportunity.impressions)}</td>
                          <td className="px-3 py-3 text-mc-text">{opportunity.position.toFixed(1)}</td>
                          <td className={`px-3 py-3 font-medium capitalize ${getPriorityTone(opportunity.priority)}`}>{opportunity.priority}</td>
                          <td className="px-3 py-3">
                            {alreadyDispatched ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/15 px-3 py-1 text-xs font-medium text-green-300">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Dispatched
                              </span>
                            ) : (
                              <button
                                onClick={() => handleDispatch(opportunity)}
                                disabled={isDispatching || !!dispatchingId}
                                className="inline-flex items-center gap-2 rounded-full border border-mc-border bg-mc-bg px-3 py-1.5 text-xs font-medium text-mc-text transition hover:bg-mc-bg-tertiary disabled:opacity-60"
                              >
                                {isDispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                                {isDispatching ? 'Dispatching…' : 'Dispatch research'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-300" />
              <h2 className="text-base font-semibold text-mc-text">Measurement results</h2>
            </div>
            <div className="mt-4 space-y-3">
              {topMeasurements.length === 0 ? (
                <p className="py-6 text-sm text-mc-text-secondary">No measurement results yet.</p>
              ) : (
                topMeasurements.slice(0, 6).map((measurement) => {
                  const result = getMeasurementResult(measurement.before_position, measurement.after_position);
                  const change = measurement.before_position - measurement.after_position;
                  return (
                    <div key={measurement.id} className="rounded-xl border border-mc-border bg-mc-bg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-mc-text">{measurement.tool}</p>
                          <p className="text-sm text-mc-text-secondary">{measurement.query}</p>
                        </div>
                        <span className={`text-xs font-medium ${result.tone}`}>{result.label}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">Before</p>
                          <p className="mt-1 text-mc-text">{measurement.before_position.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">After</p>
                          <p className="mt-1 text-mc-text">{measurement.after_position.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">Change</p>
                          <p className={`mt-1 font-medium ${change > 0 ? 'text-green-300' : change < 0 ? 'text-red-300' : 'text-mc-text'}`}>
                            {change > 0 ? '+' : ''}{change.toFixed(1)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-mc-border bg-mc-bg-secondary p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-mc-accent-yellow" />
            <h2 className="text-base font-semibold text-mc-text">Verification notes</h2>
          </div>
          <p className="mt-3 text-sm text-mc-text-secondary">
            This dashboard combines live Mission Control task and agent data with the SEO opportunity queue and measurement files.
            It refreshes automatically every five minutes and supports manual refresh plus research dispatch from the queue.
          </p>
        </section>
      </main>
    </div>
  );
}
