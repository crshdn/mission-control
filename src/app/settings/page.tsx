/**
 * Settings Page
 * Configure Mission Control paths, URLs, preferences, and database backups
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings, Save, RotateCcw, Home, FolderOpen, Link as LinkIcon,
  HardDrive, Download, Upload, Trash2, RotateCw, ChevronDown, ChevronRight,
  AlertTriangle, Check, Loader2, Cloud, CloudOff, Shield,
} from 'lucide-react';
import { getConfig, updateConfig, resetConfig, type MissionControlConfig } from '@/lib/config';

// ---------------------------------------------------------------------------
// Types for backup data
// ---------------------------------------------------------------------------

interface BackupMetadata {
  filename: string;
  size: number;
  timestamp: string;
  migrationVersion: string;
  location: 'local' | 's3' | 'both';
  createdAt: string;
}

interface BackupListResponse {
  backups: BackupMetadata[];
  total: number;
  s3: { configured: boolean; endpoint?: string; bucket?: string };
}

// ---------------------------------------------------------------------------
// Utility: format bytes
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Settings Page Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<MissionControlConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backup state
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [backupTotal, setBackupTotal] = useState(0);
  const [s3Status, setS3Status] = useState<{ configured: boolean; endpoint?: string; bucket?: string }>({ configured: false });
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState<string | null>(null);
  const [isDeletingBackup, setIsDeletingBackup] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [showS3Config, setShowS3Config] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<BackupMetadata | null>(null);

  useEffect(() => {
    setConfig(getConfig());
  }, []);

  // Fetch backups on mount
  const fetchBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    setBackupError(null);
    try {
      const res = await fetch('/api/admin/backups');
      if (!res.ok) throw new Error(`Failed to fetch backups: ${res.statusText}`);
      const data: BackupListResponse = await res.json();
      setBackups(data.backups);
      setBackupTotal(data.total);
      setS3Status(data.s3);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // ---------------------------------------------------------------------------
  // Config handlers
  // ---------------------------------------------------------------------------

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

  const handleChange = <K extends keyof MissionControlConfig>(field: K, value: MissionControlConfig[K]) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  // ---------------------------------------------------------------------------
  // Backup handlers
  // ---------------------------------------------------------------------------

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await fetch('/api/admin/backups', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create backup');
      }
      const data = await res.json();
      setBackupSuccess(`Backup created: ${data.backup.filename}${data.s3Uploaded ? ' (uploaded to S3)' : ''}`);
      setTimeout(() => setBackupSuccess(null), 5000);
      await fetchBackups();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to create backup');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestore = async (backup: BackupMetadata) => {
    setConfirmRestore(null);
    setIsRestoringBackup(backup.filename);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: backup.filename }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to restore backup');
      }
      const data = await res.json();
      setBackupSuccess(data.message);
      setTimeout(() => setBackupSuccess(null), 8000);
      await fetchBackups();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to restore backup');
    } finally {
      setIsRestoringBackup(null);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"? This cannot be undone.`)) return;

    setIsDeletingBackup(filename);
    setBackupError(null);
    try {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete backup');
      }
      setBackupSuccess(`Deleted: ${filename}`);
      setTimeout(() => setBackupSuccess(null), 3000);
      await fetchBackups();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to delete backup');
    } finally {
      setIsDeletingBackup(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

        {/* Kanban UX */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Home className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">Kanban UX</h2>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Tune board density and lane sizing behavior.
          </p>

          <label className="flex items-start gap-3 p-3 bg-mc-bg border border-mc-border rounded cursor-pointer">
            <input
              type="checkbox"
              checked={config.kanbanCompactEmptyColumns}
              onChange={(e) => handleChange('kanbanCompactEmptyColumns', e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--mc-accent)]"
            />
            <div>
              <div className="text-sm font-medium text-mc-text">Compact empty columns</div>
              <div className="text-xs text-mc-text-secondary mt-1">
                When enabled, empty Kanban columns shrink to header width while columns with tasks keep a wider, dynamic width.
              </div>
            </div>
          </label>
        </section>

        {/* ============================================================== */}
        {/* Database Backups Section                                        */}
        {/* ============================================================== */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-mc-accent" />
              <h2 className="text-xl font-semibold text-mc-text">Database Backups</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-mc-text-secondary">
              {s3Status.configured ? (
                <span className="flex items-center gap-1 text-green-400">
                  <Cloud className="w-3.5 h-3.5" /> S3 connected
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <CloudOff className="w-3.5 h-3.5" /> S3 not configured
                </span>
              )}
              <span>{backupTotal} backup{backupTotal !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <p className="text-sm text-mc-text-secondary mb-4">
            Create on-demand backups of your SQLite database. Backups include a WAL checkpoint for consistency.
            Restoring always creates a safety backup of the current database first.
          </p>

          {/* Backup action buttons */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              className="px-4 py-2 bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 flex items-center gap-2 disabled:opacity-50 text-sm font-medium"
            >
              {isCreatingBackup ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isCreatingBackup ? 'Creating...' : 'Create Backup Now'}
            </button>
            <button
              onClick={fetchBackups}
              disabled={isLoadingBackups}
              className="px-3 py-2 border border-mc-border rounded hover:bg-mc-bg-tertiary text-mc-text-secondary flex items-center gap-1.5 text-sm"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Backup success/error messages */}
          {backupSuccess && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm flex items-center gap-2">
              <Check className="w-4 h-4 flex-shrink-0" />
              {backupSuccess}
            </div>
          )}
          {backupError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {backupError}
            </div>
          )}

          {/* Backup list table */}
          {isLoadingBackups && backups.length === 0 ? (
            <div className="py-8 text-center text-mc-text-secondary text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading backups...
            </div>
          ) : backups.length === 0 ? (
            <div className="py-8 text-center text-mc-text-secondary text-sm border border-mc-border rounded bg-mc-bg">
              No backups yet. Click &quot;Create Backup Now&quot; to create your first backup.
            </div>
          ) : (
            <div className="border border-mc-border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mc-bg-tertiary border-b border-mc-border">
                    <th className="text-left px-4 py-2.5 text-mc-text-secondary font-medium">Backup</th>
                    <th className="text-left px-4 py-2.5 text-mc-text-secondary font-medium w-20">Size</th>
                    <th className="text-left px-4 py-2.5 text-mc-text-secondary font-medium w-24">Created</th>
                    <th className="text-left px-4 py-2.5 text-mc-text-secondary font-medium w-16">Version</th>
                    <th className="text-left px-4 py-2.5 text-mc-text-secondary font-medium w-20">Location</th>
                    <th className="text-right px-4 py-2.5 text-mc-text-secondary font-medium w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.filename} className="border-b border-mc-border last:border-0 hover:bg-mc-bg-tertiary/50">
                      <td className="px-4 py-2.5">
                        <div className="text-mc-text font-mono text-xs truncate max-w-[300px]" title={backup.filename}>
                          {backup.filename}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-mc-text-secondary text-xs">
                        {formatBytes(backup.size)}
                      </td>
                      <td className="px-4 py-2.5 text-mc-text-secondary text-xs" title={new Date(backup.timestamp).toLocaleString()}>
                        {timeAgo(backup.timestamp)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-mono px-1.5 py-0.5 bg-mc-bg rounded text-mc-text-secondary">
                          v{backup.migrationVersion}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {backup.location === 'both' ? (
                          <span className="text-green-400 flex items-center gap-1">
                            <Cloud className="w-3 h-3" /> Both
                          </span>
                        ) : backup.location === 's3' ? (
                          <span className="text-blue-400 flex items-center gap-1">
                            <Cloud className="w-3 h-3" /> S3
                          </span>
                        ) : (
                          <span className="text-mc-text-secondary">Local</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setConfirmRestore(backup)}
                            disabled={isRestoringBackup !== null}
                            className="px-2.5 py-1 text-xs rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 flex items-center gap-1"
                            title="Restore from this backup"
                          >
                            {isRestoringBackup === backup.filename ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3" />
                            )}
                            Restore
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup.filename)}
                            disabled={isDeletingBackup !== null}
                            className="px-2 py-1 text-xs rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                            title="Delete this backup"
                          >
                            {isDeletingBackup === backup.filename ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* S3 Configuration (collapsible) */}
          <div className="mt-4 border border-mc-border rounded">
            <button
              onClick={() => setShowS3Config(!showS3Config)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-mc-text-secondary hover:bg-mc-bg-tertiary/50"
            >
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                S3-Compatible Storage Configuration
              </span>
              {showS3Config ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {showS3Config && (
              <div className="px-4 pb-4 border-t border-mc-border">
                <p className="text-xs text-mc-text-secondary mt-3 mb-3">
                  Configure S3-compatible storage (AWS S3, MinIO, Backblaze B2, etc.) for off-site backup storage.
                  Set these values as environment variables in your <code className="px-1 py-0.5 bg-mc-bg rounded">.env.local</code> file:
                </p>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center gap-2 p-2 bg-mc-bg rounded">
                    <span className="text-mc-accent w-28">S3_ENDPOINT</span>
                    <span className="text-mc-text-secondary">
                      {s3Status.endpoint || '(not set)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-mc-bg rounded">
                    <span className="text-mc-accent w-28">S3_BUCKET</span>
                    <span className="text-mc-text-secondary">
                      {s3Status.bucket || '(not set)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-mc-bg rounded">
                    <span className="text-mc-accent w-28">S3_ACCESS_KEY</span>
                    <span className="text-mc-text-secondary">
                      {s3Status.configured ? '••••••••' : '(not set)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-mc-bg rounded">
                    <span className="text-mc-accent w-28">S3_SECRET_KEY</span>
                    <span className="text-mc-text-secondary">
                      {s3Status.configured ? '••••••••' : '(not set)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-mc-bg rounded">
                    <span className="text-mc-accent w-28">S3_REGION</span>
                    <span className="text-mc-text-secondary">us-east-1 (default)</span>
                  </div>
                </div>
                <p className="text-xs text-mc-text-secondary mt-3">
                  When configured, backups will be automatically uploaded to S3 after creation.
                  Credentials are stored server-side only — never in the browser.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Restore Confirmation Dialog */}
        {confirmRestore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-500/10 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-mc-text">Confirm Restore</h3>
              </div>

              <p className="text-sm text-mc-text-secondary mb-4">
                This will create a safety backup of your current database, then restore from the selected backup.
                The application may need to be restarted after restoration.
              </p>

              <div className="p-3 bg-mc-bg rounded border border-mc-border mb-4 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-mc-text-secondary">Backup:</span>
                  <span className="text-mc-text font-mono">{confirmRestore.filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mc-text-secondary">Size:</span>
                  <span className="text-mc-text">{formatBytes(confirmRestore.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mc-text-secondary">Created:</span>
                  <span className="text-mc-text">{new Date(confirmRestore.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mc-text-secondary">Migration Version:</span>
                  <span className="text-mc-text font-mono">v{confirmRestore.migrationVersion}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setConfirmRestore(null)}
                  className="px-4 py-2 text-sm border border-mc-border rounded hover:bg-mc-bg-tertiary text-mc-text-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRestore(confirmRestore)}
                  className="px-4 py-2 text-sm bg-amber-500 text-black rounded hover:bg-amber-400 font-medium flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Restore Database
                </button>
              </div>
            </div>
          </div>
        )}

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
            <li><code>S3_ENDPOINT</code>, <code>S3_BUCKET</code>, <code>S3_ACCESS_KEY</code>, <code>S3_SECRET_KEY</code> - S3 backup storage</li>
          </ul>
          <p className="text-xs text-blue-400 mt-3">
            Environment variables take precedence over UI settings for server-side operations.
          </p>
        </section>
      </div>
    </div>
  );
}
