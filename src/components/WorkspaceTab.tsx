'use client';

import { useState, useEffect, useCallback } from 'react';
import { GitBranch, HardDrive, Merge, Trash2, Loader, AlertTriangle, Check, FolderOpen } from 'lucide-react';

interface WorkspaceStatus {
  exists: boolean;
  strategy?: 'worktree' | 'sandbox';
  path?: string;
  port?: number;
  branch?: string;
  baseBranch?: string;
  baseCommit?: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  mergeStatus?: string;
  conflicts?: string[];
}

interface WorkspaceTabProps {
  taskId: string;
  taskStatus: string;
}

export function WorkspaceTab({ taskId, taskStatus }: WorkspaceTabProps) {
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/workspace`);
      if (res.ok) setWorkspace(await res.json());
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const doAction = async (action: string, body?: object) => {
    setActing(action);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/workspace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `${action} failed`);
      }
      await loadStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="text-autensa-text-secondary animate-pulse p-4">Loading workspace...</div>;
  }

  if (!workspace?.exists) {
    return (
      <div className="space-y-4 p-1">
        <div className="text-center py-8">
          <FolderOpen className="w-8 h-8 text-autensa-text-secondary mx-auto mb-3 opacity-50" />
          <p className="text-autensa-text-secondary text-sm">No isolated workspace</p>
          <p className="text-autensa-text-secondary/60 text-xs mt-1">
            Workspaces are created automatically when parallel builds are detected
          </p>
        </div>
        <button
          onClick={() => doAction('create')}
          disabled={acting !== null}
          className="w-full min-h-11 px-4 rounded-lg border border-autensa-border bg-autensa-bg text-sm text-autensa-text hover:bg-autensa-bg-tertiary disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {acting === 'create' ? <Loader className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
          Create Workspace Manually
        </button>
      </div>
    );
  }

  const strategyLabel = workspace.strategy === 'worktree' ? 'Git Worktree' : 'Sandbox Copy';
  const strategyIcon = workspace.strategy === 'worktree' ? <GitBranch className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />;

  const mergeStatusColors: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-400',
    merged: 'bg-green-500/20 text-green-400',
    pr_created: 'bg-blue-500/20 text-blue-400',
    conflict: 'bg-red-500/20 text-red-400',
    abandoned: 'bg-autensa-bg-tertiary text-autensa-text-secondary',
  };

  return (
    <div className="space-y-4 p-1">
      {/* Strategy badge */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded bg-autensa-bg-tertiary text-autensa-text-secondary">
          {strategyIcon}
          {strategyLabel}
        </span>
        {workspace.mergeStatus && (
          <span className={`text-xs font-medium px-2 py-1 rounded ${mergeStatusColors[workspace.mergeStatus] || 'bg-autensa-bg-tertiary text-autensa-text-secondary'}`}>
            {workspace.mergeStatus === 'pr_created' ? 'PR Created' : workspace.mergeStatus}
          </span>
        )}
      </div>

      {/* Workspace details */}
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-autensa-text-secondary w-24 shrink-0">Path</span>
          <span className="text-autensa-text font-mono text-xs break-all">{workspace.path}</span>
        </div>
        {workspace.branch && (
          <div className="flex items-center gap-2">
            <span className="text-autensa-text-secondary w-24 shrink-0">Branch</span>
            <span className="text-autensa-text font-mono text-xs">{workspace.branch}</span>
          </div>
        )}
        {workspace.baseBranch && (
          <div className="flex items-center gap-2">
            <span className="text-autensa-text-secondary w-24 shrink-0">Base</span>
            <span className="text-autensa-text font-mono text-xs">{workspace.baseBranch}</span>
          </div>
        )}
        {workspace.baseCommit && (
          <div className="flex items-center gap-2">
            <span className="text-autensa-text-secondary w-24 shrink-0">Base commit</span>
            <span className="text-autensa-text font-mono text-xs">{workspace.baseCommit.slice(0, 12)}</span>
          </div>
        )}
        {workspace.port && workspace.port > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-autensa-text-secondary w-24 shrink-0">Port</span>
            <span className="text-autensa-text font-mono text-xs">{workspace.port}</span>
          </div>
        )}
      </div>

      {/* Diff stats */}
      {(workspace.filesChanged !== undefined && workspace.filesChanged > 0) && (
        <div className="flex items-center gap-3 p-3 bg-autensa-bg rounded-lg border border-autensa-border text-xs">
          <span className="text-autensa-text-secondary">{workspace.filesChanged} files changed</span>
          {workspace.insertions !== undefined && workspace.insertions > 0 && (
            <span className="text-green-400">+{workspace.insertions}</span>
          )}
          {workspace.deletions !== undefined && workspace.deletions > 0 && (
            <span className="text-red-400">-{workspace.deletions}</span>
          )}
        </div>
      )}

      {/* Conflict warning */}
      {workspace.mergeStatus === 'conflict' && workspace.conflicts && workspace.conflicts.length > 0 && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-red-400 font-medium mb-2">
            <AlertTriangle className="w-4 h-4" />
            Merge Conflicts
          </div>
          <ul className="text-xs text-autensa-text-secondary space-y-1">
            {workspace.conflicts.map((f, i) => (
              <li key={i} className="font-mono">{f}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 px-1">{error}</div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {(taskStatus === 'done' || workspace.mergeStatus === 'pending') && (
          <button
            onClick={() => doAction('merge', { createPR: true })}
            disabled={acting !== null}
            className="flex-1 min-h-11 px-4 rounded-lg bg-autensa-accent text-white text-sm font-medium hover:bg-autensa-accent/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {acting === 'merge' ? <Loader className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
            Merge
          </button>
        )}
        {workspace.mergeStatus === 'merged' && (
          <div className="flex-1 min-h-11 px-4 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            Merged
          </div>
        )}
        <button
          onClick={() => {
            if (confirm('Remove this workspace? This cannot be undone.')) doAction('cleanup');
          }}
          disabled={acting !== null}
          className="min-h-11 px-3 rounded-lg border border-autensa-border text-autensa-text-secondary hover:text-red-400 hover:border-red-400/30 disabled:opacity-50 flex items-center justify-center"
          title="Remove workspace"
        >
          {acting === 'cleanup' ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
