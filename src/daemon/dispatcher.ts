/**
 * Task Dispatcher — 10s loop
 * Auto-dispatches tasks in 'assigned' status to their agents via OpenClaw.
 */

import { queryAll, queryOne } from '../lib/db';
import { dispatchTaskToAgent } from '../lib/dispatch';
import { log } from './logger';
import { broadcastEvent } from './bridge';
import type { Task, Agent } from '../lib/types';

export async function runDispatcher(): Promise<void> {
  // Find all assigned tasks ordered by priority then creation time
  const priorityOrder = "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END";
  const assignedTasks = queryAll<Task>(
    `SELECT * FROM tasks WHERE status = 'assigned' AND assigned_agent_id IS NOT NULL
     ORDER BY ${priorityOrder}, created_at ASC`
  );

  if (assignedTasks.length === 0) return;

  for (const task of assignedTasks) {
    // Check if agent is already working on an in_progress task
    const busyTask = queryOne<{ id: string }>(
      `SELECT id FROM tasks WHERE assigned_agent_id = ? AND status = 'in_progress'`,
      [task.assigned_agent_id!]
    );

    if (busyTask) {
      log.debug(`Agent ${task.assigned_agent_id} busy with ${busyTask.id}, skipping ${task.id}`);
      continue;
    }

    // Check agent exists and is not offline
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ? AND status != ?',
      [task.assigned_agent_id!, 'offline']
    );

    if (!agent) {
      log.debug(`Agent ${task.assigned_agent_id} offline or missing, skipping task ${task.id}`);
      continue;
    }

    log.info(`Dispatching task "${task.title}" to ${agent.name}`);

    const result = await dispatchTaskToAgent(task.id);

    if (result.success) {
      log.info(`Dispatched ${task.id} to ${agent.name} (session: ${result.sessionId})`);

      // Broadcast updates to UI
      if (result.updatedTask) {
        await broadcastEvent({ type: 'task_updated', payload: result.updatedTask });
      }
      if (result.updatedAgent) {
        await broadcastEvent({ type: 'agent_updated', payload: result.updatedAgent });
      }
    } else {
      log.error(`Failed to dispatch ${task.id}: ${result.error}`);
    }
  }
}
