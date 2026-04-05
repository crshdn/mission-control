import { logger } from '@/lib/logger';
/**
 * Orchestration Helper
 * 
 * This module provides helper functions for the master agent (orchestrator) to properly
 * log activities, deliverables, and manage sub-agent sessions when orchestrating tasks.
 * 
 * Usage:
 * - Log activities as sub-agents work
 * - Track deliverables created
 * - Register sub-agent sessions
 * - Verify review completion before approval
 */

import { getMissionControlUrl } from './config';

const MISSION_CONTROL_URL = getMissionControlUrl();

export interface LogActivityParams {
  taskId: string;
  activityType: 'spawned' | 'updated' | 'completed' | 'file_created' | 'status_changed';
  message: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface LogDeliverableParams {
  taskId: string;
  deliverableType: 'file' | 'url' | 'artifact';
  title: string;
  path?: string;
  description?: string;
}

export interface RegisterSubAgentParams {
  taskId: string;
  sessionId: string;
  agentName?: string;
}

/**
 * Log an activity to a task's activity feed
 * This makes activities visible in the Mission Control UI
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const response = await fetch(`${MISSION_CONTROL_URL}/api/tasks/${params.taskId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_type: params.activityType,
        message: params.message,
        agent_id: params.agentId,
        metadata: params.metadata,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Failed to log activity: ${error}`);
    } else {
      logger.info(`✓ Activity logged: ${params.message}`);
    }
  } catch (error) {
    logger.error('Error logging activity:', error);
  }
}

/**
 * Log a deliverable (file, URL, or artifact) to a task
 * This makes deliverables visible in the Deliverables tab
 */
export async function logDeliverable(params: LogDeliverableParams): Promise<void> {
  try {
    const response = await fetch(`${MISSION_CONTROL_URL}/api/tasks/${params.taskId}/deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliverable_type: params.deliverableType,
        title: params.title,
        path: params.path,
        description: params.description,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Failed to log deliverable: ${error}`);
    } else {
      logger.info(`✓ Deliverable logged: ${params.title}`);
    }
  } catch (error) {
    logger.error('Error logging deliverable:', error);
  }
}

/**
 * Register a sub-agent session in Mission Control
 * This makes the session visible in the Sessions tab and updates agent counters
 */
export async function registerSubAgentSession(params: RegisterSubAgentParams): Promise<void> {
  try {
    const response = await fetch(`${MISSION_CONTROL_URL}/api/tasks/${params.taskId}/subagent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openclaw_session_id: params.sessionId,
        agent_name: params.agentName,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Failed to register sub-agent session: ${error}`);
    } else {
      logger.info(`✓ Sub-agent session registered: ${params.sessionId}`);
    }
  } catch (error) {
    logger.error('Error registering sub-agent session:', error);
  }
}

/**
 * Mark a sub-agent session as completed
 * Updates the session status to 'completed' and sets ended_at timestamp
 */
export async function completeSubAgentSession(sessionId: string, summary?: string): Promise<void> {
  try {
    const response = await fetch(`${MISSION_CONTROL_URL}/api/openclaw/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        ended_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Failed to complete sub-agent session: ${error}`);
    } else {
      logger.info(`✓ Sub-agent session completed: ${sessionId}`);
    }
  } catch (error) {
    logger.error('Error completing sub-agent session:', error);
  }
}

/**
 * Get deliverables for a task (for review verification)
 */
export async function getDeliverables(taskId: string): Promise<any[]> {
  try {
    const response = await fetch(`${MISSION_CONTROL_URL}/api/tasks/${taskId}/deliverables`);
    if (!response.ok) {
      throw new Error(`Failed to fetch deliverables: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    logger.error('Error fetching deliverables:', error);
    return [];
  }
}

/**
 * Verify that a task has deliverables before approving it
 * Returns true if task has at least one deliverable, false otherwise
 */
export async function verifyTaskHasDeliverables(taskId: string): Promise<boolean> {
  const deliverables = await getDeliverables(taskId);
  return deliverables.length > 0;
}

/**
 * Complete workflow: Log everything when spawning a sub-agent
 */
export async function onSubAgentSpawned(params: {
  taskId: string;
  sessionId: string;
  agentName: string;
  description?: string;
}): Promise<void> {
  await Promise.all([
    logActivity({
      taskId: params.taskId,
      activityType: 'spawned',
      message: `Sub-agent spawned: ${params.agentName}`,
      metadata: { sessionId: params.sessionId, description: params.description },
    }),
    registerSubAgentSession({
      taskId: params.taskId,
      sessionId: params.sessionId,
      agentName: params.agentName,
    }),
  ]);
}

/**
 * Complete workflow: Log everything when sub-agent completes
 */
export async function onSubAgentCompleted(params: {
  taskId: string;
  sessionId: string;
  agentName: string;
  summary: string;
  deliverables?: Array<{ type: 'file' | 'url' | 'artifact'; title: string; path?: string }>;
}): Promise<void> {
  const promises: Promise<void>[] = [
    logActivity({
      taskId: params.taskId,
      activityType: 'completed',
      message: `${params.agentName} completed: ${params.summary}`,
      metadata: { sessionId: params.sessionId },
    }),
    completeSubAgentSession(params.sessionId, params.summary),
  ];

  // Log all deliverables
  if (params.deliverables) {
    for (const deliverable of params.deliverables) {
      promises.push(
        logDeliverable({
          taskId: params.taskId,
          deliverableType: deliverable.type,
          title: deliverable.title,
          path: deliverable.path,
        })
      );
    }
  }

  await Promise.all(promises);
}

/**
 * Example usage:
 * 
 * ```typescript
 * import * as orchestrator from '@/lib/orchestration';
 * 
 * // When spawning a sub-agent:
 * await orchestrator.onSubAgentSpawned({
 *   taskId: 'task-123',
 *   sessionId: 'agent:main:subagent:abc123',
 *   agentName: 'mission-control-integration-fixes',
 *   description: 'Fix Mission Control real-time updates',
 * });
 * 
 * // During work:
 * await orchestrator.logActivity({
 *   taskId: 'task-123',
 *   activityType: 'updated',
 *   message: 'Fixed SSE broadcast in dispatch endpoint',
 * });
 * 
 * // When complete:
 * await orchestrator.onSubAgentCompleted({
 *   taskId: 'task-123',
 *   sessionId: 'agent:main:subagent:abc123',
 *   agentName: 'mission-control-integration-fixes',
 *   summary: 'All integration issues fixed and tested',
 *   deliverables: [
 *     { type: 'file', title: 'Updated dispatch route', path: 'src/app/api/tasks/[id]/dispatch/route.ts' },
 *     { type: 'file', title: 'Orchestration helper', path: 'src/lib/orchestration.ts' },
 *   ],
 * });
 * 
 * // Before approving (review -> done):
 * const hasDeliverables = await orchestrator.verifyTaskHasDeliverables('task-123');
 * if (!hasDeliverables) {
 *   logger.info('⚠️ Task has no deliverables - cannot approve');
 *   return;
 * }
 * ```
 */
