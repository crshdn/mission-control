/**
 * Settings Page
 * Configure Mission Control paths, URLs, and preferences
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Save, RotateCcw, Home, FolderOpen, Link as LinkIcon } from 'lucide-react';
import { getConfig, updateConfig, resetConfig, type MissionControlConfig } from '@/lib/config';

export default function SettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<MissionControlConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hyperagentStatus, setHyperagentStatus] = useState<null | {
    webhook_secret_configured: boolean;
    sync_endpoint_configured: boolean;
    sync_token_configured: boolean;
    replay_window_ms: number;
    sync_timeout_ms: number;
    sync_max_retries: number;
    recent_deliveries: Array<{
      event_id: string;
      event_type: string;
      status: string;
      created_at: string;
      error_message?: string | null;
    }>;
  }>(null);
  const [isLoadingHyperagent, setIsLoadingHyperagent] = useState(false);
  const [isSyncingHyperagent, setIsSyncingHyperagent] = useState(false);
  const [hyperagentMessage, setHyperagentMessage] = useState<string | null>(null);

  useEffect(() => {
    setConfig(getConfig());
    void refreshHyperagentStatus();
  }, []);

  const refreshHyperagentStatus = async () => {
    setIsLoadingHyperagent(true);
    setHyperagentMessage(null);
    try {
      const res = await fetch('/api/integrations/hyperagent/status');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load Hyperagent status');
      }
      setHyperagentStatus(data);
    } catch (err) {
      setHyperagentMessage(err instanceof Error ? err.message : 'Failed to load Hyperagent status');
    } finally {
      setIsLoadingHyperagent(false);
    }
  };

  const runHyperagentSync = async () => {
    setIsSyncingHyperagent(true);
    setHyperagentMessage(null);
    try {
      const res = await fetch('/api/integrations/hyperagent/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'full' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to trigger Hyperagent sync');
      }

      setHyperagentMessage(
        data.delivery?.delivered
          ? `Sync delivered in ${data.delivery.attempts} attempt(s)`
          : 'Sync queued locally (endpoint missing or delivery failed)'
      );
      await refreshHyperagentStatus();
    } catch (err) {
      setHyperagentMessage(err instanceof Error ? err.message : 'Failed to trigger Hyperagent sync');
    } finally {
      setIsSyncingHyperagent(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      updateConfig(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      resetConfig();
      setConfig(getConfig());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleChange = (field: keyof MissionControlConfig, value: string) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  if (!config) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-mc-text-secondary">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mc-bg">
      {/* Header */}
      <div className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
              title="Back to Mission Control"
            >
              ← Back
            </button>
            <Settings className="w-6 h-6 text-mc-accent" />
            <h1 className="text-2xl font-bold text-mc-text">Settings</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-mc-border rounded hover:bg-mc-bg-tertiary text-mc-text-secondary flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Success Message */}
        {saveSuccess && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded text-green-400">
            ✓ Settings saved successfully
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded text-red-400">
            ✗ {error}
          </div>
        )}

        {/* Workspace Paths */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">Workspace Paths</h2>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Configure where Mission Control stores projects and deliverables.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Workspace Base Path
              </label>
              <input
                type="text"
                value={config.workspaceBasePath}
                onChange={(e) => handleChange('workspaceBasePath', e.target.value)}
                placeholder="~/Documents/Shared"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                Base directory for all Mission Control files. Use ~ for home directory.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Projects Path
              </label>
              <input
                type="text"
                value={config.projectsPath}
                onChange={(e) => handleChange('projectsPath', e.target.value)}
                placeholder="~/Documents/Shared/projects"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                Directory where project folders are created. Each project gets its own folder.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Default Project Name
              </label>
              <input
                type="text"
                value={config.defaultProjectName}
                onChange={(e) => handleChange('defaultProjectName', e.target.value)}
                placeholder="mission-control"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                Default name for new projects. Can be changed per project.
              </p>
            </div>
          </div>
        </section>

        {/* API Configuration */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <LinkIcon className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">API Configuration</h2>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Configure Mission Control API URL for agent orchestration.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Mission Control URL
              </label>
              <input
                type="text"
                value={config.missionControlUrl}
                onChange={(e) => handleChange('missionControlUrl', e.target.value)}
                placeholder="http://localhost:4000"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                URL where Mission Control is running. Auto-detected by default. Change for remote access.
              </p>
            </div>
          </div>
        </section>

        {/* Environment Variables Note */}
        <section className="p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">
            📝 Environment Variables
          </h3>
          <p className="text-sm text-blue-300 mb-3">
            Some settings are also configurable via environment variables in <code className="px-2 py-1 bg-mc-bg rounded">.env.local</code>:
          </p>
          <ul className="text-sm text-blue-300 space-y-1 ml-4 list-disc">
            <li><code>MISSION_CONTROL_URL</code> - API URL override</li>
            <li><code>WORKSPACE_BASE_PATH</code> - Base workspace directory</li>
            <li><code>PROJECTS_PATH</code> - Projects directory</li>
            <li><code>OPENCLAW_GATEWAY_URL</code> - Gateway WebSocket URL</li>
            <li><code>OPENCLAW_GATEWAY_TOKEN</code> - Gateway auth token</li>
          </ul>
          <p className="text-xs text-blue-400 mt-3">
            Environment variables take precedence over UI settings for server-side operations.
          </p>
        </section>

        <section className="mt-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-semibold text-mc-text">Hyperagent Integration</h3>
            <div className="flex gap-2">
              <button
                onClick={() => void refreshHyperagentStatus()}
                disabled={isLoadingHyperagent}
                className="px-3 py-2 border border-mc-border rounded hover:bg-mc-bg-tertiary text-mc-text-secondary disabled:opacity-50"
              >
                {isLoadingHyperagent ? 'Refreshing...' : 'Refresh Status'}
              </button>
              <button
                onClick={() => void runHyperagentSync()}
                disabled={isSyncingHyperagent}
                className="px-3 py-2 bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 disabled:opacity-50"
              >
                {isSyncingHyperagent ? 'Syncing...' : 'Run Full Sync'}
              </button>
            </div>
          </div>

          {hyperagentMessage && (
            <div className="mb-4 p-3 rounded border border-mc-border text-sm text-mc-text-secondary bg-mc-bg">
              {hyperagentMessage}
            </div>
          )}

          {hyperagentStatus && (
            <div className="space-y-3 text-sm text-mc-text-secondary">
              <p>Webhook secret configured: <span className="text-mc-text">{hyperagentStatus.webhook_secret_configured ? 'Yes' : 'No'}</span></p>
              <p>Sync endpoint configured: <span className="text-mc-text">{hyperagentStatus.sync_endpoint_configured ? 'Yes' : 'No'}</span></p>
              <p>Sync token configured: <span className="text-mc-text">{hyperagentStatus.sync_token_configured ? 'Yes' : 'No'}</span></p>
              <p>Replay window: <span className="text-mc-text">{hyperagentStatus.replay_window_ms}ms</span></p>
              <p>Sync timeout/retries: <span className="text-mc-text">{hyperagentStatus.sync_timeout_ms}ms / {hyperagentStatus.sync_max_retries}</span></p>

              <div>
                <p className="text-mc-text mb-2">Recent webhook deliveries</p>
                <div className="max-h-56 overflow-auto border border-mc-border rounded bg-mc-bg">
                  {hyperagentStatus.recent_deliveries.length === 0 ? (
                    <p className="p-3">No Hyperagent webhook deliveries yet.</p>
                  ) : (
                    hyperagentStatus.recent_deliveries.map((row) => (
                      <div key={row.event_id} className="p-3 border-b last:border-b-0 border-mc-border">
                        <p><span className="text-mc-text">{row.event_type}</span> ({row.status})</p>
                        <p className="text-xs">{row.event_id}</p>
                        <p className="text-xs">{row.created_at}</p>
                        {row.error_message && <p className="text-xs text-red-400">{row.error_message}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
