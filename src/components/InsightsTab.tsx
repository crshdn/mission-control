'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Clock, AlertTriangle, Zap, RefreshCw, Lightbulb } from 'lucide-react';

interface TimelineEvent {
  type: string;
  timestamp: string;
  duration_ms?: number;
  annotation?: string;
  severity?: 'info' | 'warning' | 'error';
}

interface InsightsData {
  id: string;
  task_id: string;
  duration_seconds: number;
  time_to_first_commit: number | null;
  build_attempts: number;
  test_pass_rate: number | null;
  stall_count: number;
  error_count: number;
  bottleneck_summary: string;
  improved_prompt: string | null;
  timeline_data: TimelineEvent[];
  generated_at: string;
}

const EVENT_COLORS: Record<string, string> = {
  dispatch: '#3B82F6',    // blue
  file_created: '#22C55E', // green
  file_modified: '#22C55E',
  error: '#EF4444',       // red
  stall: '#EAB308',       // yellow
  build: '#A855F7',       // purple
  test: '#A855F7',
  pr_created: '#14B8A6',  // teal
  completed: '#14B8A6',
  recovery: '#F97316',    // orange
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function TimelineChart({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <div className="text-mc-text-secondary text-sm py-4">No timeline events to display.</div>;
  }

  const startTime = new Date(events[0].timestamp).getTime();
  const endTime = new Date(events[events.length - 1].timestamp).getTime();
  const totalSpan = Math.max(endTime - startTime, 1);
  const barHeight = 28;
  const chartHeight = events.length * (barHeight + 4) + 20;
  const labelWidth = 100;
  const chartWidth = 500;

  return (
    <div className="overflow-x-auto">
      <svg width={labelWidth + chartWidth + 20} height={chartHeight} className="block">
        {events.map((event, i) => {
          const offset = new Date(event.timestamp).getTime() - startTime;
          const x = labelWidth + (offset / totalSpan) * chartWidth;
          const barW = Math.max(
            ((event.duration_ms || 1000) / (totalSpan || 1)) * chartWidth,
            4
          );
          const y = i * (barHeight + 4) + 4;
          const color = EVENT_COLORS[event.type] || '#6B7280';

          return (
            <g key={i}>
              <text x={0} y={y + barHeight / 2 + 4} fontSize={11} fill="currentColor" className="text-mc-text-secondary">
                {event.type}
              </text>
              <rect x={x} y={y} width={Math.min(barW, chartWidth - (x - labelWidth))} height={barHeight} rx={4} fill={color} opacity={0.85} />
              {event.annotation && (
                <title>{event.annotation}</title>
              )}
            </g>
          );
        })}
        {/* Time axis */}
        <line x1={labelWidth} y1={chartHeight - 8} x2={labelWidth + chartWidth} y2={chartHeight - 8} stroke="currentColor" strokeOpacity={0.2} />
        <text x={labelWidth} y={chartHeight} fontSize={10} fill="currentColor" className="text-mc-text-secondary">0s</text>
        <text x={labelWidth + chartWidth} y={chartHeight} fontSize={10} fill="currentColor" className="text-mc-text-secondary" textAnchor="end">
          {formatDuration(Math.round(totalSpan / 1000))}
        </text>
      </svg>
    </div>
  );
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-mc-bg-tertiary rounded-lg p-3 flex items-start gap-3">
      <div className="text-mc-accent mt-0.5">{icon}</div>
      <div>
        <div className="text-xs text-mc-text-secondary">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
        {sub && <div className="text-xs text-mc-text-secondary">{sub}</div>}
      </div>
    </div>
  );
}

export function InsightsTab({ taskId }: { taskId: string }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/insights`);
      if (res.ok) {
        setData(await res.json());
      } else if (res.status === 404) {
        setData(null);
      } else {
        setError('Failed to load insights');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const generateInsights = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/insights`, { method: 'POST' });
      if (res.ok) {
        setData(await res.json());
      } else {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }));
        setError(err.error);
      }
    } catch {
      setError('Network error');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => { fetchInsights(); }, [taskId]);

  if (loading) {
    return <div className="text-mc-text-secondary text-sm py-8 text-center">Loading insights...</div>;
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="w-10 h-10 mx-auto text-mc-text-secondary mb-3" />
        <p className="text-mc-text-secondary text-sm mb-4">No insights generated yet for this task.</p>
        <button
          onClick={generateInsights}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
        >
          <Zap className="w-4 h-4" />
          {generating ? 'Generating...' : 'Generate Insights'}
        </button>
        {error && <p className="text-mc-accent-red text-sm mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard
          icon={<Clock className="w-4 h-4" />}
          label="Duration"
          value={formatDuration(data.duration_seconds)}
        />
        <MetricCard
          icon={<Zap className="w-4 h-4" />}
          label="First Commit"
          value={data.time_to_first_commit !== null ? formatDuration(data.time_to_first_commit) : 'N/A'}
        />
        <MetricCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Build Attempts"
          value={String(data.build_attempts)}
        />
        <MetricCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Errors"
          value={String(data.error_count)}
          sub={data.stall_count > 0 ? `${data.stall_count} stall(s)` : undefined}
        />
        <MetricCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Test Pass Rate"
          value={data.test_pass_rate !== null ? `${Math.round(data.test_pass_rate * 100)}%` : 'N/A'}
        />
      </div>

      {/* Bottleneck Summary */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-mc-accent" />
          Bottleneck Analysis
        </h3>
        <div className="bg-mc-bg-tertiary rounded-lg p-3 text-sm">{data.bottleneck_summary}</div>
      </div>

      {/* Timeline */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-mc-accent" />
          Activity Timeline
        </h3>
        <div className="bg-mc-bg-tertiary rounded-lg p-3">
          <TimelineChart events={data.timeline_data} />
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-mc-text-secondary">
            {Object.entries(EVENT_COLORS).map(([key, color]) => (
              <span key={key} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: color }} />
                {key}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Improved Prompt */}
      {data.improved_prompt && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-mc-accent" />
            Suggested Improved Prompt
          </h3>
          <div className="bg-mc-bg-tertiary rounded-lg p-3 text-sm whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {data.improved_prompt}
          </div>
        </div>
      )}

      {/* Regenerate button */}
      <div className="flex justify-end">
        <button
          onClick={generateInsights}
          disabled={generating}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-mc-text-secondary hover:text-mc-text border border-mc-border rounded hover:bg-mc-bg-tertiary disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>
    </div>
  );
}
