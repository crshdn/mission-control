'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CostCap } from '@/lib/types';

interface CostCapManagerProps {
  workspaceId: string;
  productId?: string;
}

export function CostCapManager({ workspaceId, productId }: CostCapManagerProps) {
  const [caps, setCaps] = useState<CostCap[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newCap, setNewCap] = useState({ cap_type: 'monthly', limit_usd: 500 });

  const loadCaps = useCallback(async () => {
    try {
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (productId) params.set('product_id', productId);
      const res = await fetch(`/api/costs/caps?${params}`);
      if (res.ok) setCaps(await res.json());
    } catch (error) {
      console.error('Failed to load caps:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, productId]);

  useEffect(() => { loadCaps(); }, [loadCaps]);

  const handleCreate = async () => {
    try {
      await fetch('/api/costs/caps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCap, workspace_id: workspaceId, product_id: productId }),
      });
      setShowCreate(false);
      loadCaps();
    } catch (error) {
      console.error('Failed to create cap:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/costs/caps/${id}`, { method: 'DELETE' });
      loadCaps();
    } catch (error) {
      console.error('Failed to delete cap:', error);
    }
  };

  const capTypeLabels: Record<string, string> = {
    per_cycle: 'Per Cycle',
    per_task: 'Per Task',
    daily: 'Daily',
    monthly: 'Monthly',
    per_product_monthly: 'Product Monthly',
  };

  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-mc-text text-sm">Cost Caps</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs px-3 py-1.5 rounded bg-mc-accent/20 text-mc-accent hover:bg-mc-accent/30 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add Cap
        </button>
      </div>

      {showCreate && (
        <div className="flex items-end gap-3 p-3 bg-mc-bg rounded-lg">
          <div className="flex-1">
            <label className="block text-xs text-mc-text-secondary mb-1">Type</label>
            <select
              value={newCap.cap_type}
              onChange={e => setNewCap(n => ({ ...n, cap_type: e.target.value }))}
              className="w-full bg-mc-bg-tertiary border border-mc-border rounded px-3 py-2 text-sm text-mc-text"
            >
              {Object.entries(capTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-mc-text-secondary mb-1">Limit (USD)</label>
            <input
              type="number"
              value={newCap.limit_usd}
              onChange={e => setNewCap(n => ({ ...n, limit_usd: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-mc-bg-tertiary border border-mc-border rounded px-3 py-2 text-sm text-mc-text"
              min="0"
              step="1"
            />
          </div>
          <button
            onClick={handleCreate}
            className="min-h-[38px] px-4 rounded bg-mc-accent text-white text-sm hover:bg-mc-accent/90"
          >
            Create
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-mc-text-secondary animate-pulse">Loading...</div>
      ) : caps.length === 0 ? (
        <div className="text-sm text-mc-text-secondary">No cost caps configured</div>
      ) : (
        <div className="space-y-2">
          {caps.map(cap => {
            const pct = cap.limit_usd > 0 ? Math.min((cap.current_spend_usd / cap.limit_usd) * 100, 100) : 0;
            const isWarning = pct >= 80;
            const isExceeded = pct >= 100;
            return (
              <div key={cap.id} className="flex items-center gap-3 p-3 bg-mc-bg rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-mc-text">{capTypeLabels[cap.cap_type] || cap.cap_type}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      isExceeded ? 'bg-red-500/20 text-red-400' :
                      isWarning ? 'bg-amber-500/20 text-amber-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {isExceeded ? 'exceeded' : isWarning ? 'warning' : cap.status}
                    </span>
                  </div>
                  <div className="h-2 bg-mc-bg-tertiary rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${isExceeded ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-mc-text-secondary mt-1">
                    ${cap.current_spend_usd.toFixed(2)} / ${cap.limit_usd.toFixed(2)}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(cap.id)}
                  className="p-1.5 text-mc-text-secondary hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
