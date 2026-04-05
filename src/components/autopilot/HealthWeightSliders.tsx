'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Loader, RotateCcw } from 'lucide-react';
import { HealthBadge } from './HealthBadge';
import type { HealthWeightConfig, HealthComponent } from '@/lib/types';

interface Props {
  productId: string;
  initialWeights?: HealthWeightConfig;
  onSaved?: (weights: HealthWeightConfig) => void;
}

const COMPONENTS: { key: HealthComponent; label: string; color: string }[] = [
  { key: 'research', label: 'Research Freshness', color: '#58a6ff' },
  { key: 'pipeline', label: 'Pipeline Depth', color: '#a371f7' },
  { key: 'swipe', label: 'Swipe Velocity', color: '#d29922' },
  { key: 'build', label: 'Build Success', color: '#3fb950' },
  { key: 'cost', label: 'Cost Efficiency', color: '#db61a2' },
];

const DEFAULT_WEIGHTS: HealthWeightConfig = {
  research: 20,
  pipeline: 20,
  swipe: 20,
  build: 20,
  cost: 20,
  disabled: [],
};

export function HealthWeightSliders({ productId, initialWeights, onSaved }: Props) {
  const [weights, setWeights] = useState<HealthWeightConfig>(initialWeights || DEFAULT_WEIGHTS);
  const [previewScore, setPreviewScore] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch preview score on mount
  useEffect(() => {
    fetch(`/api/products/${productId}/health`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setPreviewScore(data.score.overall_score);
      })
      .catch(() => {});
  }, [productId]);

  const handleWeightChange = useCallback((key: HealthComponent, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleToggle = useCallback((key: HealthComponent) => {
    setWeights((prev) => {
      const disabled = prev.disabled.includes(key)
        ? prev.disabled.filter((k) => k !== key)
        : [...prev.disabled, key];
      return { ...prev, disabled };
    });
  }, []);

  const handleReset = useCallback(() => {
    setWeights({ ...DEFAULT_WEIGHTS });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/products/${productId}/health/weights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(weights),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(err.error || `Save failed (${res.status})`);
      }
      const updated = await res.json();
      onSaved?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      // Refresh preview score
      const healthRes = await fetch(`/api/products/${productId}/health`);
      if (healthRes.ok) {
        const data = await healthRes.json();
        setPreviewScore(data.score.overall_score);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const totalWeight = COMPONENTS
    .filter((c) => !weights.disabled.includes(c.key))
    .reduce((sum, c) => sum + (weights[c.key] || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">
          Health Score Weights
        </h3>
        <div className="flex items-center gap-2">
          {previewScore !== null && (
            <div className="flex items-center gap-2 mr-3">
              <span className="text-xs text-mc-text-secondary">Current:</span>
              <HealthBadge score={previewScore} size={32} />
            </div>
          )}
          <button
            onClick={handleReset}
            className="min-h-8 px-3 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text text-xs flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`min-h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors ${
              saved
                ? 'bg-green-500/20 text-green-400'
                : 'bg-mc-accent text-white hover:bg-mc-accent/90'
            }`}
          >
            {saving ? <Loader className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saved ? 'Saved' : saving ? 'Saving...' : 'Save Weights'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {COMPONENTS.map((comp) => {
          const isDisabled = weights.disabled.includes(comp.key);
          const value = weights[comp.key] || 0;

          return (
            <div
              key={comp.key}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                isDisabled
                  ? 'border-mc-border/30 bg-mc-bg/30 opacity-50'
                  : 'border-mc-border bg-mc-bg'
              }`}
            >
              <label className="flex items-center gap-2 cursor-pointer min-w-[160px]">
                <input
                  type="checkbox"
                  checked={!isDisabled}
                  onChange={() => handleToggle(comp.key)}
                  className="rounded border-mc-border bg-mc-bg text-mc-accent focus:ring-mc-accent"
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: isDisabled ? '#8b949e' : comp.color }}
                >
                  {comp.label}
                </span>
              </label>

              <input
                type="range"
                min={0}
                max={100}
                value={value}
                onChange={(e) => handleWeightChange(comp.key, Number(e.target.value))}
                disabled={isDisabled}
                className="flex-1 h-1.5 bg-mc-bg-tertiary rounded-lg appearance-none cursor-pointer accent-mc-accent disabled:opacity-30"
                style={
                  !isDisabled
                    ? ({
                        '--slider-color': comp.color,
                        accentColor: comp.color,
                      } as React.CSSProperties)
                    : undefined
                }
              />

              <span className="text-sm font-mono text-mc-text-secondary w-10 text-right">
                {isDisabled ? '—' : `${value}%`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-mc-text-secondary flex items-center justify-between pt-1">
        <span>
          Total active weight: <span className="font-mono">{totalWeight}%</span>
          {totalWeight !== 100 && totalWeight > 0 && (
            <span className="text-yellow-400 ml-1">(will be normalized to 100%)</span>
          )}
        </span>
        <span>
          {weights.disabled.length} component{weights.disabled.length !== 1 ? 's' : ''} disabled
        </span>
      </div>
    </div>
  );
}
