'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

interface ProductInsightsData {
  stats: {
    total_tasks: number;
    avg_duration: number;
    avg_errors: number;
    avg_stalls: number;
    avg_build_attempts: number;
    avg_test_pass_rate: number | null;
  };
  success_rate: number | null;
  recent_insights: Array<{
    id: string;
    task_id: string;
    duration_seconds: number;
    error_count: number;
    stall_count: number;
    bottleneck_summary: string;
    generated_at: string;
  }>;
  failure_patterns: Array<{
    bottleneck_summary: string;
    cnt: number;
  }>;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-mc-text-secondary text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-mc-text-secondary mt-1">{sub}</div>}
    </div>
  );
}

export function ProductInsights({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/products/${productId}/insights`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setData)
      .catch(() => setError('Failed to load product insights'))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return <div className="text-mc-text-secondary text-sm py-8 text-center">Loading product insights...</div>;
  }

  if (error || !data) {
    return <div className="text-mc-accent-red text-sm py-8 text-center">{error || 'No data'}</div>;
  }

  const { stats, success_rate, recent_insights, failure_patterns } = data;

  if (stats.total_tasks === 0) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-10 h-10 mx-auto text-mc-text-secondary mb-3" />
        <p className="text-mc-text-secondary text-sm">No task insights generated yet for this product.</p>
        <p className="text-mc-text-secondary text-xs mt-1">Insights are auto-generated when tasks complete.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<BarChart3 className="w-3.5 h-3.5" />}
          label="Tasks Analyzed"
          value={String(stats.total_tasks)}
        />
        <StatCard
          icon={<CheckCircle className="w-3.5 h-3.5" />}
          label="Success Rate"
          value={success_rate !== null ? `${Math.round(success_rate * 100)}%` : 'N/A'}
        />
        <StatCard
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Avg Duration"
          value={formatDuration(stats.avg_duration)}
        />
        <StatCard
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label="Avg Errors"
          value={String(Math.round(stats.avg_errors * 10) / 10)}
          sub={`${Math.round(stats.avg_stalls * 10) / 10} avg stalls`}
        />
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <div className="text-xs text-mc-text-secondary mb-1">Avg Build Attempts</div>
          <div className="text-xl font-bold">{Math.round(stats.avg_build_attempts * 10) / 10}</div>
        </div>
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <div className="text-xs text-mc-text-secondary mb-1">Avg Test Pass Rate</div>
          <div className="text-xl font-bold">
            {stats.avg_test_pass_rate !== null ? `${Math.round(stats.avg_test_pass_rate * 100)}%` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Common Failure Patterns */}
      {failure_patterns.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-mc-accent-red" />
            Common Failure Patterns
          </h3>
          <div className="space-y-2">
            {failure_patterns.map((fp, i) => (
              <div key={i} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3 flex items-start justify-between gap-3">
                <span className="text-sm">{fp.bottleneck_summary}</span>
                <span className="text-xs text-mc-text-secondary whitespace-nowrap">{fp.cnt}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Insights */}
      {recent_insights.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-mc-accent" />
            Recent Task Insights
          </h3>
          <div className="space-y-2">
            {recent_insights.map((insight) => (
              <div key={insight.id} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
                <div className="flex items-center justify-between text-xs text-mc-text-secondary mb-1">
                  <span>{formatDuration(insight.duration_seconds)}</span>
                  <span>{new Date(insight.generated_at).toLocaleDateString()}</span>
                </div>
                <div className="text-sm">{insight.bottleneck_summary}</div>
                {(insight.error_count > 0 || insight.stall_count > 0) && (
                  <div className="flex gap-3 mt-1 text-xs text-mc-text-secondary">
                    {insight.error_count > 0 && <span className="text-mc-accent-red">{insight.error_count} errors</span>}
                    {insight.stall_count > 0 && <span className="text-yellow-500">{insight.stall_count} stalls</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
