'use client';


import { logger } from '@/lib/logger';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Rocket, Search, Loader, AlertTriangle, FileText, Sparkles } from 'lucide-react';
import Link from 'next/link';

type Step = 'basics' | 'program' | 'schedule' | 'done';

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function NewProductPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('basics');
  const [saving, setSaving] = useState(false);
  const [scanningRepo, setScanningRepo] = useState(false);
  const [scanningSite, setScanningSite] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [repoWarning, setRepoWarning] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [importingReadme, setImportingReadme] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    repo_url: '',
    live_url: '',
    icon: '🚀',
    product_program: '',
    build_mode: 'plan_first' as 'plan_first' | 'auto_build',
    default_branch: 'main',
  });

  const handleScan = async (url: string, source: 'repo' | 'site') => {
    const setScanning = source === 'repo' ? setScanningRepo : setScanningSite;
    setScanning(true);
    setScanError(null);

    try {
      const res = await fetch('/api/products/scan-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Scan failed' }));
        setScanError(data.error || `Scan failed (${res.status})`);
        return;
      }

      const { name, description } = await res.json();

      setForm(f => ({
        ...f,
        name: f.name || name || f.name,
        description: f.description || description || f.description,
      }));
    } catch (error) {
      setScanError('Failed to connect to scan service');
      logger.error('Scan failed:', error);
    } finally {
      setScanning(false);
    }
  };

  const validateRepoUrl = async (url: string) => {
    if (!url) { setRepoWarning(null); return; }
    // Try to extract owner/repo from GitHub URL
    const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) { setRepoWarning(null); return; }
    try {
      const res = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`, { method: 'GET' });
      if (!res.ok) {
        setRepoWarning('Could not verify this repository — it may be private or may not exist. Private repos work fine, the agent will use local access.');
      } else {
        setRepoWarning(null);
      }
    } catch {
      setRepoWarning('Could not verify this repository — it may be private or may not exist. Private repos work fine, the agent will use local access.');
    }
  };

  const handleGenerateDescription = async () => {
    if (!form.repo_url && !form.live_url) return;
    setGeneratingDesc(true);
    setDescError(null);
    try {
      const res = await fetch('/api/products/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: form.repo_url, live_url: form.live_url, name: form.name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Generation failed' }));
        setDescError(data.error || `Failed (${res.status})`);
        return;
      }
      const { description } = await res.json();
      if (description) {
        setForm(f => ({ ...f, description }));
      }
    } catch {
      setDescError('Failed to generate description.');
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleImportReadme = async () => {
    if (!form.repo_url) return;
    setImportingReadme(true);
    setImportError(null);
    try {
      const res = await fetch('/api/products/import-readme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: form.repo_url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Import failed' }));
        setImportError(data.error || `Import failed (${res.status})`);
        return;
      }
      const { readme } = await res.json();
      if (readme) {
        setForm(f => ({ ...f, product_program: readme }));
      } else {
        setImportError('No README.md found in this repository.');
      }
    } catch {
      setImportError('Failed to import README.');
    } finally {
      setImportingReadme(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const product = await res.json();
        setProductId(product.id);
        setStep('program');
      }
    } catch (error) {
      logger.error('Failed to create product:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProgram = async () => {
    if (!productId) return;
    setSaving(true);
    try {
      await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_program: form.product_program }),
      });
      setStep('schedule');
    } catch (error) {
      logger.error('Failed to save program:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-mc-bg">
      <header className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/autopilot" className="text-mc-text-secondary hover:text-mc-text">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Rocket className="w-5 h-5 text-mc-accent-cyan" />
            <h1 className="text-lg font-bold text-mc-text">New Product</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {(['basics', 'program', 'schedule'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? 'bg-mc-accent text-white' :
                (['basics', 'program', 'schedule'].indexOf(step) > i) ? 'bg-green-500/20 text-green-400' :
                'bg-mc-bg-tertiary text-mc-text-secondary'
              }`}>
                {(['basics', 'program', 'schedule'].indexOf(step) > i) ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < 2 && <div className="w-12 h-px bg-mc-border" />}
            </div>
          ))}
        </div>

        {step === 'basics' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">Product Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-mc-bg-tertiary border border-mc-border rounded-lg px-4 py-3 text-mc-text focus:outline-none focus:border-mc-accent"
                placeholder="My Product"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-mc-bg-tertiary border border-mc-border rounded-lg px-4 py-3 text-mc-text focus:outline-none focus:border-mc-accent resize-none"
                rows={3}
                placeholder="What does this product do?"
              />
              {(form.repo_url || form.live_url) && (
                <div className="mt-2">
                  <button
                    onClick={handleGenerateDescription}
                    disabled={generatingDesc}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-mc-bg-tertiary border border-mc-border rounded-lg text-mc-text-secondary hover:text-mc-accent hover:border-mc-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingDesc ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {generatingDesc ? 'Generating...' : 'Auto-generate from repo & site'}
                  </button>
                  {descError && (
                    <p className="text-[11px] text-red-400 mt-1">{descError}</p>
                  )}
                </div>
              )}
            </div>

            {scanError && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {scanError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-mc-text mb-2">Repo URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.repo_url}
                    onChange={e => setForm(f => ({ ...f, repo_url: e.target.value }))}
                    onBlur={() => { if (form.repo_url) validateRepoUrl(form.repo_url); }}
                    className="flex-1 bg-mc-bg-tertiary border border-mc-border rounded-lg px-4 py-3 text-mc-text text-sm focus:outline-none focus:border-mc-accent"
                    placeholder="https://github.com/..."
                  />
                  <button
                    onClick={() => handleScan(form.repo_url, 'repo')}
                    disabled={!isValidUrl(form.repo_url) || scanningRepo}
                    className="shrink-0 px-3 py-3 bg-mc-bg-tertiary border border-mc-border rounded-lg text-mc-text-secondary hover:text-mc-text hover:border-mc-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Scan repo — auto-fill name & description from README"
                  >
                    {scanningRepo ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
                {repoWarning && (
                  <p className="text-[11px] text-amber-400 mt-1.5">{repoWarning}</p>
                )}
                <p className="text-[11px] text-mc-text-secondary mt-1.5">
                  Scan repo to auto-fill name & description from README
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-mc-text mb-2">Live URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.live_url}
                    onChange={e => setForm(f => ({ ...f, live_url: e.target.value }))}
                    className="flex-1 bg-mc-bg-tertiary border border-mc-border rounded-lg px-4 py-3 text-mc-text text-sm focus:outline-none focus:border-mc-accent"
                    placeholder="https://..."
                  />
                  <button
                    onClick={() => handleScan(form.live_url, 'site')}
                    disabled={!isValidUrl(form.live_url) || scanningSite}
                    className="shrink-0 px-3 py-3 bg-mc-bg-tertiary border border-mc-border rounded-lg text-mc-text-secondary hover:text-mc-text hover:border-mc-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Scan site — auto-fill name & description from website"
                  >
                    {scanningSite ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-mc-text-secondary mt-1.5">
                  Scan site to auto-fill name & description from website
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-mc-text mb-2">When ideas are approved</label>
                <select
                  value={form.build_mode}
                  onChange={e => setForm(f => ({ ...f, build_mode: e.target.value as 'plan_first' | 'auto_build' }))}
                  className="w-full bg-mc-bg-tertiary border border-mc-border rounded-lg px-4 py-3 text-mc-text text-sm focus:outline-none focus:border-mc-accent"
                >
                  <option value="plan_first">Plan first — send to planning queue</option>
                  <option value="auto_build">Auto-build — dispatch to builder immediately</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-mc-text mb-2">Default Branch</label>
                <input
                  type="text"
                  value={form.default_branch}
                  onChange={e => setForm(f => ({ ...f, default_branch: e.target.value }))}
                  className="w-full bg-mc-bg-tertiary border border-mc-border rounded-lg px-4 py-3 text-mc-text text-sm focus:outline-none focus:border-mc-accent"
                  placeholder="main"
                />
              </div>
            </div>

            {!form.repo_url && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-300">
                  Without a repository, Autopilot can research and generate ideas but agents
                  won&apos;t be able to build features or create pull requests.
                </p>
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || saving}
              className="w-full min-h-11 bg-mc-accent text-white rounded-lg font-medium hover:bg-mc-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? 'Creating...' : 'Next: Product Program'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'program' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">Product Program</label>
              <p className="text-sm text-mc-text-secondary mb-4">
                This document instructs the research and ideation agents. Describe your product, target users, priorities, and what you want the agents to focus on.
              </p>
              {form.repo_url && (
                <div className="mb-4">
                  <button
                    onClick={handleImportReadme}
                    disabled={importingReadme}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-mc-bg-tertiary border border-mc-border rounded-lg text-mc-text-secondary hover:text-mc-text hover:border-mc-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {importingReadme ? <Loader className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    {importingReadme ? 'Importing...' : 'Import from README.md'}
                  </button>
                  {importError && (
                    <p className="text-[11px] text-red-400 mt-1.5">{importError}</p>
                  )}
                </div>
              )}
              <textarea
                value={form.product_program}
                onChange={e => setForm(f => ({ ...f, product_program: e.target.value }))}
                className="w-full bg-mc-bg-tertiary border border-mc-border rounded-lg px-4 py-3 text-mc-text font-mono text-sm focus:outline-none focus:border-mc-accent resize-none"
                rows={20}
                placeholder={`# Product Program: ${form.name}\n\n## Purpose\nWhat this product does and who it's for.\n\n## Target Users\nWho uses this and what problems they have.\n\n## Priorities\nWhat matters most — growth, stability, features, UX, performance, etc.\n\n## Research Directives\nSpecific areas to focus research on.\n\n## Exclusions\nThings you do NOT want suggested.`}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('schedule')}
                className="flex-1 min-h-11 border border-mc-border text-mc-text-secondary rounded-lg hover:bg-mc-bg-tertiary"
              >
                Skip for now
              </button>
              <button
                onClick={handleSaveProgram}
                disabled={saving}
                className="flex-1 min-h-11 bg-mc-accent text-white rounded-lg font-medium hover:bg-mc-accent/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? 'Saving...' : 'Next: Schedules'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'schedule' && (
          <div className="space-y-6">
            <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-6">
              <h3 className="font-semibold text-mc-text mb-4">Default Schedules</h3>
              <p className="text-sm text-mc-text-secondary mb-6">
                These schedules run automatically. You can customize them later in product settings.
              </p>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-mc-border">
                  <span className="text-mc-text">Research + Ideation</span>
                  <span className="text-mc-text-secondary font-mono">Daily at 11pm</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-mc-border">
                  <span className="text-mc-text">Maybe Re-evaluation</span>
                  <span className="text-mc-text-secondary font-mono">Weekly (Monday 10am)</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-mc-text">Preference Update</span>
                  <span className="text-mc-text-secondary font-mono">Weekly (Monday 9am)</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push(`/autopilot/${productId}`)}
              className="w-full min-h-11 bg-mc-accent text-white rounded-lg font-medium hover:bg-mc-accent/90 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Go to Product Dashboard
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
