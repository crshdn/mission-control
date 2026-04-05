'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Pause, RefreshCw, Truck, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { DependencyGraph } from './DependencyGraph';
import type { Convoy, ConvoySubtask, Task, ConvoyStatus } from '@/lib/types';

interface ConvoyTabProps {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
}

interface ConvoyData extends Convoy {
  subtasks: (ConvoySubtask & { task: Task })[];
}

interface ProgressData {
  convoy_id: string;
  status: ConvoyStatus;
  total: number;
  completed: number;
  failed: number;
  breakdown: Record<string, number>;
  subtasks: Array<{
    id: string;
    task_id: string;
    title: string;
    status: string;
    assigned_agent_id: string | null;
    sort_order: number;
    depends_on?: string[];
  }>;
}

export function ConvoyTab({ taskId, taskTitle, taskStatus }: ConvoyTabProps) {
  const [convoy, setConvoy] = useState<ConvoyData | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSubtasks, setNewSubtasks] = useState<Array<{ title: string; description: string }>>([{ title: '', description: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());

  const loadConvoy = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/convoy`);
      if (res.ok) {
        const data = await res.json();
        setConvoy(data);
        // Also load progress
        const progressRes = await fetch(`/api/tasks/${taskId}/convoy/progress`);
        if (progressRes.ok) {
          setProgress(await progressRes.json());
        }
      } else if (res.status === 404) {
        setConvoy(null);
      }
    } catch (err) {
      setError('Failed to load convoy data');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadConvoy();
  }, [loadConvoy]);

  // Poll for progress updates
  useEffect(() => {
    if (!convoy) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/convoy/progress`);
        if (res.ok) setProgress(await res.json());
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [convoy, taskId]);

  const handleCreateConvoy = async () => {
    const validSubtasks = newSubtasks.filter(s => s.title.trim());
    if (validSubtasks.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/convoy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'manual',
          name: taskTitle,
          subtasks: validSubtasks.map(s => ({ title: s.title, description: s.description || undefined })),
        }),
      });

      if (res.ok) {
        setShowCreateForm(false);
        setNewSubtasks([{ title: '', description: '' }]);
        await loadConvoy();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create convoy');
      }
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispatchAll = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/convoy/dispatch`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.dispatched === 0) {
          setError('No sub-tasks ready for dispatch');
        }
        await loadConvoy();
      } else {
        const data = await res.json();
        setError(data.error || 'Dispatch failed');
      }
    } catch {
      setError('Network error');
    }
  };

  const handleUpdateStatus = async (status: ConvoyStatus) => {
    try {
      await fetch(`/api/tasks/${taskId}/convoy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await loadConvoy();
    } catch {}
  };

  const handleDeleteConvoy = async () => {
    if (!confirm('Cancel this convoy and delete all sub-tasks?')) return;
    try {
      await fetch(`/api/tasks/${taskId}/convoy`, { method: 'DELETE' });
      setConvoy(null);
      setProgress(null);
      window.location.reload();
    } catch {}
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'in_progress': return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'testing': return <Clock className="w-4 h-4 text-cyan-400" />;
      case 'review': case 'verification': return <Clock className="w-4 h-4 text-purple-400" />;
      case 'assigned': return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'inbox': return <Clock className="w-4 h-4 text-gray-400" />;
      default: return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  const toggleSubtask = (id: string) => {
    const next = new Set(expandedSubtasks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedSubtasks(next);
  };

  if (loading) {
    return <div className="text-center py-8 text-mc-text-secondary text-sm">Loading convoy...</div>;
  }

  const handleAIDecompose = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/convoy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'ai' }),
      });

      if (res.ok) {
        await loadConvoy();
      } else {
        const data = await res.json();
        setError(data.error || 'AI decomposition failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // No convoy yet — show create form
  if (!convoy) {
    return (
      <div className="space-y-4">
        {!showCreateForm ? (
          <div className="text-center py-8">
            <Truck className="w-10 h-10 text-mc-text-secondary mx-auto mb-3" />
            <p className="text-sm text-mc-text-secondary mb-4">
              Break this task into parallel sub-tasks for faster completion
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90"
              >
                <Plus className="w-4 h-4" />
                Manual Decomposition
              </button>
              <button
                onClick={handleAIDecompose}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded text-sm font-medium hover:bg-purple-500/90 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4" />
                    AI Decomposition
                  </>
                )}
              </button>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md">
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Define Sub-Tasks</h3>
            {newSubtasks.map((st, i) => (
              <div key={i} className="space-y-2 p-3 bg-mc-bg rounded-lg border border-mc-border">
                <input
                  type="text"
                  value={st.title}
                  onChange={(e) => {
                    const copy = [...newSubtasks];
                    copy[i] = { ...copy[i], title: e.target.value };
                    setNewSubtasks(copy);
                  }}
                  placeholder={`Sub-task ${i + 1} title`}
                  className="w-full min-h-10 bg-mc-bg-secondary border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                />
                <textarea
                  value={st.description}
                  onChange={(e) => {
                    const copy = [...newSubtasks];
                    copy[i] = { ...copy[i], description: e.target.value };
                    setNewSubtasks(copy);
                  }}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full bg-mc-bg-secondary border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
                />
              </div>
            ))}
            <button
              onClick={() => setNewSubtasks([...newSubtasks, { title: '', description: '' }])}
              className="text-sm text-mc-accent hover:underline"
            >
              + Add another sub-task
            </button>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md">
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCreateForm(false); setNewSubtasks([{ title: '', description: '' }]); }}
                className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConvoy}
                disabled={isSubmitting || newSubtasks.every(s => !s.title.trim())}
                className="px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Convoy'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Convoy exists — show progress
  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const convoyStatusColor: Record<string, string> = {
    active: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    paused: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    completing: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    done: 'text-green-400 bg-green-500/10 border-green-500/20',
    failed: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  return (
    <div className="space-y-4">
      {/* Convoy header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-cyan-400" />
          <span className="font-medium text-sm">Convoy</span>
          <span className={`text-xs px-2 py-0.5 rounded border ${convoyStatusColor[convoy.status] || ''}`}>
            {convoy.status.toUpperCase()}
          </span>
        </div>
        <div className="flex gap-1">
          {convoy.status === 'active' && (
            <>
              <button onClick={handleDispatchAll} className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-accent" title="Dispatch ready sub-tasks">
                <Play className="w-4 h-4" />
              </button>
              <button onClick={() => handleUpdateStatus('paused')} className="p-1.5 rounded hover:bg-mc-bg-tertiary text-yellow-400" title="Pause convoy">
                <Pause className="w-4 h-4" />
              </button>
            </>
          )}
          {convoy.status === 'paused' && (
            <button onClick={() => handleUpdateStatus('active')} className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-accent" title="Resume convoy">
              <Play className="w-4 h-4" />
            </button>
          )}
          <button onClick={loadConvoy} className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-mc-text-secondary mb-1">
          <span>{progress?.completed || 0} of {progress?.total || 0} complete</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
          <div className="h-full bg-cyan-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {(progress?.failed || 0) > 0 && (
          <div className="text-xs text-red-400 mt-1">{progress!.failed} failed</div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md">
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* Sub-task list */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium uppercase text-mc-text-secondary mb-2">Sub-Tasks</h4>
        {(progress?.subtasks || []).map((st) => (
          <div key={st.id} className="bg-mc-bg rounded-lg border border-mc-border/50">
            <button
              onClick={() => toggleSubtask(st.id)}
              className="w-full flex items-center gap-2 p-3 text-left text-sm hover:bg-mc-bg-tertiary/50 rounded-lg"
            >
              {expandedSubtasks.has(st.id) ? <ChevronDown className="w-3.5 h-3.5 text-mc-text-secondary" /> : <ChevronRight className="w-3.5 h-3.5 text-mc-text-secondary" />}
              {getStatusIcon(st.status)}
              <span className="flex-1 truncate">{st.title}</span>
              <span className="text-xs text-mc-text-secondary capitalize">{st.status?.replace('_', ' ')}</span>
            </button>
            {expandedSubtasks.has(st.id) && (
              <div className="px-3 pb-3 pl-10 text-xs text-mc-text-secondary space-y-1">
                <div>Task ID: <span className="font-mono text-mc-text">{st.task_id}</span></div>
                {st.depends_on && st.depends_on.length > 0 && (
                  <div>Depends on: {st.depends_on.join(', ')}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dependency graph */}
      {progress?.subtasks && (
        <DependencyGraph
          subtasks={(progress.subtasks || []).map(st => ({
            id: st.id,
            task_id: st.task_id,
            title: st.title || 'Untitled',
            status: st.status || 'inbox',
            depends_on: st.depends_on,
          }))}
        />
      )}

      {/* Actions footer */}
      {convoy.status !== 'done' && convoy.status !== 'failed' && (
        <div className="pt-3 border-t border-mc-border flex justify-between">
          <button
            onClick={handleDeleteConvoy}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Cancel Convoy
          </button>
          <button
            onClick={handleDispatchAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-mc-accent text-mc-bg rounded text-xs font-medium hover:bg-mc-accent/90"
          >
            <Play className="w-3.5 h-3.5" />
            Dispatch Ready
          </button>
        </div>
      )}
    </div>
  );
}
