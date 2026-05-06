'use client';

import { useState, useCallback, useEffect } from 'react';
import { X, Save, Trash2, Activity, Package, Bot, ClipboardList, Plus, FileText, CheckCircle, ExternalLink } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { triggerAutoDispatch, shouldTriggerAutoDispatch } from '@/lib/auto-dispatch';
import { ActivityLog } from './ActivityLog';
import { DeliverablesList } from './DeliverablesList';
import { SessionsList } from './SessionsList';
import { PlanningTab } from './PlanningTab';
import { AgentModal } from './AgentModal';
import type { Task, TaskPriority, TaskStatus, TaskType, QCStatus } from '@/lib/types';

type TabType = 'overview' | 'planning' | 'activity' | 'deliverables' | 'sessions' | 'result';

interface TaskModalProps {
  task?: Task;
  onClose: () => void;
  workspaceId?: string;
}

export function TaskModal({ task, onClose, workspaceId }: TaskModalProps) {
  const { agents, addTask, updateTask, addEvent } = useMissionControl();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [usePlanningMode, setUsePlanningMode] = useState(false);
  // Auto-switch to planning tab if task is in planning status
  const [activeTab, setActiveTab] = useState<TabType>(task?.status === 'planning' ? 'planning' : 'overview');

  // Stable callback for when spec is locked - use window.location.reload() to refresh data
  const handleSpecLocked = useCallback(() => {
    window.location.reload();
  }, []);

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'normal' as TaskPriority,
    status: task?.status || 'inbox' as TaskStatus,
    task_type: task?.task_type || '' as TaskType | '',
    qc_status: task?.qc_status || 'pending' as QCStatus,
    tags: task?.tags ? JSON.parse(task.tags).join(', ') : '',
    assigned_agent_id: task?.assigned_agent_id || '',
    due_date: task?.due_date || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = task ? `/api/tasks/${task.id}` : '/api/tasks';
      const method = task ? 'PATCH' : 'POST';

      const payload = {
        ...form,
        // If planning mode is enabled for new tasks, override status to 'planning'
        status: (!task && usePlanningMode) ? 'planning' : form.status,
        assigned_agent_id: form.assigned_agent_id || null,
        due_date: form.due_date || null,
        task_type: form.task_type || null,
        tags: form.tags
          .split(',')
          .map((tag: string) => tag.trim())
          .filter(Boolean),
        workspace_id: workspaceId || task?.workspace_id || 'default',
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedTask = await res.json();

        if (task) {
          updateTask(savedTask);

          // Check if auto-dispatch should be triggered and execute it
          if (shouldTriggerAutoDispatch(task.status, savedTask.status, savedTask.assigned_agent_id)) {
            const result = await triggerAutoDispatch({
              taskId: savedTask.id,
              taskTitle: savedTask.title,
              agentId: savedTask.assigned_agent_id,
              agentName: savedTask.assigned_agent?.name || 'Unknown Agent',
              workspaceId: savedTask.workspace_id
            });

            if (!result.success) {
              console.error('Auto-dispatch failed:', result.error);
            }
          }

          onClose();
        } else {
          addTask(savedTask);
          addEvent({
            id: crypto.randomUUID(),
            type: 'task_created',
            task_id: savedTask.id,
            message: `New task: ${savedTask.title}`,
            created_at: new Date().toISOString(),
          });

          // If planning mode is enabled, auto-generate questions and keep modal open
          if (usePlanningMode) {
            // Trigger question generation in background
            fetch(`/api/tasks/${savedTask.id}/planning`, { method: 'POST' })
              .then((res) => {
                if (res.ok) {
                  // Update our local task reference and switch to planning tab
                  updateTask({ ...savedTask, status: 'planning' });
                  setActiveTab('planning');
                } else {
                  return res.json().then((data) => {
                    console.error('Failed to start planning:', data.error);
                  });
                }
              })
              .catch((error) => {
                console.error('Failed to start planning:', error);
              });
          }
          onClose();
        }
      }
    } catch (error) {
      console.error('Failed to save task:', error);
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
      console.error('Failed to delete task:', error);
    }
  };

  const statuses: TaskStatus[] = ['planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'done'];
  const priorities: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
  const taskTypes: { value: TaskType; label: string }[] = [
    { value: 'bug_fix', label: 'Bug Fix' },
    { value: 'feature', label: 'Feature' },
    { value: 'compliance_batch', label: 'Compliance Batch' },
    { value: 'research', label: 'Research' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'documentation', label: 'Documentation' },
    { value: 'ops', label: 'Ops' },
  ];
  const qcStatuses: { value: QCStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'passed', label: 'Passed' },
    { value: 'failed', label: 'Failed' },
    { value: 'skipped', label: 'Skipped' },
  ];

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: null },
    { id: 'planning' as TabType, label: 'Planning', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'activity' as TabType, label: 'Activity', icon: <Activity className="w-4 h-4" /> },
    { id: 'deliverables' as TabType, label: 'Deliverables', icon: <Package className="w-4 h-4" /> },
    { id: 'sessions' as TabType, label: 'Sessions', icon: <Bot className="w-4 h-4" /> },
    // Only show Result tab if task has a result
    ...(task?.result ? [{ id: 'result' as TabType, label: 'Result', icon: <FileText className="w-4 h-4" /> }] : []),
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold">
            {task ? task.title : 'Create New Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs - only show for existing tasks */}
        {task && (
          <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-gray-900">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <form onSubmit={handleSubmit} className="space-y-4">
          {/* Output Link - Show clickable link to deliverable */}
          {task?.output_url && (
            <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                <h3 className="font-medium text-cyan-700 dark:text-cyan-300">Output</h3>
                <a
                  href={task.output_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-sm text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                >
                  {task.output_url.length > 60 ? task.output_url.slice(0, 60) + '...' : task.output_url}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Result Display - Show prominently if task has a result */}
          {task?.result && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-medium text-emerald-700 dark:text-emerald-300">Agent Output</h3>
                {task.result_captured_at && (
                  <span className="text-xs text-gray-500 ml-auto">
                    Captured {new Date(task.result_captured_at).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded max-h-64 overflow-y-auto">
                {task.result}
              </div>
            </div>
          )}

          {/* Brief Content Display - Show when present */}
          {task?.brief_content && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-medium text-blue-700 dark:text-blue-300">Brief Content</h3>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded max-h-64 overflow-y-auto">
                {task.brief_content}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
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
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Add details..."
            />
          </div>

          {/* Planning Mode Toggle - only for new tasks */}
          {!task && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePlanningMode}
                  onChange={(e) => setUsePlanningMode(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-gray-600"
                />
                <div>
                  <span className="font-medium text-sm flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Enable Planning Mode
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    Best for complex projects that need detailed requirements. 
                    You&apos;ll answer a few questions to define scope, goals, and constraints 
                    before work begins. Skip this for quick, straightforward tasks.
                  </p>
                </div>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PROCESS-V2: Task Type + QC Status */}
          <div className="grid grid-cols-2 gap-4">
            {/* Task Type */}
            <div>
              <label className="block text-sm font-medium mb-1">Task Type</label>
              <select
                value={form.task_type}
                onChange={(e) => setForm({ ...form, task_type: e.target.value as TaskType | '' })}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Not set --</option>
                {taskTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* QC Status */}
            <div>
              <label className="block text-sm font-medium mb-1">QC Status</label>
              <select
                value={form.qc_status}
                onChange={(e) => setForm({ ...form, qc_status: e.target.value as QCStatus })}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {qcStatuses.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-1">Tags</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="comma-separated tags"
            />
          </div>

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
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar_emoji} {agent.name} - {agent.role}
                </option>
              ))}
              <option value="__add_new__" className="text-blue-600">
                ➕ Add new agent...
              </option>
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input
              type="datetime-local"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
            </form>
          )}

          {/* Planning Tab */}
          {activeTab === 'planning' && task && (
            <PlanningTab
              taskId={task.id}
              onSpecLocked={handleSpecLocked}
            />
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && task && (
            <ActivityLog taskId={task.id} />
          )}

          {/* Deliverables Tab */}
          {activeTab === 'deliverables' && task && (
            <DeliverablesList taskId={task.id} />
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && task && (
            <SessionsList taskId={task.id} />
          )}

          {/* Result Tab */}
          {activeTab === 'result' && task && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Agent Output
                </h3>
                {task.result_captured_at && (
                  <span className="text-sm text-gray-500">
                    Captured {new Date(task.result_captured_at).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <pre className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap font-mono">
                  {task.result}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer - only show on overview tab */}
        {activeTab === 'overview' && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-900">
            <div className="flex gap-2">
              {task && (
                <>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-sm"
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
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
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