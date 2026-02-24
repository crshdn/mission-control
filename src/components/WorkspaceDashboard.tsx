'use client';

import { useState, useEffect } from 'react';
import { Plus, ArrowRight, Folder, Users, CheckSquare, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { WorkspaceStats } from '@/lib/types';

export function WorkspaceDashboard() {
  const [workspaces, setWorkspaces] = useState<WorkspaceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces?stats=true');
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-apple-bg flex items-center justify-center">
        <div className="text-center animate-apple-fade-in">
          <div className="text-5xl mb-apple-4 animate-pulse opacity-60">🦞</div>
          <p className="apple-text-secondary text-apple-body">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-apple-bg">
      {/* Header - Apple style with subtle background */}
      <header className="bg-apple-bg-secondary/50 apple-glass border-b border-apple-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-apple-6 py-apple-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-apple-3">
              <span className="text-3xl">🦞</span>
              <h1 className="text-apple-title-2 apple-text-primary font-semibold">Mission Control</h1>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="apple-button-primary flex items-center gap-apple-2 shadow-apple-md hover:shadow-apple-lg"
            >
              <Plus className="w-4 h-4" />
              New Workspace
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Generous spacing, Apple-style typography */}
      <main className="max-w-7xl mx-auto px-apple-6 py-apple-10">
        <div className="mb-apple-10 animate-apple-fade-in">
          <h2 className="text-apple-large-title apple-text-primary font-bold mb-apple-2">All Workspaces</h2>
          <p className="text-apple-body apple-text-secondary">
            Select a workspace to view its mission queue and agents
          </p>
        </div>

        {workspaces.length === 0 ? (
          <div className="text-center py-apple-24 animate-apple-scale-in">
            <div className="w-16 h-16 mx-auto mb-apple-6 bg-apple-bg-tertiary rounded-apple-xl flex items-center justify-center">
              <Folder className="w-8 h-8 text-apple-text-tertiary" />
            </div>
            <h3 className="text-apple-title-3 font-semibold mb-apple-2">No workspaces yet</h3>
            <p className="text-apple-body apple-text-secondary mb-apple-8 max-w-md mx-auto">
              Create your first workspace to get started with organizing your AI agents and tasks
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="apple-button-primary px-apple-8 py-apple-3 shadow-apple-lg"
            >
              Create Workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-apple-6 animate-apple-fade-in">
            {workspaces.map((workspace, index) => (
              <div
                key={workspace.id}
                style={{ animationDelay: `${index * 0.1}s` }}
                className="animate-apple-slide-up"
              >
                <WorkspaceCard 
                  workspace={workspace} 
                  onDelete={(id) => setWorkspaces(workspaces.filter(w => w.id !== id))}
                />
              </div>
            ))}
            
            {/* Add workspace card - Apple style */}
            <div 
              style={{ animationDelay: `${workspaces.length * 0.1}s` }}
              className="animate-apple-slide-up"
            >
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full border-2 border-dashed border-apple-border rounded-apple-xl p-apple-8 hover:border-apple-accent/50 hover:bg-apple-bg-secondary/30 transition-all duration-200 flex flex-col items-center justify-center gap-apple-4 min-h-[240px] apple-button group"
              >
                <div className="w-12 h-12 rounded-apple-lg bg-apple-bg-tertiary flex items-center justify-center group-hover:bg-apple-accent/10 transition-colors duration-200">
                  <Plus className="w-6 h-6 apple-text-tertiary group-hover:text-apple-accent transition-colors duration-200" />
                </div>
                <span className="text-apple-callout apple-text-secondary font-medium group-hover:text-apple-text transition-colors duration-200">
                  Add Workspace
                </span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateWorkspaceModal 
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadWorkspaces();
          }}
        />
      )}
    </div>
  );
}

function WorkspaceCard({ workspace, onDelete }: { workspace: WorkspaceStats; onDelete: (id: string) => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(workspace.id);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete workspace');
      }
    } catch {
      alert('Failed to delete workspace');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };
  
  return (
    <>
      <Link href={`/workspace/${workspace.slug}`}>
        <div className="apple-card p-apple-6 cursor-pointer group relative overflow-hidden">
          {/* Card content */}
          <div className="flex items-start justify-between mb-apple-6">
            <div className="flex items-center gap-apple-4">
              <div className="w-12 h-12 rounded-apple-lg bg-apple-bg-tertiary flex items-center justify-center text-2xl">
                {workspace.icon}
              </div>
              <div>
                <h3 className="text-apple-headline font-semibold group-hover:text-apple-accent transition-colors">
                  {workspace.name}
                </h3>
                <p className="text-apple-footnote apple-text-secondary">/{workspace.slug}</p>
              </div>
            </div>
            <div className="flex items-center gap-apple-2">
              {workspace.id !== 'default' && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="p-2 rounded-apple-md hover:bg-red-50 text-apple-text-tertiary hover:text-red-600 transition-all duration-200 opacity-0 group-hover:opacity-100"
                  title="Delete workspace"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <ArrowRight className="w-5 h-5 apple-text-tertiary group-hover:text-apple-accent transition-colors group-hover:translate-x-1 duration-200" />
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-apple-6 text-apple-footnote apple-text-secondary">
            <div className="flex items-center gap-apple-2">
              <div className="w-5 h-5 rounded-apple-xs bg-apple-green/10 flex items-center justify-center">
                <CheckSquare className="w-3 h-3 text-apple-green" />
              </div>
              <span>{workspace.taskCounts.total} tasks</span>
            </div>
            <div className="flex items-center gap-apple-2">
              <div className="w-5 h-5 rounded-apple-xs bg-apple-blue/10 flex items-center justify-center">
                <Users className="w-3 h-3 text-apple-blue" />
              </div>
              <span>{workspace.agentCount} agents</span>
            </div>
          </div>

          {/* Subtle hover effect */}
          <div className="absolute inset-0 bg-apple-accent/3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
        </div>
      </Link>

      {/* Delete Confirmation Modal - Apple style */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-apple-fade-in" 
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div 
            className="apple-glass rounded-apple-xl w-full max-w-md p-apple-6 animate-apple-scale-in shadow-apple-xl" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-apple-4 mb-apple-6">
              <div className="w-12 h-12 bg-red-100 rounded-apple-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-apple-headline font-semibold mb-apple-1">Delete Workspace</h3>
                <p className="text-apple-subhead apple-text-secondary">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-apple-body apple-text-secondary mb-apple-8">
              Are you sure you want to delete <strong className="apple-text-primary">{workspace.name}</strong>? 
              {workspace.taskCounts.total > 0 && (
                <span className="block mt-apple-2 text-red-600 font-medium">
                  ⚠️ This workspace has {workspace.taskCounts.total} task(s). Delete them first.
                </span>
              )}
            </p>
            
            <div className="flex justify-end gap-apple-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="apple-button-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || workspace.taskCounts.total > 0 || workspace.agentCount > 0}
                className="px-apple-4 py-apple-2 bg-red-600 text-white rounded-apple-md font-medium hover:bg-red-700 disabled:opacity-50 apple-button transition-all duration-200"
              >
                {deleting ? 'Deleting...' : 'Delete Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CreateWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const icons = ['📁', '💼', '🏢', '🚀', '💡', '🎯', '📊', '🔧', '🌟', '🏠', '🎨', '⚡'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), icon }),
      });

      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create workspace');
      }
    } catch {
      setError('Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-apple-fade-in">
      <div className="apple-glass rounded-apple-xl w-full max-w-md animate-apple-scale-in shadow-apple-xl">
        {/* Header */}
        <div className="p-apple-6 border-b apple-divider">
          <h2 className="text-apple-title-3 font-semibold apple-text-primary">Create New Workspace</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-apple-6 space-y-apple-6">
          {/* Icon selector */}
          <div>
            <label className="block text-apple-callout font-medium mb-apple-3 apple-text-primary">Icon</label>
            <div className="grid grid-cols-6 gap-apple-2">
              {icons.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`aspect-square rounded-apple-md text-xl flex items-center justify-center transition-all duration-200 apple-button ${
                    icon === i 
                      ? 'bg-apple-accent/10 border-2 border-apple-accent shadow-apple-sm' 
                      : 'bg-apple-bg-tertiary border border-apple-border hover:border-apple-accent/50 hover:bg-apple-bg-secondary'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Name input */}
          <div>
            <label className="block text-apple-callout font-medium mb-apple-3 apple-text-primary">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Acme Corp"
              className="apple-input text-apple-body"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-red-600 text-apple-subhead bg-red-50 rounded-apple-md p-apple-3">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-apple-3 pt-apple-4">
            <button
              type="button"
              onClick={onClose}
              className="apple-button-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="apple-button-primary px-apple-6 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
