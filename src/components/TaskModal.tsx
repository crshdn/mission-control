'use client';


import { logger } from '@/lib/logger';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { X, Save, Trash2, Activity, Package, Bot, ClipboardList, Plus, Users, ImageIcon, Truck, Radio, MessageSquare, ExternalLink, HardDrive } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { triggerAutoDispatch, shouldTriggerAutoDispatch } from '@/lib/auto-dispatch';
import { ActivityLog } from './ActivityLog';
import { DeliverablesList } from './DeliverablesList';
import { SessionsList } from './SessionsList';
import { PlanningTab } from './PlanningTab';
import { TeamTab } from './TeamTab';
import { AgentModal } from './AgentModal';
import { TaskImages } from './TaskImages';
import { ConvoyTab } from './ConvoyTab';
import { AgentLiveTab } from './AgentLiveTab';
import { TaskChatTab } from './TaskChatTab';
import { WorkspaceTab } from './WorkspaceTab';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';

type TabType = 'overview' | 'planning' | 'convoy' | 'team' | 'activity' | 'deliverables' | 'images' | 'sessions' | 'workspace' | 'agent-live' | 'chat';

interface TaskModalProps {
  task?: Task;
  onClose: () => void;
  workspaceId?: string;
}

export function TaskModal({ task, onClose, workspaceId }: TaskModalProps) {
  const router = useRouter();
  const { agents, addTask, updateTask, addEvent } = useMissionControl(
    useShallow((state) => ({
      agents: state.agents,
      addTask: state.addTask,
      updateTask: state.updateTask,
      addEvent: state.addEvent,
    }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [usePlanningMode, setUsePlanningMode] = useState(false);
  // Auto-switch to relevant tab based on task status
  const [activeTab, setActiveTab] = useState<TabType>(
    task?.status === 'planning' ? 'planning' : task?.status === 'convoy_active' ? 'convoy' : 'overview'
  );

  // Refresh data when spec is locked (planning completed)
  const handleSpecLocked = useCallback(() => {
    router.refresh();
  }, [router]);

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'normal' as TaskPriority,
    status: task?.status || 'inbox' as TaskStatus,
    assigned_agent_id: task?.assigned_agent_id || '',
    due_date: task?.due_date || '',
  });

  const resolveStatus = (): TaskStatus => {
    // Planning mode overrides everything
    if (!task && usePlanningMode) return 'planning';
    // Auto-determine based on agent assignment
    const hasAgent = !!form.assigned_agent_id;
    if (!task) {
      // New task: agent → assigned, no agent → inbox
      return hasAgent ? 'assigned' : 'inbox';
    }
    // Existing task: if in inbox and agent just assigned, promote to assigned
    if (task.status === 'inbox' && hasAgent) return 'assigned';
    return form.status;
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent, keepOpen = false) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSaveError(null);

    try {
      const url = task ? `/api/tasks/${task.id}` : '/api/tasks';
      const method = task ? 'PATCH' : 'POST';
      const resolvedStatus = resolveStatus();

      const payload = {
        ...form,
        status: resolvedStatus,
        assigned_agent_id: form.assigned_agent_id || null,
        due_date: form.due_date || null,
        workspace_id: workspaceId || task?.workspace_id || 'default',
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        setSaveError(errData.error || `Save failed (${res.status})`);
        return;
      }

      const savedTask = await res.json();

      if (task) {
        // Editing existing task
        updateTask(savedTask);

        // Note: dispatch for existing tasks is handled server-side by the PATCH route.
        // Only trigger client-side dispatch for drag-to-in_progress (legacy flow).
        if (shouldTriggerAutoDispatch(task.status, savedTask.status, savedTask.assigned_agent_id)) {
          triggerAutoDispatch({
            taskId: savedTask.id,
            taskTitle: savedTask.title,
            agentId: savedTask.assigned_agent_id,
            agentName: savedTask.assigned_agent?.name || 'Unknown Agent',
            workspaceId: savedTask.workspace_id
          }).catch((err) => logger.error('Auto-dispatch failed:', err));
        }

        onClose();
        return;
      }

      // Creating new task
      addTask(savedTask);
      addEvent({
        id: savedTask.id + '-created',
        type: 'task_created',
        task_id: savedTask.id,
        message: `New task: ${savedTask.title}`,
        created_at: new Date().toISOString(),
      });

      if (usePlanningMode) {
        // Start planning session (fire-and-forget), then close modal.
        // User reopens the task from the board to see the planning tab.
        fetch(`/api/tasks/${savedTask.id}/planning`, { method: 'POST' })
          .catch((error) => logger.error('Failed to start planning:', error));
        onClose();
        return;
      }

      // Auto-dispatch if agent assigned (fire-and-forget)
      if (savedTask.assigned_agent_id && savedTask.status === 'assigned') {
        triggerAutoDispatch({
          taskId: savedTask.id,
          taskTitle: savedTask.title,
          agentId: savedTask.assigned_agent_id,
          agentName: savedTask.assigned_agent?.name || 'Unknown Agent',
          workspaceId: savedTask.workspace_id
        }).catch((err) => logger.error('Auto-dispatch failed:', err));
      }

      if (keepOpen) {
        // "Save & New": clear form, stay open
        setForm({
          title: '',
          description: '',
          priority: 'normal' as TaskPriority,
          status: 'inbox' as TaskStatus,
          assigned_agent_id: '',
          due_date: '',
        });
        setUsePlanningMode(false);
      } else {
        onClose();
      }
    } catch (error) {
      logger.error('Failed to save task:', error);
      setSaveError(error instanceof Error ? error.message : 'Network error — please try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm(`Delete "${task.title}"?`)) return;

    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (res.ok) {
        useMissionControl.setState((state) => ({
          tasks: state.tasks.filter((t) => t.id !== task.id),
        }));
        onClose();
      }
    } catch (error) {
      logger.error('Failed to delete task:', error);
    }
  };

  const priorities: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: null },
    { id: 'planning' as TabType, label: 'Planning', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'convoy' as TabType, label: 'Convoy', icon: <Truck className="w-4 h-4" /> },
    { id: 'team' as TabType, label: 'Team', icon: <Users className="w-4 h-4" /> },
    { id: 'activity' as TabType, label: 'Activity', icon: <Activity className="w-4 h-4" /> },
    { id: 'deliverables' as TabType, label: 'Deliverables', icon: <Package className="w-4 h-4" /> },
    { id: 'images' as TabType, label: 'Images', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'sessions' as TabType, label: 'Sessions', icon: <Bot className="w-4 h-4" /> },
    // Workspace tab — shown when task has workspace isolation
    ...(task?.workspace_path ? [{ id: 'workspace' as TabType, label: 'Workspace', icon: <HardDrive className="w-4 h-4" /> }] : []),
    // Chat is always available — messages dispatch the agent if needed
    { id: 'chat' as TabType, label: 'Chat', icon: <MessageSquare className="w-4 h-4" /> },
    // Agent Live only shown when agent is active
    ...(task && ['in_progress', 'convoy_active', 'testing', 'verification'].includes(task.status)
      ? [
          { id: 'agent-live' as TabType, label: 'Agent Live', icon: <Radio className="w-4 h-4" /> },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-autensa-bg-secondary border border-autensa-border rounded-t-xl sm:rounded-lg w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-autensa-border flex-shrink-0">
          <h2 className="text-lg font-semibold">
            {task ? task.title : 'Create New Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-autensa-bg-tertiary rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs - only show for existing tasks */}
        {task && (
          <div className="flex border-b border-autensa-border flex-shrink-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 min-h-11 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-autensa-accent border-b-2 border-autensa-accent'
                    : 'text-autensa-text-secondary hover:text-autensa-text'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full min-h-11 bg-autensa-bg border border-autensa-border rounded px-3 py-2 text-sm focus:outline-none focus:border-autensa-accent"
              placeholder="What needs to be done?"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full bg-autensa-bg border border-autensa-border rounded px-3 py-2 text-sm focus:outline-none focus:border-autensa-accent resize-none"
              placeholder="Add details..."
            />
          </div>

          {/* Planning Mode Toggle - only for new tasks */}
          {!task && (
            <div className="p-3 bg-autensa-bg rounded-lg border border-autensa-border">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePlanningMode}
                  onChange={(e) => setUsePlanningMode(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-autensa-border"
                />
                <div>
                  <span className="font-medium text-sm flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-autensa-accent" />
                    Enable Planning Mode
                  </span>
                  <p className="text-xs text-autensa-text-secondary mt-1">
                    Best for complex projects that need detailed requirements. 
                    You&apos;ll answer a few questions to define scope, goals, and constraints 
                    before work begins. Skip this for quick, straightforward tasks.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Assigned Agent */}
          <div>
            <label className="block text-sm font-medium mb-1">Assign to</label>
            <select
              value={form.assigned_agent_id}
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  setShowAgentModal(true);
                } else {
                  setForm({ ...form, assigned_agent_id: e.target.value });
                }
              }}
              className="w-full min-h-11 bg-autensa-bg border border-autensa-border rounded px-3 py-2 text-sm focus:outline-none focus:border-autensa-accent"
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar_emoji} {agent.name} - {agent.role}
                </option>
              ))}
              <option value="__add_new__" className="text-autensa-accent">
                ➕ Add new agent...
              </option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full min-h-11 bg-autensa-bg border border-autensa-border rounded px-3 py-2 text-sm focus:outline-none focus:border-autensa-accent"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <input
                type="datetime-local"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full min-h-11 bg-autensa-bg border border-autensa-border rounded px-3 py-2 text-sm focus:outline-none focus:border-autensa-accent"
              />
            </div>
          </div>

          {/* Pull Request section */}
          {task?.pr_url && (
            <div className="p-3 bg-autensa-bg rounded-lg border border-autensa-border">
              <h4 className="text-sm font-medium text-autensa-text mb-2 flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Pull Request
              </h4>
              <div className="flex items-center gap-3">
                <a
                  href={task.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-autensa-accent hover:underline break-all"
                >
                  {task.pr_url}
                </a>
                {task.pr_status && (
                  <span className={`shrink-0 text-xs px-2 py-1 rounded font-medium ${
                    task.pr_status === 'open' ? 'bg-blue-500/20 text-blue-400' :
                    task.pr_status === 'merged' ? 'bg-green-500/20 text-green-400' :
                    task.pr_status === 'closed' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {task.pr_status}
                  </span>
                )}
              </div>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md">
              <span className="text-sm text-red-400">{saveError}</span>
            </div>
          )}
            </form>
          )}

          {/* Planning Tab */}
          {activeTab === 'planning' && task && (
            <PlanningTab
              taskId={task.id}
              onSpecLocked={handleSpecLocked}
            />
          )}

          {/* Convoy Tab */}
          {activeTab === 'convoy' && task && (
            <ConvoyTab taskId={task.id} taskTitle={task.title} taskStatus={task.status} />
          )}

          {/* Team Tab */}
          {activeTab === 'team' && task && (
            <TeamTab taskId={task.id} workspaceId={workspaceId || task.workspace_id || 'default'} />
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && task && (
            <ActivityLog taskId={task.id} />
          )}

          {/* Deliverables Tab */}
          {activeTab === 'deliverables' && task && (
            <DeliverablesList taskId={task.id} />
          )}

          {/* Images Tab */}
          {activeTab === 'images' && task && (
            <TaskImages taskId={task.id} />
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && task && (
            <SessionsList taskId={task.id} />
          )}

          {/* Agent Live Tab */}
          {activeTab === 'agent-live' && task && (
            <AgentLiveTab taskId={task.id} />
          )}

          {/* Chat Tab */}
          {/* Workspace Tab */}
          {activeTab === 'workspace' && task && (
            <WorkspaceTab taskId={task.id} taskStatus={task.status} />
          )}

          {activeTab === 'chat' && task && (
            <TaskChatTab taskId={task.id} />
          )}
        </div>

        {/* Footer - only show on overview tab */}
        {activeTab === 'overview' && (
          <div className="flex items-center justify-between p-4 border-t border-autensa-border flex-shrink-0">
            <div className="flex gap-2">
              {task && (
                <>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="min-h-11 flex items-center gap-2 px-3 py-2 text-autensa-accent-red hover:bg-autensa-accent-red/10 rounded text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 px-4 py-2 text-sm text-autensa-text-secondary hover:text-autensa-text"
              >
                Cancel
              </button>
              {!task && (
                <button
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={isSubmitting}
                  className="min-h-11 flex items-center gap-2 px-4 py-2 border border-autensa-accent text-autensa-accent rounded text-sm font-medium hover:bg-autensa-accent/10 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isSubmitting ? 'Saving...' : 'Save & New'}
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="min-h-11 flex items-center gap-2 px-4 py-2 bg-autensa-accent text-autensa-bg rounded text-sm font-medium hover:bg-autensa-accent/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nested Agent Modal for inline agent creation */}
      {showAgentModal && (
        <AgentModal
          workspaceId={workspaceId}
          onClose={() => setShowAgentModal(false)}
          onAgentCreated={(agentId) => {
            // Auto-select the newly created agent
            setForm({ ...form, assigned_agent_id: agentId });
            setShowAgentModal(false);
          }}
        />
      )}
    </div>
  );
}
