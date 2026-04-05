'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Activity,
  Search,
  Zap,
  GitMerge,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { HealthBadge } from '@/components/autopilot/HealthBadge';
import { HealthChart } from '@/components/autopilot/HealthChart';
import type {
  HealthScoreResponse,
  HealthComponentScore,
  HealthWeightConfig,
  Product,
} from '@/lib/types';

const COMPONENT_CONFIG: Record<
  string,
  { icon: typeof Activity; color: string; bgColor: string }
> = {
  research: { icon: Search, color: '#58a6ff', bgColor: 'rgba(88, 166, 255, 0.1)' },
  pipeline: { icon: Activity, color: '#a371f7', bgColor: 'rgba(163, 113, 247, 0.1)' },
  swipe: { icon: Zap, color: '#d29922', bgColor: 'rgba(210, 153, 34, 0.1)' },
  build: { icon: GitMerge, color: '#3fb950', bgColor: 'rgba(63, 185, 80, 0.1)' },
  cost: { icon: DollarSign, color: '#db61a2', bgColor: 'rgba(219, 97, 162, 0.1)' },
};

const CHART_KEY_MAP: Record<string, 'overall' | 'research_freshness' | 'pipeline_depth' | 'swipe_velocity' | 'build_success' | 'cost_efficiency'> = {
  research: 'research_freshness',
  pipeline: 'pipeline_depth',
  swipe: 'swipe_velocity',
  build: 'build_success',
  cost: 'cost_efficiency',
};

export default function HealthDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.productId as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [health, setHealth] = useState<HealthScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const [prodRes, healthRes] = await Promise.all([
        fetch(`/api/products/${productId}`),
        fetch(`/api/products/${productId}/health`),
      ]);
      if (prodRes.ok) setProduct(await prodRes.json());
      if (healthRes.ok) setHealth(await healthRes.json());
    } catch (err) {
      logger.error('Failed to load health data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Listen for SSE updates
  useEffect(() => {
    function handleUpdate(e: Event) {
      const { productId: updatedId } = (e as CustomEvent).detail;
      if (updatedId === productId) {
        fetchHealth();
      }
    }
    window.addEventListener('health-score-updated', handleUpdate);
    return () => window.removeEventListener('health-score-updated', handleUpdate);
  }, [productId, fetchHealth]);

  async function handleExport(format: 'csv' | 'json') {
    try {
      const res = await fetch(
        `/api/products/${productId}/health/export?format=${format}`
      );
      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `health_${format === 'csv' ? 'export.csv' : 'export.json'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('Export failed:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">💊</div>
          <p className="text-mc-text-secondary">Loading health data...</p>
        </div>
      </div>
    );
  }

  if (!health || !product) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-mc-text-secondary">Product not found</p>
          <Link href="/autopilot" className="text-mc-accent hover:underline mt-2 inline-block">
            ← Back to products
          </Link>
        </div>
      </div>
    );
  }

  const overallScore = health.score.overall_score;
  const scoreColor =
    overallScore >= 70 ? 'text-green-400' : overallScore >= 40 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-mc-bg">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/autopilot/${productId}`)}
                className="p-2 rounded-lg hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="text-2xl">{product.icon}</span>
              <div>
                <h1 className="text-lg font-bold text-mc-text">{product.name}</h1>
                <p className="text-xs text-mc-text-secondary">Health Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setRefreshing(true);
                  fetchHealth();
                }}
                disabled={refreshing}
                className="min-h-9 px-3 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary flex items-center gap-2 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <div className="relative group">
                <button className="min-h-9 px-3 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <div className="absolute right-0 top-full mt-1 bg-mc-bg-secondary border border-mc-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                  <button
                    onClick={() => handleExport('csv')}
                    className="block w-full text-left px-4 py-2 text-sm text-mc-text hover:bg-mc-bg-tertiary rounded-t-lg"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="block w-full text-left px-4 py-2 text-sm text-mc-text hover:bg-mc-bg-tertiary rounded-b-lg"
                  >
                    Export JSON
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Overall Score Card */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-6">
          <div className="flex items-center gap-6">
            <HealthBadge score={overallScore} size={80} />
            <div>
              <h2 className="text-2xl font-bold text-mc-text">
                Overall Health: <span className={scoreColor}>{overallScore}</span>
                <span className="text-mc-text-secondary text-lg">/100</span>
              </h2>
              <p className="text-sm text-mc-text-secondary mt-1">
                Composite score based on {health.components.filter((c) => c.effectiveWeight > 0).length} active components
              </p>
            </div>
          </div>

          {/* Overall trend chart */}
          {health.history.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-3">
                30-Day Trend
              </h3>
              <HealthChart
                history={health.history}
                component="overall"
                label="Overall Score"
                color="#58a6ff"
              />
            </div>
          )}
        </div>

        {/* Component Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {health.components.map((comp) => {
            const config = COMPONENT_CONFIG[comp.name];
            const Icon = config?.icon || Activity;
            const chartKey = CHART_KEY_MAP[comp.name];
            const isDisabled = health.weights.disabled.includes(comp.name);

            return (
              <div
                key={comp.name}
                className={`bg-mc-bg-secondary border rounded-xl p-5 transition-all ${
                  isDisabled
                    ? 'border-mc-border/50 opacity-60'
                    : 'border-mc-border hover:border-mc-border/80'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: config?.bgColor }}
                    >
                      <Icon className="w-4 h-4" style={{ color: config?.color }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-mc-text">{comp.label}</h3>
                      <p className="text-xs text-mc-text-secondary">{comp.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold" style={{ color: config?.color }}>
                      {comp.score}
                    </div>
                    <div className="text-[10px] text-mc-text-secondary">
                      {isDisabled ? 'DISABLED' : `${Math.round(comp.effectiveWeight)}% weight`}
                    </div>
                  </div>
                </div>

                {/* Component trend chart */}
                {health.history.length > 0 && chartKey && (
                  <HealthChart
                    history={health.history}
                    component={chartKey}
                    label={comp.label}
                    color={config?.color || '#58a6ff'}
                  />
                )}

                {health.history.length === 0 && (
                  <div className="h-[220px] flex items-center justify-center text-mc-text-secondary text-sm">
                    No historical data yet — scores are snapshotted daily
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Weight Configuration Summary */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-4">
            Weight Configuration
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {health.components.map((comp) => {
              const config = COMPONENT_CONFIG[comp.name];
              const isDisabled = health.weights.disabled.includes(comp.name);
              return (
                <div
                  key={comp.name}
                  className={`text-center p-3 rounded-lg ${
                    isDisabled ? 'bg-mc-bg/50' : 'bg-mc-bg'
                  }`}
                >
                  <div
                    className="text-lg font-bold"
                    style={{ color: isDisabled ? '#8b949e' : config?.color }}
                  >
                    {comp.weight}%
                  </div>
                  <div className="text-xs text-mc-text-secondary mt-1">{comp.label}</div>
                  {isDisabled && (
                    <div className="text-[10px] text-red-400 mt-0.5">disabled</div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-mc-text-secondary mt-3">
            Adjust weights in{' '}
            <Link
              href={`/autopilot/${productId}`}
              className="text-mc-accent hover:underline"
            >
              Product Settings
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
