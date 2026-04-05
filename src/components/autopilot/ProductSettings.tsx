'use client';

import { useState } from 'react';
import { Save, Loader, ExternalLink } from 'lucide-react';
import { HealthWeightSliders } from './HealthWeightSliders';
import type { Product, BuildMode, HealthWeightConfig } from '@/lib/types';

interface Props {
  product: Product;
  onSave: (updated: Product) => void;
}

export function ProductSettings({ product, onSave }: Props) {
  const [form, setForm] = useState({
    name: product.name,
    description: product.description || '',
    repo_url: product.repo_url || '',
    live_url: product.live_url || '',
    default_branch: product.default_branch || 'main',
    build_mode: product.build_mode || 'plan_first',
    icon: product.icon || '📦',
    cost_cap_per_task: product.cost_cap_per_task ?? '',
    cost_cap_monthly: product.cost_cap_monthly ?? '',
    batch_review_threshold: product.batch_review_threshold ?? 10,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    form.name !== product.name ||
    form.description !== (product.description || '') ||
    form.repo_url !== (product.repo_url || '') ||
    form.live_url !== (product.live_url || '') ||
    form.default_branch !== (product.default_branch || 'main') ||
    form.build_mode !== (product.build_mode || 'plan_first') ||
    form.icon !== (product.icon || '📦') ||
    String(form.cost_cap_per_task) !== String(product.cost_cap_per_task ?? '') ||
    String(form.cost_cap_monthly) !== String(product.cost_cap_monthly ?? '') ||
    form.batch_review_threshold !== (product.batch_review_threshold ?? 10);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        description: form.description || undefined,
        repo_url: form.repo_url || null,
        live_url: form.live_url || null,
        default_branch: form.default_branch || 'main',
        build_mode: form.build_mode,
        icon: form.icon,
      };
      if (form.cost_cap_per_task !== '') body.cost_cap_per_task = Number(form.cost_cap_per_task);
      else body.cost_cap_per_task = null;
      if (form.cost_cap_monthly !== '') body.cost_cap_monthly = Number(form.cost_cap_monthly);
      else body.cost_cap_monthly = null;
      body.batch_review_threshold = Number(form.batch_review_threshold) || 10;

      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(err.error || `Save failed (${res.status})`);
      }
      const updated = await res.json();
      onSave(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2 text-sm text-mc-text placeholder:text-mc-text-secondary/50 focus:outline-none focus:border-mc-accent';
  const labelClass = 'block text-xs font-medium text-mc-text-secondary uppercase tracking-wider mb-1.5';

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-mc-text">Product Settings</h2>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`min-h-9 px-4 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
            hasChanges && !saving
              ? 'bg-mc-accent text-white hover:bg-mc-accent/90'
              : saved
              ? 'bg-green-500/20 text-green-400'
              : 'bg-mc-bg-tertiary text-mc-text-secondary cursor-not-allowed'
          }`}
        >
          {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">Basic Info</h3>

        <div className="flex gap-3">
          <div className="w-16">
            <label className={labelClass}>Icon</label>
            <input
              type="text"
              value={form.icon}
              onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
              className={`${inputClass} text-center text-xl`}
              maxLength={4}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={inputClass}
              placeholder="Product name"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="What does this product do?"
          />
        </div>
      </div>

      {/* Repository & URLs */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">Repository & URLs</h3>

        <div>
          <label className={labelClass}>Repository URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={form.repo_url}
              onChange={e => setForm(f => ({ ...f, repo_url: e.target.value }))}
              className={`${inputClass} flex-1`}
              placeholder="https://github.com/org/repo"
            />
            {form.repo_url && (
              <a
                href={form.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-9 px-3 flex items-center bg-mc-bg-tertiary border border-mc-border rounded-lg text-mc-text-secondary hover:text-mc-text"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        <div>
          <label className={labelClass}>Live URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={form.live_url}
              onChange={e => setForm(f => ({ ...f, live_url: e.target.value }))}
              className={`${inputClass} flex-1`}
              placeholder="https://yourproduct.com"
            />
            {form.live_url && (
              <a
                href={form.live_url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-9 px-3 flex items-center bg-mc-bg-tertiary border border-mc-border rounded-lg text-mc-text-secondary hover:text-mc-text"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        <div>
          <label className={labelClass}>Default Branch</label>
          <input
            type="text"
            value={form.default_branch}
            onChange={e => setForm(f => ({ ...f, default_branch: e.target.value }))}
            className={inputClass}
            placeholder="main"
          />
        </div>
      </div>

      {/* Build Configuration */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">Build Configuration</h3>

        <div>
          <label className={labelClass}>Build Mode</label>
          <select
            value={form.build_mode}
            onChange={e => setForm(f => ({ ...f, build_mode: e.target.value as BuildMode }))}
            className={inputClass}
          >
            <option value="plan_first">Plan First — Agent plans before building</option>
            <option value="auto_build">Auto Build — Skip planning, build immediately</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Cost Cap / Task ($)</label>
            <input
              type="number"
              value={form.cost_cap_per_task}
              onChange={e => setForm(f => ({ ...f, cost_cap_per_task: e.target.value }))}
              className={inputClass}
              placeholder="No limit"
              min={0}
              step={0.5}
            />
          </div>
          <div>
            <label className={labelClass}>Cost Cap / Month ($)</label>
            <input
              type="number"
              value={form.cost_cap_monthly}
              onChange={e => setForm(f => ({ ...f, cost_cap_monthly: e.target.value }))}
              className={inputClass}
              placeholder="No limit"
              min={0}
              step={1}
            />
          </div>
          <div>
            <label className={labelClass}>Batch Review Threshold</label>
            <input
              type="number"
              value={form.batch_review_threshold}
              onChange={e => setForm(f => ({ ...f, batch_review_threshold: Number(e.target.value) || 10 }))}
              className={inputClass}
              placeholder="10"
              min={1}
              max={100}
              step={1}
            />
          </div>
        </div>
      </div>

      {/* Health Score Weights */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
        <HealthWeightSliders
          productId={product.id}
          initialWeights={product.health_weight_config ? (() => {
            try { return JSON.parse(product.health_weight_config); } catch { return undefined; }
          })() : undefined}
        />
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
        <h3 className="text-sm font-medium text-red-400 uppercase tracking-wider mb-2">Status</h3>
        <p className="text-xs text-mc-text-secondary mb-3">
          Current status: <span className={product.status === 'active' ? 'text-green-400' : 'text-mc-text-secondary'}>{product.status}</span>
        </p>
      </div>
    </div>
  );
}
