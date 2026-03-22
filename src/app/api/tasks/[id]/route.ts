import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import { handleStageTransition, handleStageFailure, getTaskWorkflow, drainQueue, populateTaskRolesFromAgents } from '@/lib/workflow-engine';
import { hasStageEvidence, canUseBoardOverride, auditBoardOverride, taskCanBeDone, recordLearnerOnTransition } from '@/lib/task-governance';
import { updateConvoyProgress, checkConvoyCompletion } from '@/lib/convoy';
import { syncGatewayAgentsToCatalog } from '@/lib/agent-catalog-sync';
import { triggerWorkspaceMerge } from '@/lib/workspace-isolation';
import { UpdateTaskSchema } from '@/lib/validation';
import type { Task, UpdateTaskRequest, Agent, TaskDeliverable } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to fetch task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateTaskRequest & { updated_by_agent_id?: string; board_override?: boolean; override_reason?: string } = await request.json();

    // Validate input with Zod
    const validation = UpdateTaskSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const validatedData = validation.data;
    let nextStatus = validatedData.status;

    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Keep OpenClaw agent catalog synced opportunistically on task updates
    await syncGatewayAgentsToCatalog({ reason: 'task_patch' }).catch(err => {
      console.warn('[Task PATCH] agent catalog sync failed:', err);
    });

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();

    // Workflow enforcement for agent-initiated approvals
    // If an agent is trying to move review→done, they must be a master agent
    // User-initiated moves (no agent ID) are allowed
    if (validatedData.status === 'done' && existing.status === 'review' && validatedData.updated_by_agent_id) {
      const updatingAgent = queryOne<Agent>(
        'SELECT is_master FROM agents WHERE id = ?',
        [validatedData.updated_by_agent_id]
      );

      if (!updatingAgent || !updatingAgent.is_master) {
        return NextResponse.json(
          { error: 'Forbidden: only the master agent can approve tasks' },
          { status: 403 }
        );
      }
    }

    if (validatedData.title !== undefined) {
      updates.push('title = ?');
      values.push(validatedData.title);
    }
    if (validatedData.description !== undefined) {
      updates.push('description = ?');
      values.push(validatedData.description);
    }
    if (validatedData.priority !== undefined) {
      updates.push('priority = ?');
      values.push(validatedData.priority);
    }
    if (validatedData.due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(validatedData.due_date);
    }
    if (validatedData.workflow_template_id !== undefined) {
      updates.push('workflow_template_id = ?');
      values.push(validatedData.workflow_template_id);
    }
    if (validatedData.status_reason !== undefined) {
      updates.push('status_reason = ?');
      values.push(validatedData.status_reason);
    }
    if ((validatedData as Record<string, unknown>).pr_url !== undefined) {
      updates.push('pr_url = ?');
      values.push((validatedData as Record<string, unknown>).pr_url);
    }
    if ((validatedData as Record<string, unknown>).pr_status !== undefined) {
      updates.push('pr_status = ?');
      values.push((validatedData as Record<string, unknown>).pr_status);
    }

    // Track if we need to dispatch task
    let shouldDispatch = false;
    let shouldDispatchWorkflowStage = false;

    const effectiveAssignedAgentId =
      validatedData.assigned_agent_id !== undefined
        ? validatedData.assigned_agent_id
        : existing.assigned_agent_id;

    const readinessIssues: string[] = [];
    if (!effectiveAssignedAgentId) readinessIssues.push('No agent assigned');

    // If task came from planning mode, require planning to be complete before auto-start
    const planningComplete = Number((existing as any).planning_complete || 0) === 1;
    if (existing.status === 'planning' && !planningComplete) {
      readinessIssues.push('Planning not complete');
    }

    // Auto-assign default workflow template if task has none
    if (!existing.workflow_template_id && validatedData.assigned_agent_id) {
      const defaultTpl = queryOne<{ id: string }>(
        'SELECT id FROM workflow_templates WHERE workspace_id = ? AND is_default = 1 LIMIT 1',
        [existing.workspace_id]
      );
      if (defaultTpl) {
        updates.push('workflow_template_id = ?');
        values.push(defaultTpl.id);
        // Also populate task_roles now that we have a template
        run('UPDATE tasks SET workflow_template_id = ? WHERE id = ?', [defaultTpl.id, id]);
        populateTaskRolesFromAgents(id, existing.workspace_id);
      }
    }

    // Auto-promote INBOX -> ASSIGNED when an agent is assigned while task is still in inbox.
    // TaskModal always sends status, so handle both undefined and explicit inbox.
    if (
      (nextStatus === undefined || nextStatus === 'inbox') &&
      validatedData.assigned_agent_id !== undefined &&
      validatedData.assigned_agent_id &&
      existing.status === 'inbox'
    ) {
      nextStatus = 'assigned';
    }

    // Handle status change
    if (nextStatus !== undefined && nextStatus !== existing.status) {
      const boardOverrideRequested = Boolean(body.board_override);
      const boardOverrideAllowed = boardOverrideRequested && canUseBoardOverride(request);

      // Hard evidence gate for forward-stage transitions and completion
      const enteringQualityStage = ['testing', 'review', 'verification', 'done'].includes(nextStatus);
      if (enteringQualityStage && !boardOverrideAllowed && !hasStageEvidence(id)) {
        return NextResponse.json(
          { error: 'Evidence gate failed: stage transition requires at least one deliverable and one activity note' },
          { status: 400 }
        );
      }

      // Failure transitions must include status_reason
      const failingBackwards = ['testing', 'review', 'verification'].includes(existing.status) && ['in_progress', 'assigned'].includes(nextStatus);
      if (failingBackwards && !validatedData.status_reason) {
        return NextResponse.json({ error: 'status_reason is required when failing a stage' }, { status: 400 });
      }

      if (nextStatus === 'done' && !boardOverrideAllowed && !taskCanBeDone(id)) {
        return NextResponse.json({ error: 'Cannot mark done: validation/evidence requirements not met' }, { status: 400 });
      }

      updates.push('status = ?');
      values.push(nextStatus);

      if (boardOverrideAllowed) {
        auditBoardOverride(id, existing.status, nextStatus, body.override_reason);
      }

      // Auto-dispatch when moving to assigned (if we have a valid assignee)
      if (nextStatus === 'assigned' && effectiveAssignedAgentId) {
        shouldDispatch = true;
      }

      // When a task completes, reset the assigned agent to standby (if not working on other tasks)
      if (nextStatus === 'done' && existing.assigned_agent_id) {
        const otherActiveTasks = queryOne<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM tasks WHERE assigned_agent_id = ? AND id != ? AND status IN ('assigned', 'in_progress', 'testing', 'verification')`,
          [existing.assigned_agent_id, id]
        );
        if (!otherActiveTasks || otherActiveTasks.cnt === 0) {
          run(
            `UPDATE agents SET status = 'standby', updated_at = datetime('now') WHERE id = ? AND status = 'working'`,
            [existing.assigned_agent_id]
          );
        }
      }

      // Log status change event
      const eventType = nextStatus === 'done' ? 'task_completed' : 'task_status_changed';
      run(
        `INSERT INTO events (id, type, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), eventType, id, `Task "${existing.title}" moved to ${nextStatus}`, now]
      );
    }

    // Handle assignment change
    if (validatedData.assigned_agent_id !== undefined && validatedData.assigned_agent_id !== existing.assigned_agent_id) {
      updates.push('assigned_agent_id = ?');
      values.push(validatedData.assigned_agent_id);

      if (validatedData.assigned_agent_id) {
        const agent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [validatedData.assigned_agent_id]);
        if (agent) {
          run(
            `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_assigned', validatedData.assigned_agent_id, id, `"${existing.title}" assigned to ${agent.name}`, now]
          );

          // Auto-dispatch if already in assigned status or being assigned now
          if (existing.status === 'assigned' || nextStatus === 'assigned') {
            shouldDispatch = true;
          } else if (['testing', 'review', 'verification'].includes(nextStatus || existing.status)) {
            // Agent manually assigned to a task in a workflow stage — dispatch directly
            shouldDispatchWorkflowStage = true;
          }
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    // Persist readiness warning for assigned tasks if validation fails
    if (nextStatus === 'assigned' && readinessIssues.length > 0) {
      updates.push('planning_dispatch_error = ?');
      values.push(`Validation: ${readinessIssues.join(', ')}`);
      shouldDispatch = false;
    } else if (nextStatus === 'assigned') {
      updates.push('planning_dispatch_error = NULL');
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

    // Fetch updated task with all joined fields
    const task = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name,
        ca.avatar_emoji as created_by_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
       WHERE t.id = ?`,
      [id]
    );

    // Broadcast task update via SSE
    if (task) {
      broadcast({
        type: 'task_updated',
        payload: task,
      });
    }

    // Trigger workflow-aware dispatch if needed
    if (shouldDispatch && readinessIssues.length === 0) {
      // Try the workflow engine first — it handles role-based handoffs
      const workflowResult = await handleStageTransition(id, nextStatus || 'assigned', {
        previousStatus: existing.status,
      });

      if (!workflowResult.handedOff) {
        // No workflow template or no role for this stage — fall back to legacy dispatch
        const missionControlUrl = getMissionControlUrl();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.MC_API_TOKEN) {
          headers['Authorization'] = `Bearer ${process.env.MC_API_TOKEN}`;
        }

        try {
          const dispatchRes = await fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
            method: 'POST',
            headers,
            signal: AbortSignal.timeout(30_000),
          });

          if (!dispatchRes.ok) {
            const errorText = await dispatchRes.text();
            const dispatchError = `Auto-dispatch failed (${dispatchRes.status}): ${errorText}`;
            console.error(dispatchError);
            run('UPDATE tasks SET planning_dispatch_error = ?, updated_at = ? WHERE id = ?', [dispatchError, now, id]);
          }
        } catch (err) {
          const dispatchError = `Auto-dispatch error: ${(err as Error).message}`;
          console.error(dispatchError);
          run('UPDATE tasks SET planning_dispatch_error = ?, updated_at = ? WHERE id = ?', [dispatchError, now, id]);
        }
      }
    }

    // Trigger workflow handoff for forward stage transitions (testing, review, verification)
    // This is separate from the shouldDispatch block above which handles 'assigned' status
    const workflowStages = ['testing', 'review', 'verification'];
    if (
      nextStatus &&
      nextStatus !== existing.status &&
      workflowStages.includes(nextStatus) &&
      !shouldDispatch // Don't double-trigger if already handled above
    ) {
      const stageResult = await handleStageTransition(id, nextStatus, {
        previousStatus: existing.status,
      });

      if (stageResult.handedOff) {
        console.log(`[PATCH] Workflow handoff: ${existing.status} → ${nextStatus} → agent ${stageResult.newAgentName}`);
        // Re-fetch task to include updated agent assignment
        const refreshed = queryOne<Task>(
          `SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji
           FROM tasks t LEFT JOIN agents aa ON t.assigned_agent_id = aa.id WHERE t.id = ?`,
          [id]
        );
        if (refreshed) broadcast({ type: 'task_updated', payload: refreshed });
      } else if (!stageResult.success && stageResult.error) {
        console.warn(`[PATCH] Workflow handoff blocked: ${stageResult.error}`);
        // Broadcast so the UI picks up the dispatch error banner
        const refreshed = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
        if (refreshed) broadcast({ type: 'task_updated', payload: refreshed });
      }
    }

    // Agent manually assigned to a task already in a workflow stage — dispatch directly
    if (shouldDispatchWorkflowStage && effectiveAssignedAgentId) {
      const currentStatus = nextStatus || existing.status;
      console.log(`[PATCH] Agent assigned in workflow stage "${currentStatus}" — dispatching`);
      // Clear any previous dispatch error
      run('UPDATE tasks SET planning_dispatch_error = NULL, updated_at = ? WHERE id = ?', [now, id]);

      const missionControlUrl = getMissionControlUrl();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.MC_API_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.MC_API_TOKEN}`;
      }
      try {
        const dispatchRes = await fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(30_000),
        });
        if (!dispatchRes.ok) {
          const errorText = await dispatchRes.text();
          console.error(`[PATCH] Workflow stage dispatch failed: ${errorText}`);
          run('UPDATE tasks SET planning_dispatch_error = ?, updated_at = ? WHERE id = ?', [`Dispatch failed (${dispatchRes.status}): ${errorText}`, now, id]);
        }
      } catch (err) {
        console.error('[PATCH] Workflow stage dispatch error:', err);
        run('UPDATE tasks SET planning_dispatch_error = ?, updated_at = ? WHERE id = ?', [`Dispatch error: ${(err as Error).message}`, now, id]);
      }
      // Re-broadcast with latest state
      const refreshed = queryOne<Task>(
        `SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji
         FROM tasks t LEFT JOIN agents aa ON t.assigned_agent_id = aa.id WHERE t.id = ?`,
        [id]
      );
      if (refreshed) broadcast({ type: 'task_updated', payload: refreshed });
    }

    // Reset agent status to standby when they have no more active tasks
    if (nextStatus && nextStatus !== existing.status) {
      // When a task moves to done, or transitions away from the current agent
      const agentToCheck = existing.assigned_agent_id;
      if (agentToCheck) {
        // Check if this agent still has any active (working) tasks
        const activeTasks = queryOne<{ count: number }>(
          `SELECT COUNT(*) as count FROM tasks
           WHERE assigned_agent_id = ?
             AND status IN ('assigned', 'in_progress', 'testing', 'verification')
             AND id != ?`,
          [agentToCheck, id]
        );
        // Also check if the current task is still actively assigned to this agent
        const currentTaskStillActive = (
          validatedData.assigned_agent_id !== undefined
            ? validatedData.assigned_agent_id === agentToCheck
            : true
        ) && ['assigned', 'in_progress', 'testing', 'verification'].includes(nextStatus);

        if (!currentTaskStillActive && (!activeTasks || activeTasks.count === 0)) {
          run(
            'UPDATE agents SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
            ['standby', now, agentToCheck, 'working']
          );
        }
      }
    }

    // Learner must record every stage transition (non-blocking)
    if (nextStatus && nextStatus !== existing.status) {
      recordLearnerOnTransition(id, existing.status, nextStatus, true).catch(err =>
        console.error('[Learner] notification failed:', err)
      );
    }

    // If this is a sub-task, update convoy progress and check completion
    if (nextStatus && nextStatus !== existing.status && existing.convoy_id) {
      try {
        updateConvoyProgress(existing.convoy_id);
        if (nextStatus === 'done') {
          checkConvoyCompletion(existing.convoy_id);
        }
      } catch (err) {
        console.error('[Convoy] progress update failed:', err);
      }
    }

    // Drain the review queue when a task reaches 'done' (frees the verification slot)
    if (nextStatus === 'done') {
      drainQueue(id, existing.workspace_id).catch(err =>
        console.error('[Workflow] drainQueue after done failed:', err)
      );

      // Trigger workspace merge if task has an isolated workspace
      if (existing.workspace_path) {
        triggerWorkspaceMerge(id).catch(err =>
          console.error('[Workspace] merge after done failed:', err)
        );
      }
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Reset agent status if this was their only active task
    if (existing.assigned_agent_id) {
      const otherActive = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks
         WHERE assigned_agent_id = ?
           AND status IN ('assigned', 'in_progress', 'testing', 'verification')
           AND id != ?`,
        [existing.assigned_agent_id, id]
      );
      if (!otherActive || otherActive.count === 0) {
        run(
          'UPDATE agents SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
          ['standby', new Date().toISOString(), existing.assigned_agent_id, 'working']
        );
      }
    }

    // Delete convoy and its sub-tasks if this is a convoy parent
    const convoy = queryOne<{ id: string }>('SELECT id FROM convoys WHERE parent_task_id = ?', [id]);
    if (convoy) {
      // Delete sub-tasks first (CASCADE handles convoy_subtasks)
      const subtaskIds = queryAll<{ task_id: string }>('SELECT task_id FROM convoy_subtasks WHERE convoy_id = ?', [convoy.id]);
      for (const { task_id } of subtaskIds) {
        run('DELETE FROM work_checkpoints WHERE task_id = ?', [task_id]);
        run('DELETE FROM openclaw_sessions WHERE task_id = ?', [task_id]);
        run('DELETE FROM events WHERE task_id = ?', [task_id]);
        run('DELETE FROM tasks WHERE id = ?', [task_id]);
      }
      run('DELETE FROM agent_mailbox WHERE convoy_id = ?', [convoy.id]);
      run('DELETE FROM convoys WHERE id = ?', [convoy.id]);
    }

    // Delete or nullify related records first (foreign key constraints)
    // Note: task_activities and task_deliverables have ON DELETE CASCADE
    run('DELETE FROM work_checkpoints WHERE task_id = ?', [id]);
    run('DELETE FROM openclaw_sessions WHERE task_id = ?', [id]);
    run('DELETE FROM events WHERE task_id = ?', [id]);
    // Conversations and Knowledge reference tasks - nullify or delete
    run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [id]);
    run('UPDATE knowledge_entries SET task_id = NULL WHERE task_id = ?', [id]);

    // Now delete the task (cascades to task_activities and task_deliverables)
    run('DELETE FROM tasks WHERE id = ?', [id]);

    // Broadcast deletion via SSE
    broadcast({
      type: 'task_deleted',
      payload: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
