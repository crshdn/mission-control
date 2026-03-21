/**
 * Workflow Engine
 *
 * Handles automatic stage transitions, role-based agent handoffs,
 * and fail-loopback logic for multi-agent task workflows.
 */

import { queryOne, queryAll, run } from '@/lib/db';
import { pickDynamicAgent, escalateFailureIfNeeded, recordLearnerOnTransition } from '@/lib/task-governance';
import { getMissionControlUrl } from '@/lib/config';
import { broadcast } from '@/lib/events';
import type { Task, WorkflowTemplate, WorkflowStage, TaskRole } from '@/lib/types';

interface StageTransitionResult {
  success: boolean;
  handedOff: boolean;
  newAgentId?: string;
  newAgentName?: string;
  error?: string;
}

/**
 * Get the workflow template for a task (via task.workflow_template_id or workspace default)
 */
export function getTaskWorkflow(taskId: string): WorkflowTemplate | null {
  const task = queryOne<{ workflow_template_id?: string; workspace_id: string }>(
    'SELECT workflow_template_id, workspace_id FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!task) return null;

  // Try task-specific template first
  if (task.workflow_template_id) {
    const tpl = queryOne<{ id: string; workspace_id: string; name: string; description: string; stages: string; fail_targets: string; is_default: number; created_at: string; updated_at: string }>(
      'SELECT * FROM workflow_templates WHERE id = ?',
      [task.workflow_template_id]
    );
    if (tpl) return parseTemplate(tpl);
  }

  // Fall back to workspace default
  const tpl = queryOne<{ id: string; workspace_id: string; name: string; description: string; stages: string; fail_targets: string; is_default: number; created_at: string; updated_at: string }>(
    'SELECT * FROM workflow_templates WHERE workspace_id = ? AND is_default = 1 LIMIT 1',
    [task.workspace_id]
  );
  if (tpl) return parseTemplate(tpl);

  // Fall back to global default
  const globalTpl = queryOne<{ id: string; workspace_id: string; name: string; description: string; stages: string; fail_targets: string; is_default: number; created_at: string; updated_at: string }>(
    "SELECT * FROM workflow_templates WHERE is_default = 1 ORDER BY created_at ASC LIMIT 1"
  );
  return globalTpl ? parseTemplate(globalTpl) : null;
}

function parseTemplate(row: { id: string; workspace_id: string; name: string; description: string; stages: string; fail_targets: string; is_default: number; created_at: string; updated_at: string }): WorkflowTemplate {
  return {
    ...row,
    stages: JSON.parse(row.stages || '[]') as WorkflowStage[],
    fail_targets: JSON.parse(row.fail_targets || '{}') as Record<string, string>,
    is_default: Boolean(row.is_default),
  };
}

/**
 * Get all role assignments for a task
 */
export function getTaskRoles(taskId: string): TaskRole[] {
  return queryAll<TaskRole>(
    `SELECT tr.*, a.name as agent_name, a.avatar_emoji
     FROM task_roles tr
     LEFT JOIN agents a ON tr.agent_id = a.id
     WHERE tr.task_id = ?`,
    [taskId]
  );
}

/**
 * Find the agent assigned to a specific role on a task
 */
function getAgentForRole(taskId: string, role: string): { id: string; name: string } | null {
  const result = queryOne<{ agent_id: string; agent_name: string }>(
    `SELECT tr.agent_id, a.name as agent_name
     FROM task_roles tr
     JOIN agents a ON tr.agent_id = a.id
     WHERE tr.task_id = ? AND tr.role = ?`,
    [taskId, role]
  );
  return result ? { id: result.agent_id, name: result.agent_name } : null;
}

/**
 * Handle a task stage transition. Called when status changes.
 *
 * This is the core workflow orchestration function:
 * 1. Looks up the workflow template for the task
 * 2. Finds which role owns the new status
 * 3. Assigns the correct agent and dispatches
 * 4. Handles fail-loopback (e.g., testing failure → back to builder)
 */
export async function handleStageTransition(
  taskId: string,
  newStatus: string,
  options?: {
    failReason?: string;
    previousStatus?: string;
    skipDispatch?: boolean;
  }
): Promise<StageTransitionResult> {
  const workflow = getTaskWorkflow(taskId);
  if (!workflow) {
    // No workflow template — fall back to legacy single-agent behavior
    return { success: true, handedOff: false };
  }

  // Find the stage that maps to this status
  const targetStage = workflow.stages.find(s => s.status === newStatus);
  if (!targetStage) {
    // Status not in workflow
    return { success: true, handedOff: false };
  }

  if (!targetStage.role) {
    if (targetStage.status !== 'done') {
      // Queue stage (no role, not done) — park the task here, then try to drain
      console.log(`[Workflow] Task ${taskId} entered queue stage "${targetStage.label}"`);
      const task = queryOne<{ workspace_id: string }>('SELECT workspace_id FROM tasks WHERE id = ?', [taskId]);
      if (task) {
        // Non-blocking drain attempt — picks up immediately if next stage is free
        drainQueue(taskId, task.workspace_id, workflow).catch(err =>
          console.error('[Workflow] drainQueue error:', err)
        );
      }
    }
    return { success: true, handedOff: false };
  }

  // Find the agent assigned to this role (task_roles first, then fall back to assigned_agent_id)
  let roleAgent = getAgentForRole(taskId, targetStage.role);
  if (!roleAgent) {
    // Fall back to the task's directly assigned agent
    const task = queryOne<{ assigned_agent_id: string | null }>(
      'SELECT assigned_agent_id FROM tasks WHERE id = ?',
      [taskId]
    );
    if (task?.assigned_agent_id) {
      const agent = queryOne<{ id: string; name: string }>(
        'SELECT id, name FROM agents WHERE id = ?',
        [task.assigned_agent_id]
      );
      if (agent) {
        console.log(`[Workflow] No task_role for "${targetStage.role}", using assigned agent "${agent.name}"`);
        roleAgent = agent;
      }
    }
  }
  if (!roleAgent) {
    // Dynamic routing fallback (planner+rules) when explicit role assignment is missing
    roleAgent = pickDynamicAgent(taskId, targetStage.role);
  }

  if (!roleAgent) {
    const errorMsg = `No eligible agent found for stage role: ${targetStage.role}.`;
    run(
      'UPDATE tasks SET planning_dispatch_error = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [errorMsg, taskId]
    );
    console.warn(`[Workflow] ${errorMsg} (task ${taskId})`);
    return { success: false, handedOff: false, error: errorMsg };
  }

  // Reset previous agent to standby (if different from new agent and not working on other tasks)
  const previousTask = queryOne<{ assigned_agent_id: string | null }>(
    'SELECT assigned_agent_id FROM tasks WHERE id = ?',
    [taskId]
  );
  if (previousTask?.assigned_agent_id && previousTask.assigned_agent_id !== roleAgent.id) {
    const otherActiveTasks = queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM tasks WHERE assigned_agent_id = ? AND id != ? AND status IN ('assigned', 'in_progress', 'testing', 'verification')`,
      [previousTask.assigned_agent_id, taskId]
    );
    if (!otherActiveTasks || otherActiveTasks.cnt === 0) {
      run(
        `UPDATE agents SET status = 'standby', updated_at = datetime('now') WHERE id = ? AND status = 'working'`,
        [previousTask.assigned_agent_id]
      );
    }
  }

  // Assign agent to task
  const now = new Date().toISOString();
  run(
    'UPDATE tasks SET assigned_agent_id = ?, planning_dispatch_error = NULL, updated_at = ? WHERE id = ?',
    [roleAgent.id, now, taskId]
  );

  // Log the handoff
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, 'status_changed', ?, ?)`,
    [
      crypto.randomUUID(), taskId, roleAgent.id,
      `Stage handoff: ${targetStage.label} → ${roleAgent.name}${options?.failReason ? ` (reason: ${options.failReason})` : ''}`,
      now
    ]
  );

  recordLearnerOnTransition(taskId, options?.previousStatus || newStatus, newStatus, true).catch(err =>
    console.error('[Learner] transition record failed:', err)
  );

  if (options?.skipDispatch) {
    return { success: true, handedOff: true, newAgentId: roleAgent.id, newAgentName: roleAgent.name };
  }

  // Dispatch to the agent
  const missionControlUrl = getMissionControlUrl();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.MC_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.MC_API_TOKEN}`;
    }

    const dispatchRes = await fetch(`${missionControlUrl}/api/tasks/${taskId}/dispatch`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!dispatchRes.ok) {
      const errorText = await dispatchRes.text();
      const error = `Auto-dispatch to ${roleAgent.name} failed (${dispatchRes.status}): ${errorText}`;
      console.error(`[Workflow] ${error}`);
      run('UPDATE tasks SET planning_dispatch_error = ?, updated_at = ? WHERE id = ?', [error, now, taskId]);
      return { success: false, handedOff: true, newAgentId: roleAgent.id, newAgentName: roleAgent.name, error };
    }

    console.log(`[Workflow] Dispatched task ${taskId} to ${roleAgent.name} (role: ${targetStage.role})`);
    return { success: true, handedOff: true, newAgentId: roleAgent.id, newAgentName: roleAgent.name };
  } catch (err) {
    const error = `Dispatch error: ${(err as Error).message}`;
    console.error(`[Workflow] ${error}`);
    run('UPDATE tasks SET planning_dispatch_error = ?, updated_at = ? WHERE id = ?', [error, now, taskId]);
    return { success: false, handedOff: true, newAgentId: roleAgent.id, newAgentName: roleAgent.name, error };
  }
}

/**
 * Handle a stage failure — move task back to the fail target stage.
 * Called when testing/review/verification fails.
 */
export async function handleStageFailure(
  taskId: string,
  currentStatus: string,
  failReason: string
): Promise<StageTransitionResult> {
  const workflow = getTaskWorkflow(taskId);
  if (!workflow) {
    return { success: false, handedOff: false, error: 'No workflow template' };
  }

  const targetStatus = workflow.fail_targets[currentStatus];
  if (!targetStatus) {
    return { success: false, handedOff: false, error: `No fail target defined for status: ${currentStatus}` };
  }

  const now = new Date().toISOString();

  // Log the failure
  run(
    `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
     VALUES (?, ?, 'status_changed', ?, ?)`,
    [crypto.randomUUID(), taskId, `Stage failed: ${currentStatus} → ${targetStatus} (reason: ${failReason})`, now]
  );

  // Update task status to the fail target
  run(
    'UPDATE tasks SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?',
    [targetStatus, `Failed: ${failReason}`, now, taskId]
  );

  // Broadcast update
  const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (updatedTask) {
    broadcast({ type: 'task_updated', payload: updatedTask });
  }

  await recordLearnerOnTransition(taskId, currentStatus, targetStatus, false, failReason);
  await escalateFailureIfNeeded(taskId, currentStatus);

  // Trigger handoff to the agent that owns the fail target stage
  return handleStageTransition(taskId, targetStatus, {
    failReason,
    previousStatus: currentStatus,
  });
}

/**
 * Auto-populate task_roles from planning agents when a workflow template is assigned.
 * Maps agent roles to workflow stage roles using fuzzy matching.
 */
export function populateTaskRolesFromAgents(taskId: string, workspaceId: string): void {
  const workflow = getTaskWorkflow(taskId);
  if (!workflow) return;

  const existingRoles = getTaskRoles(taskId);
  if (existingRoles.length > 0) return; // Already populated

  // Get all agents in the workspace
  const agents = queryAll<{ id: string; name: string; role: string }>(
    "SELECT id, name, role FROM agents WHERE workspace_id = ? AND status != 'offline'",
    [workspaceId]
  );

  // For each stage that requires a role, try to find a matching agent
  const roleMap: Record<string, string> = {};
  for (const stage of workflow.stages) {
    if (!stage.role || roleMap[stage.role]) continue;

    // Try exact match on role name, then fuzzy match
    const match = agents.find(a =>
      a.role.toLowerCase() === stage.role!.toLowerCase() ||
      a.name.toLowerCase().includes(stage.role!.toLowerCase()) ||
      a.role.toLowerCase().includes(stage.role!.toLowerCase())
    );

    if (match) {
      roleMap[stage.role] = match.id;
    }
  }

  // Learner fallback: the 'learner' role isn't in any workflow stage,
  // so it won't be matched above. Find a learner agent and assign it.
  if (!roleMap['learner']) {
    const learner = agents.find(a =>
      a.role.toLowerCase() === 'learner' ||
      a.name.toLowerCase().includes('learner')
    );
    if (learner) {
      roleMap['learner'] = learner.id;
    }
  }

  // Insert role assignments
  for (const [role, agentId] of Object.entries(roleMap)) {
    run(
      `INSERT OR IGNORE INTO task_roles (id, task_id, role, agent_id, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [crypto.randomUUID(), taskId, role, agentId]
    );
  }

  if (Object.keys(roleMap).length > 0) {
    console.log(`[Workflow] Auto-populated ${Object.keys(roleMap).length} role(s) for task ${taskId}`);
  }
}

/**
 * Drain the review queue: advance the oldest queued task to the next stage
 * if that stage is free (no other task currently occupying it).
 *
 * Call this when:
 * - A task enters a queue stage (immediate pickup if next stage is free)
 * - A task moves to 'done' (frees the verification slot)
 * - A task fails from verification/testing (frees the slot)
 */
export async function drainQueue(
  triggeringTaskId: string,
  workspaceId: string,
  workflow?: WorkflowTemplate | null,
): Promise<void> {
  if (!workflow) {
    // Try to resolve from the triggering task
    workflow = getTaskWorkflow(triggeringTaskId);
  }
  if (!workflow) return;

  // Find queue stages (role === null and status !== 'done')
  for (const stage of workflow.stages) {
    if (stage.role !== null || stage.status === 'done') continue;

    const stageIndex = workflow.stages.indexOf(stage);
    const nextStage = workflow.stages[stageIndex + 1];
    if (!nextStage || nextStage.status === 'done') continue;

    // Check if ANY task in this workspace is currently in the next stage
    const occupant = queryOne<{ id: string }>(
      'SELECT id FROM tasks WHERE workspace_id = ? AND status = ? LIMIT 1',
      [workspaceId, nextStage.status]
    );
    if (occupant) {
      console.log(`[Workflow] Next stage "${nextStage.label}" is occupied by task ${occupant.id} — queue holds`);
      continue;
    }

    // Find the oldest task sitting in this queue stage
    const oldest = queryOne<{ id: string }>(
      'SELECT id FROM tasks WHERE workspace_id = ? AND status = ? ORDER BY updated_at ASC LIMIT 1',
      [workspaceId, stage.status]
    );
    if (!oldest) continue;

    console.log(`[Workflow] Draining queue: advancing task ${oldest.id} from "${stage.label}" → "${nextStage.label}"`);

    const now = new Date().toISOString();
    run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [nextStage.status, now, oldest.id]);

    // Broadcast the status change
    const updated = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [oldest.id]);
    if (updated) broadcast({ type: 'task_updated', payload: updated });

    // Trigger stage transition for the next stage (assigns agent + dispatches)
    await handleStageTransition(oldest.id, nextStage.status);
  }
}
