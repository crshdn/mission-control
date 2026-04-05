'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { CostCapManager } from './CostCapManager';

interface CostOverview {
  today: number;
  this_week: number;
  this_month: number;
  total: number;
}

interface CostBreakdown {
  by_event_type: Array<{ event_type: string; total: number; count: number }>;
  by_product: Array<{ product_id: string; product_name: string; total: number; count: number }>;
  by_agent: Array<{ agent_id: string; agent_name: string; total: number; count: number }>;
  per_feature: {
    avg_cost_per_idea: number;
    avg_cost_per_shipped_feature: number;
    total_ideas_cost: number;
    total_build_cost: number;
  };
}

interface CostDashboardProps {
  productId?: string;
  workspaceId?: string;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

interface ProductCaps {
  cost_cap_per_task: number | null;
  cost_cap_monthly: number | null;
}

export function CostDashboard({ productId, workspaceId = 'default' }: CostDashboardProps) {
  const [overview, setOverview] = useState<CostOverview | null>(null);
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCaps, setShowCaps] = useState(false);
  const [productCaps, setProductCaps] = useState<ProductCaps>({ cost_cap_per_task: null, cost_cap_monthly: null });
  const [savingCaps, setSavingCaps] = useState(false);
  const [capExceeded, setCapExceeded] = useState(false);

  const loadProductCaps = useCallback(async () => {
    if (!productId) return;
    try {
      const res = await fetch(`/api/products/${productId}`);
      if (res.ok) {
        const product = await res.json();
        setProductCaps({
          cost_cap_per_task: product.cost_cap_per_task ?? null,
          cost_cap_monthly: product.cost_cap_monthly ?? null,
        });
        // Check if monthly cap is exceeded
        if (product.cost_cap_monthly && overview) {
          setCapExceeded(overview.this_month >= product.cost_cap_monthly);
        }
      }
    } catch (error) {
      logger.error('Failed to load product caps:', error);
    }
  }, [productId, overview]);

  useEffect(() => {
    (async () => {
      try {
        const [overviewRes, breakdownRes] = await Promise.all([
          fetch(`/api/costs?workspace_id=${workspaceId}`),
          fetch(`/api/costs/breakdown?workspace_id=${workspaceId}`),
        ]);
        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (breakdownRes.ok) setBreakdown(await breakdownRes.json());
      } catch (error) {
        logger.error('Failed to load costs:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  useEffect(() => {
    loadProductCaps();
  }, [loadProductCaps]);

  // Re-check cap exceeded when overview changes
  useEffect(() => {
    if (productCaps.cost_cap_monthly && overview) {
      setCapExceeded(overview.this_month >= productCaps.cost_cap_monthly);
    }
  }, [overview, productCaps.cost_cap_monthly]);

  const saveProductCaps = async () => {
    if (!productId) return;
    setSavingCaps(true);
    try {
      await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_cap_per_task: productCaps.cost_cap_per_task,
          cost_cap_monthly: productCaps.cost_cap_monthly,
        }),
      });
    } catch (error) {
      logger.error('Failed to save product caps:', error);
    } finally {
      setSavingCaps(false);
    }
  };

  if (loading) {
    return <div className="text-mc-text-secondary animate-pulse">Loading costs...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Today', value: overview.today },
            { label: 'This Week', value: overview.this_week },
            { label: 'This Month', value: overview.this_month },
            { label: 'All Time', value: overview.total },
          ].map(item => (
            <div key={item.label} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
              <div className="text-xs text-mc-text-secondary uppercase mb-1">{item.label}</div>
              <div className="text-xl font-bold text-mc-text">{formatUsd(item.value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Breakdown by category */}
      {breakdown && breakdown.by_event_type.length > 0 && (
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-5">
          <h3 className="font-semibold text-mc-text mb-4">Cost by Category</h3>
          <div className="space-y-3">
            {breakdown.by_event_type.map(item => {
              const maxTotal = Math.max(...breakdown.by_event_type.map(i => i.total));
              const pct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
              const label = item.event_type.replace(/_/g, ' ');
              return (
                <div key={item.event_type} className="flex items-center gap-3">
                  <span className="text-sm text-mc-text-secondary w-32 capitalize truncate">{label}</span>
                  <div className="flex-1 h-5 bg-mc-bg-tertiary rounded overflow-hidden">
                    <div
                      className="h-full bg-mc-accent-cyan/60 rounded"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-mc-text w-20 text-right">{formatUsd(item.total)}</span>
                  <span className="text-xs text-mc-text-secondary w-12 text-right">({item.count})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-feature stats */}
      {breakdown?.per_feature && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="text-xs text-mc-text-secondary mb-1">Avg Cost / Idea</div>
            <div className="text-lg font-bold text-mc-text">{formatUsd(breakdown.per_feature.avg_cost_per_idea)}</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="text-xs text-mc-text-secondary mb-1">Avg Cost / Feature</div>
            <div className="text-lg font-bold text-mc-text">{formatUsd(breakdown.per_feature.avg_cost_per_shipped_feature)}</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="text-xs text-mc-text-secondary mb-1">Total Ideas Cost</div>
            <div className="text-lg font-bold text-mc-text">{formatUsd(breakdown.per_feature.total_ideas_cost)}</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="text-xs text-mc-text-secondary mb-1">Total Build Cost</div>
            <div className="text-lg font-bold text-mc-text">{formatUsd(breakdown.per_feature.total_build_cost)}</div>
          </div>
        </div>
      )}

      {/* Per-product cost caps */}
      {productId && (
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-5 space-y-4">
          <h3 className="font-semibold text-mc-text">Product Cost Caps</h3>

          {capExceeded && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-300">
              Monthly budget reached — tasks will queue instead of auto-dispatching
            </div>
          )}

          {/* Monthly spend vs cap progress bar */}
          {productCaps.cost_cap_monthly && overview && (
            <div>
              <div className="flex justify-between text-xs text-mc-text-secondary mb-1">
                <span>Monthly spend</span>
                <span>{formatUsd(overview.this_month)} / {formatUsd(productCaps.cost_cap_monthly)}</span>
              </div>
              <div className="h-2 bg-mc-bg-tertiary rounded overflow-hidden">
                <div
                  className={`h-full rounded ${capExceeded ? 'bg-amber-500' : 'bg-mc-accent-cyan/60'}`}
                  style={{ width: `${Math.min((overview.this_month / productCaps.cost_cap_monthly) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-mc-text-secondary mb-1">Per-task cap ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={productCaps.cost_cap_per_task ?? ''}
                onChange={e => setProductCaps(c => ({ ...c, cost_cap_per_task: e.target.value ? Number(e.target.value) : null }))}
                className="w-full bg-mc-bg-tertiary border border-mc-border rounded-lg px-3 py-2 text-mc-text text-sm focus:outline-none focus:border-mc-accent"
                placeholder="No limit"
              />
            </div>
            <div>
              <label className="block text-xs text-mc-text-secondary mb-1">Monthly cap ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={productCaps.cost_cap_monthly ?? ''}
                onChange={e => setProductCaps(c => ({ ...c, cost_cap_monthly: e.target.value ? Number(e.target.value) : null }))}
                className="w-full bg-mc-bg-tertiary border border-mc-border rounded-lg px-3 py-2 text-mc-text text-sm focus:outline-none focus:border-mc-accent"
                placeholder="No limit"
              />
            </div>
          </div>
          <button
            onClick={saveProductCaps}
            disabled={savingCaps}
            className="text-sm px-4 py-2 bg-mc-accent text-white rounded-lg hover:bg-mc-accent/90 disabled:opacity-50"
          >
            {savingCaps ? 'Saving...' : 'Save Caps'}
          </button>
        </div>
      )}

      {/* Cost Caps */}
      <div>
        <button
          onClick={() => setShowCaps(!showCaps)}
          className="text-sm text-mc-accent hover:text-mc-accent/80 mb-3"
        >
          {showCaps ? 'Hide' : 'Manage'} Cost Caps
        </button>
        {showCaps && <CostCapManager workspaceId={workspaceId} productId={productId} />}
      </div>
    </div>
  );
}
