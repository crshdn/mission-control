import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, queryAll } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import { autoSubscribeAssigned } from '@/lib/subscriptions';
import type { Task, UpdateTaskRequest, Agent, TaskDeliverable } from '@/lib/types';

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

    // Fetch tags for this task
    const tagRows = queryAll<{ tag: string }>(
      'SELECT tag FROM task_tags WHERE task_id = ? ORDER BY tag',
      [id]
    );
    (task as Task & { tags: string[] }).tags = tagRows.map(t => t.tag);

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
    const body: UpdateTaskRequest & { updated_by_agent_id?: string; rejection_comment?: string } = await request.json();

    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();

    // Status order for detecting backward transitions
    const statusOrder: Record<string, number> = {
      'inbox': 0,
      'assigned': 1,
      'in_progress': 2,
      'review': 3,
      'testing': 4,
      'monitoring': 5,
      'done': 6,
      'planning': -1, // Special case, not in normal flow
    };

    // Rejection comment enforcement: require comment when moving backward
    if (body.status !== undefined && body.status !== existing.status) {
      const fromOrder = statusOrder[existing.status] ?? -1;
      const toOrder = statusOrder[body.status] ?? -1;
      
      // Moving backward requires a rejection comment (except from/to planning)
      if (fromOrder > 0 && toOrder >= 0 && toOrder < fromOrder) {
        if (!body.rejection_comment || body.rejection_comment.trim() === '') {
          return NextResponse.json(
            { 
              error: `Rejection comment required when moving task backward (${existing.status} → ${body.status})`,
              code: 'REJECTION_COMMENT_REQUIRED'
            },
            { status: 400 }
          );
        }
      }
    }

    // Workflow enforcement for agent-initiated approvals
    // If an agent is trying to move review→done, they must be a master agent
    // User-initiated moves (no agent ID) are allowed
    if (body.status === 'done' && existing.status === 'review' && body.updated_by_agent_id) {
      const updatingAgent = queryOne<Agent>(
        'SELECT is_master FROM agents WHERE id = ?',
        [body.updated_by_agent_id]
      );

      if (!updatingAgent || !updatingAgent.is_master) {
        return NextResponse.json(
          { error: 'Forbidden: only master agent (Charlie) can approve tasks' },
          { status: 403 }
        );
      }
    }

    // Status transition enforcement - prevent skipping stages
    // Valid flow: inbox → assigned → in_progress → review → testing → monitoring → done
    // Also allow: planning ↔ any (planning is special)
    if (body.status !== undefined && body.status !== existing.status) {
      const invalidTransitions: Record<string, string[]> = {
        // Cannot skip in_progress when moving from assigned
        'assigned': ['review', 'testing', 'monitoring', 'done'],
        // Cannot skip review when moving from in_progress
        'in_progress': ['testing', 'monitoring', 'done'],
        // Cannot skip testing when moving from review
        'review': ['monitoring', 'done'],
        // Cannot skip monitoring when moving from testing
        'testing': ['done'],
      };

      const blocked = invalidTransitions[existing.status];
      if (blocked && blocked.includes(body.status)) {
        // Allow master agents to bypass in emergencies
        const isMaster = body.updated_by_agent_id 
          ? queryOne<Agent>('SELECT is_master FROM agents WHERE id = ?', [body.updated_by_agent_id])?.is_master
          : false;
        
        if (!isMaster) {
          return NextResponse.json(
            { 
              error: `Invalid transition: ${existing.status} → ${body.status}. ` +
                     `Tasks must follow: inbox → assigned → in_progress → review → testing → monitoring → done`,
              code: 'INVALID_STATUS_TRANSITION'
            },
            { status: 400 }
          );
        }
      }
    }

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.priority !== undefined) {
      updates.push('priority = ?');
      values.push(body.priority);
    }
    if (body.due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(body.due_date);
    }

    // Track if we need to dispatch task
    let shouldDispatch = false;

    // Handle status change
    if (body.status !== undefined && body.status !== existing.status) {
      updates.push('status = ?');
      values.push(body.status);

      // Time tracking: Start when entering in_progress
      if (body.status === 'in_progress' && existing.status !== 'in_progress') {
        const agentId = body.assigned_agent_id || existing.assigned_agent_id;
        if (agentId) {
          // Check if not already tracking for this task+agent
          const activeEntry = queryOne<{ id: string }>(
            'SELECT id FROM time_entries WHERE task_id = ? AND agent_id = ? AND ended_at IS NULL',
            [id, agentId]
          );
          if (!activeEntry) {
            // Create new time entry
            run(
              `INSERT INTO time_entries (id, agent_id, task_id, started_at, created_at) 
               VALUES (?, ?, ?, ?, ?)`,
              [uuidv4(), agentId, id, now, now]
            );
            console.log(`[Time Tracking] Started timer for agent ${agentId} on task ${id}`);
          }
        }
      }

      // Time tracking: Stop when leaving in_progress
      if (existing.status === 'in_progress' && body.status !== 'in_progress') {
        const agentId = existing.assigned_agent_id;
        if (agentId) {
          const activeEntry = queryOne<{ id: string; started_at: string }>(
            'SELECT id, started_at FROM time_entries WHERE task_id = ? AND agent_id = ? AND ended_at IS NULL',
            [id, agentId]
          );
          if (activeEntry) {
            const startedAt = new Date(activeEntry.started_at);
            const durationMs = new Date(now).getTime() - startedAt.getTime();
            const durationMinutes = Math.round(durationMs / 60000); // Convert to minutes
            
            // Generate summary from task title
            const summary = existing.title || 'Task work';
            
            run(
              `UPDATE time_entries SET ended_at = ?, duration_minutes = ?, summary = ? WHERE id = ?`,
              [now, durationMinutes, summary, activeEntry.id]
            );
            console.log(`[Time Tracking] Stopped timer for agent ${agentId} on task ${id} (${durationMinutes} minutes)`);
            
            // Add 'clocked' tag
            run(
              `INSERT OR IGNORE INTO task_tags (id, task_id, tag) VALUES (?, ?, 'clocked')`,
              [uuidv4(), id]
            );
          }
        }
      }

      // Handle reassignment while task is in_progress
      if (body.assigned_agent_id !== undefined && 
          body.assigned_agent_id !== existing.assigned_agent_id &&
          existing.status === 'in_progress') {
        // Close old agent's entry
        const oldAgentId = existing.assigned_agent_id;
        if (oldAgentId) {
          const oldEntry = queryOne<{ id: string; started_at: string }>(
            'SELECT id, started_at FROM time_entries WHERE task_id = ? AND agent_id = ? AND ended_at IS NULL',
            [id, oldAgentId]
          );
          if (oldEntry) {
            const durationMs = new Date(now).getTime() - new Date(oldEntry.started_at).getTime();
            const durationMinutes = Math.round(durationMs / 60000);
            run(
              `UPDATE time_entries SET ended_at = ?, duration_minutes = ?, summary = ? WHERE id = ?`,
              [now, durationMinutes, `Reassigned: ${existing.title}`, oldEntry.id]
            );
            console.log(`[Time Tracking] Closed timer for reassigned agent ${oldAgentId}`);
          }
        }
        
        // Start new agent's entry
        const newAgentId = body.assigned_agent_id;
        if (newAgentId) {
          const existingNewEntry = queryOne<{ id: string }>(
            'SELECT id FROM time_entries WHERE task_id = ? AND agent_id = ? AND ended_at IS NULL',
            [id, newAgentId]
          );
          if (!existingNewEntry) {
            run(
              `INSERT INTO time_entries (id, agent_id, task_id, started_at, created_at) 
               VALUES (?, ?, ?, ?, ?)`,
              [uuidv4(), newAgentId, id, now, now]
            );
            console.log(`[Time Tracking] Started timer for new agent ${newAgentId}`);
          }
        }
      }

      // Monitoring: Set monitoring_started_at when entering monitoring status
      if (body.status === 'monitoring' && existing.status !== 'monitoring') {
        updates.push('monitoring_started_at = ?');
        values.push(now);
      }

      // Auto-assignment based on status transition
      // Only auto-assign if not explicitly provided in request
      if (body.assigned_agent_id === undefined) {
        const AGENT_IDS = {
          MAX: '0d458ebc-caf5-4c0a-83e7-98aa8258dd00',
          SENIOR_DEV: '9b700316-d7e9-405b-85ea-3ceeff67719e',
          QA: '9eca3f3d-1b36-49b7-8208-2dd6b868b6fb',
        };
        
        // Roles that go to Max for review (non-dev work)
        const MAX_REVIEW_ROLES = ['Business Analyst', 'ADHD Coach', 'Deep Research & Market Intel', 'Copywriter & Content'];
        
        let autoAssignTo: string | null = null;
        
        if (body.status === 'review') {
          // Get current assignee's role
          const currentAgent = existing.assigned_agent_id 
            ? queryOne<Agent>('SELECT role FROM agents WHERE id = ?', [existing.assigned_agent_id])
            : null;
          
          if (currentAgent && MAX_REVIEW_ROLES.some(r => currentAgent.role?.includes(r))) {
            // BA/Coach/Researcher/Writer work → Max reviews
            autoAssignTo = AGENT_IDS.MAX;
          } else {
            // Dev work → Senior Dev reviews
            autoAssignTo = AGENT_IDS.SENIOR_DEV;
          }
        } else if (body.status === 'testing') {
          // Testing → QA
          autoAssignTo = AGENT_IDS.QA;
        } else if (body.status === 'done') {
          // Done → Unassign
          autoAssignTo = null;
          updates.push('assigned_agent_id = ?');
          values.push(null);
        }
        // monitoring → keep with QA (no change needed)
        
        if (autoAssignTo !== null && body.status !== 'done') {
          updates.push('assigned_agent_id = ?');
          values.push(autoAssignTo);
          body.assigned_agent_id = autoAssignTo; // For event logging below
        }
      }

      // Auto-dispatch when moving to assigned status (if task has an agent)
      if (body.status === 'assigned' && (existing.assigned_agent_id || body.assigned_agent_id)) {
        shouldDispatch = true;
      }

      // Log status change event
      const eventType = body.status === 'done' ? 'task_completed' : 'task_status_changed';
      run(
        `INSERT INTO events (id, type, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), eventType, id, `Task "${existing.title}" moved to ${body.status}`, now]
      );

      // Log rejection comment as activity if provided (for backward transitions)
      if (body.rejection_comment && body.rejection_comment.trim()) {
        const fromOrder = statusOrder[existing.status] ?? -1;
        const toOrder = statusOrder[body.status] ?? -1;
        
        if (fromOrder > 0 && toOrder >= 0 && toOrder < fromOrder) {
          run(
            `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              id,
              body.updated_by_agent_id || null,
              'comment',
              `⏪ Rejected (${existing.status} → ${body.status}): ${body.rejection_comment.trim()}`,
              JSON.stringify({ rejection: true, from_status: existing.status, to_status: body.status }),
              now
            ]
          );
        }
      }
    }

    // Handle assignment change
    if (body.assigned_agent_id !== undefined && body.assigned_agent_id !== existing.assigned_agent_id) {
      updates.push('assigned_agent_id = ?');
      values.push(body.assigned_agent_id);

      if (body.assigned_agent_id) {
        const agent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [body.assigned_agent_id]);
        if (agent) {
          run(
            `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_assigned', body.assigned_agent_id, id, `"${existing.title}" assigned to ${agent.name}`, now]
          );

          // Auto-dispatch whenever an agent is assigned (any status)
          // This ensures agents get notified immediately when tasks are assigned to them
          shouldDispatch = true;
        }

        // Auto-subscribe the assigned agent to the task thread
        try {
          autoSubscribeAssigned(id, body.assigned_agent_id);
        } catch (e) {
          console.error('[Subscriptions] Auto-subscribe assigned failed:', e);
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
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

    // Trigger auto-dispatch if needed
    if (shouldDispatch) {
      // Call dispatch endpoint asynchronously (don't wait for response)
      const missionControlUrl = getMissionControlUrl();
      fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => {
        console.error('Auto-dispatch failed:', err);
      });
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

    // Delete or nullify related records first (foreign key constraints)
    // Note: task_activities and task_deliverables have ON DELETE CASCADE
    run('DELETE FROM openclaw_sessions WHERE task_id = ?', [id]);
    run('DELETE FROM events WHERE task_id = ?', [id]);
    // Conversations reference tasks - nullify or delete
    run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [id]);

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
