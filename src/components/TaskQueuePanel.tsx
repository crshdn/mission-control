'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Task, TaskStatus } from '@/lib/types';

interface TaskQueuePanelProps {
  tasks: Task[];
  onClose: () => void;
  onSelectTask: (task: Task) => void;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-mc-accent-red',
  high: 'bg-orange-400',
  normal: 'bg-mc-accent-cyan',
  low: 'bg-mc-text-secondary',
};

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'bg-mc-accent/20 text-mc-accent',
  testing: 'bg-mc-accent-cyan/20 text-mc-accent-cyan',
  assigned: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
  inbox: 'bg-mc-accent-pink/20 text-mc-accent-pink',
  planning: 'bg-mc-accent-purple/20 text-mc-accent-purple',
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'IN PROGRESS',
  testing: 'TESTING',
  assigned: 'ASSIGNED',
  inbox: 'INBOX',
  planning: 'PLANNING',
};

const GROUP_ORDER: TaskStatus[] = ['in_progress', 'testing', 'assigned', 'inbox', 'planning'];

export function TaskQueuePanel({ tasks, onClose, onSelectTask }: TaskQueuePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay listener to avoid closing on the same click that opened the panel
    const id = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Group tasks by status
  const grouped = GROUP_ORDER.reduce<Record<string, Task[]>>((acc, status) => {
    const matching = tasks.filter((t) => t.status === status);
    if (matching.length > 0) acc[status] = matching;
    return acc;
  }, {});

  return (
    <div
      ref={panelRef}
      className="absolute top-full mt-2 right-0 w-96 bg-mc-bg-secondary border border-mc-border rounded-lg shadow-lg z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-mc-border">
        <span className="text-sm font-semibold uppercase tracking-wider">
          Tasks in Queue ({tasks.length})
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Task list */}
      <div className="max-h-[70vh] overflow-y-auto p-2">
        {Object.keys(grouped).length === 0 ? (
          <div className="py-8 text-center text-mc-text-secondary text-sm">
            No tasks in queue
          </div>
        ) : (
          Object.entries(grouped).map(([status, statusTasks]) => (
            <div key={status} className="mb-3 last:mb-0">
              {/* Status group header */}
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    STATUS_BADGE[status] || ''
                  }`}
                >
                  {STATUS_LABEL[status] || status.toUpperCase()}
                </span>
                <span className="text-xs text-mc-text-secondary">({statusTasks.length})</span>
              </div>

              {/* Task rows */}
              <div className="space-y-0.5">
                {statusTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded hover:bg-mc-bg-tertiary transition-colors text-left group"
                  >
                    {/* Priority dot */}
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        PRIORITY_DOT[task.priority] || PRIORITY_DOT.normal
                      }`}
                    />

                    {/* Title */}
                    <span className="text-sm truncate flex-1 text-mc-text group-hover:text-mc-accent-cyan transition-colors">
                      {task.title}
                    </span>

                    {/* Agent name */}
                    {task.assigned_agent && (
                      <span className="text-[11px] text-mc-text-secondary truncate max-w-[80px] flex-shrink-0">
                        {task.assigned_agent.avatar_emoji} {task.assigned_agent.name}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
