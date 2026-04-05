'use client';


import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import type { Task } from '@/lib/types';

interface BuildQueueProps {
  productId: string;
}

export function BuildQueue({ productId }: BuildQueueProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Fetch tasks that belong to this product
        const res = await fetch(`/api/products/${productId}/ideas?status=building`);
        if (res.ok) {
          const ideas = await res.json();
          // Get associated tasks
          const taskPromises = ideas
            .filter((i: { task_id?: string }) => i.task_id)
            .map((i: { task_id: string }) => fetch(`/api/tasks/${i.task_id}`).then(r => r.ok ? r.json() : null));
          const tasksData = (await Promise.all(taskPromises)).filter(Boolean);
          setTasks(tasksData);
        }
      } catch (error) {
        logger.error('Failed to load build queue:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [productId]);

  const statusColors: Record<string, string> = {
    planning: 'bg-purple-500/20 text-purple-400',
    inbox: 'bg-mc-bg-tertiary text-mc-text-secondary',
    assigned: 'bg-blue-500/20 text-blue-400',
    in_progress: 'bg-cyan-500/20 text-cyan-400',
    testing: 'bg-yellow-500/20 text-yellow-400',
    review: 'bg-orange-500/20 text-orange-400',
    done: 'bg-green-500/20 text-green-400',
  };

  const prStatusColors: Record<string, string> = {
    pending: 'bg-gray-500/20 text-gray-400',
    open: 'bg-blue-500/20 text-blue-400',
    merged: 'bg-green-500/20 text-green-400',
    closed: 'bg-red-500/20 text-red-400',
  };

  const prStatusLabels: Record<string, string> = {
    pending: 'PR Pending',
    open: '\u{1F504} PR Open',
    merged: '\u2705 Merged',
    closed: 'PR Closed',
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-mc-text">Build Queue</h3>
      {loading ? (
        <div className="text-mc-text-secondary animate-pulse">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-mc-text-secondary">No tasks in build queue. Approve some ideas first!</div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <h4 className="font-medium text-mc-text text-sm">{task.title}</h4>
                <span className="text-xs text-mc-text-secondary">{task.priority} priority</span>
              </div>
              <div className="flex items-center gap-2">
                {task.pr_status && (
                  <span className={`text-xs px-2 py-1 rounded font-medium ${prStatusColors[task.pr_status] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                    {prStatusLabels[task.pr_status] || task.pr_status}
                  </span>
                )}
                <span className={`text-xs px-2 py-1 rounded font-medium ${statusColors[task.status] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
