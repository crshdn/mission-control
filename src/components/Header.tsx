'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, Settings, ChevronLeft, LayoutGrid, Users } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { format } from 'date-fns';
import type { Task, Workspace } from '@/lib/types';
import { TaskQueuePanel } from './TaskQueuePanel';
import { TaskModal } from './TaskModal';

interface HeaderProps {
  workspace?: Workspace;
}

export function Header({ workspace }: HeaderProps) {
  const router = useRouter();
  const { agents, tasks, isOnline, setIsOnline, viewMode, setViewMode } = useMissionControl();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeSubAgents, setActiveSubAgents] = useState(0);
  const [showTaskQueue, setShowTaskQueue] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load active sub-agent count
  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();

    // Poll every 30 seconds (reduced from 10s to reduce load)
    const interval = setInterval(loadSubAgentCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const activeAgents = workingAgents + activeSubAgents;
  const queuedTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'review');
  const tasksInQueue = queuedTasks.length;

  return (
    <header className="h-14 bg-mc-bg-secondary border-b border-mc-border flex items-center justify-between px-4">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-mc-accent-cyan" />
          <span className="font-semibold text-mc-text uppercase tracking-wider text-sm">
            Mission Control
          </span>
        </div>

        {/* Workspace indicator or back to dashboard */}
        {workspace ? (
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-1 text-mc-text-secondary hover:text-mc-accent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <LayoutGrid className="w-4 h-4" />
            </Link>
            <span className="text-mc-text-secondary">/</span>
            <div className="flex items-center gap-2 px-3 py-1 bg-mc-bg-tertiary rounded">
              <span className="text-lg">{workspace.icon}</span>
              <span className="font-medium">{workspace.name}</span>
            </div>
          </div>
        ) : (
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1 bg-mc-bg-tertiary rounded hover:bg-mc-bg transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="text-sm">All Workspaces</span>
          </Link>
        )}
      </div>

      {/* Center: View toggle + Stats */}
      {workspace && (
        <div className="flex items-center gap-6">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-mc-border overflow-hidden">
            <button
              onClick={() => setViewMode('fleet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'fleet'
                  ? 'bg-mc-accent text-mc-bg'
                  : 'text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Fleet
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-mc-accent text-mc-bg'
                  : 'text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Board
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-mc-accent-cyan">{activeAgents}</div>
              <div className="text-xs text-mc-text-secondary uppercase">Agents Active</div>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowTaskQueue(!showTaskQueue)}
                className="text-center cursor-pointer hover:bg-mc-bg-tertiary rounded-lg px-3 py-1.5 transition-colors"
              >
                <div className="text-2xl font-bold text-mc-accent-purple">{tasksInQueue}</div>
                <div className="text-xs text-mc-text-secondary uppercase">Tasks in Queue</div>
              </button>
              {showTaskQueue && (
                <TaskQueuePanel
                  tasks={queuedTasks}
                  onClose={() => setShowTaskQueue(false)}
                  onSelectTask={(task) => {
                    setShowTaskQueue(false);
                    setEditingTask(task);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right: Time & Status */}
      <div className="flex items-center gap-4">
        <span className="text-mc-text-secondary text-sm font-mono">
          {format(currentTime, 'HH:mm:ss')}
        </span>
        <button
          onClick={() => setIsOnline(!isOnline)}
          className={`flex items-center gap-2 px-3 py-1 rounded border text-sm font-medium cursor-pointer ${
            isOnline
              ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
              : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
          }`}
          title="Click to toggle connection status"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
            }`}
          />
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </button>
        <button
          onClick={() => router.push('/settings')}
          className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
      {/* Task detail modal */}
      {editingTask && (
        <TaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          workspaceId={workspace?.id}
        />
      )}
    </header>
  );
}
