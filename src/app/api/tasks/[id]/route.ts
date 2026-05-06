import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, queryAll } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import { UpdateTaskSchema } from '@/lib/validation';
import { captureResultFromSession } from '@/lib/result-capture';
import { triggerTaskStatusChange } from '@/lib/webhooks';
import { formatDoneOverrideLog, getApprovedCompletionStamp, getDoneTransitionIssues, parseQcFailures } from '@/lib/task-completion';
import { foreignKeyErrorResponse, missingForeignKey } from '@/lib/api/foreign-key-validation';
import type { Task, UpdateTaskRequest, Agent, TaskDeliverable, TaskStatus, QCStatus } from '@/lib/types';

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
    const body: UpdateTaskRequest & { updated_by_agent_id?: string } = await request.json();

    // Validate input with Zod
    const validation = UpdateTaskSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const validatedData = validation.data;

    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const foreignKeyFailure =
      missingForeignKey('assigned_agent_id', validatedData.assigned_agent_id, 'agents') ||
      missingForeignKey('updated_by_agent_id', validatedData.updated_by_agent_id, 'agents');

    if (foreignKeyFailure) {
      return foreignKeyErrorResponse(foreignKeyFailure);
    }
    // Store previous status for webhook trigger
    const previousStatus = existing.status;

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();
    const existingQcFailures = parseQcFailures(existing.qc_failures);
    const hasQcFailuresUpdate = validatedData.qc_failures !== undefined;

    let normalizedQcStatus: QCStatus | undefined = validatedData.qc_status;
    let normalizedQcFailures = validatedData.qc_failures;

    if (hasQcFailuresUpdate && normalizedQcFailures && normalizedQcFailures.length > 0) {
      normalizedQcStatus = 'failed';
    }

    const effectiveQcStatus = normalizedQcStatus ?? existing.qc_status;
    const effectiveQcFailures = normalizedQcFailures ?? existingQcFailures;

    if (effectiveQcStatus && effectiveQcStatus !== 'failed' && effectiveQcFailures.length > 0) {
      normalizedQcFailures = [];
    }

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

    // MANUAL OVERRIDE VALIDATION: If overriding, must provide reason
    if (validatedData.manual_override && !validatedData.override_reason) {
      return NextResponse.json(
        { error: 'Manual override requires override_reason (min 10 characters)' },
        { status: 400 }
      );
    }

    // STATUS GATE 1: in_progress requires active agent session
    // Prevents phantom progress - tasks can't be "in progress" without someone working on them
    if (validatedData.status === 'in_progress' && existing.status !== 'in_progress') {
      const activeSession = queryOne<{ id: string }>(
        'SELECT id FROM openclaw_sessions WHERE task_id = ? AND status = ?',
        [id, 'active']
      );

      if (!activeSession && !validatedData.manual_override) {
        return NextResponse.json(
          {
            error: 'Cannot move to in_progress without active agent session',
            details: 'Use /api/tasks/{id}/dispatch to spawn an agent, or provide manual_override: true with override_reason'
          },
          { status: 400 }
        );
      }

      // Log override if used
      if (!activeSession && validatedData.manual_override) {
        run(
          `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), id, 'status_changed', `[MANUAL OVERRIDE] Moved to in_progress without session. Reason: ${validatedData.override_reason}`, now]
        );
      }
    }

    // STATUS GATE 2: done requires coherent completion metadata + automated verification
    if (validatedData.status === 'done') {
      const deliverableCount = queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM task_deliverables WHERE task_id = ?',
        [id]
      )?.count ?? 0;
      const sessionCount = queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM openclaw_sessions WHERE task_id = ?',
        [id]
      )?.count ?? 0;
      const doneIssues = getDoneTransitionIssues(existing, validatedData, {
        deliverableCount,
        sessionCount
      });

      if (doneIssues.length > 0 && !validatedData.manual_override) {
        return NextResponse.json(
          {
            error: 'Cannot mark done with inconsistent completion metadata',
            details: doneIssues,
            hint: 'Fix the completion data or provide manual_override: true with override_reason for an explicit audit trail'
          },
          { status: 400 }
        );
      }

      // AUTOMATED VERIFICATION: Check that claimed URLs actually work
      // Extract localhost URLs from verification_output and verify they don't 404
      if (!validatedData.manual_override && !validatedData.skip_url_verification) {
        const evidenceText = existing.verification_output || validatedData.verification_output || existing.result || validatedData.result || '';
        
        // Find localhost URLs (MC pages, APIs)
        const urlPattern = /(?:http:\/\/)?localhost:\d+\/[^\s"'<>)}\]]+/gi;
        const urls: string[] = evidenceText.match(urlPattern) || [];
        
        // Also check for route claims like "/bugs", "/projects" that imply localhost:4000
        const routePattern = /(?:verified|working|deployed|live|accessible).*?(\/[a-z][a-z0-9-]*)/gi;
        let routeMatch;
        while ((routeMatch = routePattern.exec(evidenceText)) !== null) {
          const route = routeMatch[1];
          if (route && !route.includes('.') && route.length < 30) {
            urls.push(`http://localhost:4000${route}`);
          }
        }

        // Verify URLs don't return 404
        const failedUrls: string[] = [];
        for (const url of urls) {
          try {
            const fullUrl = url.startsWith('http') ? url : `http://${url}`;
            const response = await fetch(fullUrl, { 
              method: 'HEAD',
              signal: AbortSignal.timeout(5000)
            });
            
            // Check for 404 in response or in body (Next.js returns 200 with 404 title)
            if (response.status === 404) {
              failedUrls.push(url);
            } else if (response.status === 200) {
              // Double-check: fetch body and look for "404" in title (Next.js quirk)
              const bodyResponse = await fetch(fullUrl, { signal: AbortSignal.timeout(5000) });
              const body = await bodyResponse.text();
              if (body.includes('<title>404') || body.includes('This page could not be found')) {
                failedUrls.push(url);
              }
            }
          } catch (e) {
            // Network error - URL doesn't work
            failedUrls.push(`${url} (unreachable)`);
          }
        }

        if (failedUrls.length > 0) {
          return NextResponse.json(
            {
              error: 'Verification failed - claimed URLs do not work',
              details: `The following URLs returned 404 or are unreachable: ${failedUrls.join(', ')}`,
              hint: 'Fix the issues and try again, or use manual_override: true with override_reason if this is a false positive'
            },
            { status: 400 }
          );
        }
      }

      if (validatedData.manual_override) {
        run(
          `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), id, 'status_changed', formatDoneOverrideLog(doneIssues, validatedData.override_reason || 'No reason provided'), now]
        );
      }

      const approvedCompletion = getApprovedCompletionStamp(now, {
        result: validatedData.result ?? existing.result,
        result_captured_at: validatedData.result !== undefined ? now : existing.result_captured_at ?? null
      });

      if (approvedCompletion.result_captured_at && validatedData.result === undefined) {
        updates.push('result_captured_at = ?');
        values.push(approvedCompletion.result_captured_at);
      }

      // Set verified_at timestamp
      updates.push('verified_at = ?');
      values.push(now);
    }

    // VERIFICATION ENFORCEMENT: Agents must provide verification_output when marking for review
    // This prevents phantom deliverables - agents must prove their work before QC
    if (validatedData.status === 'review' && existing.status !== 'review') {
      if (!validatedData.verification_output || validatedData.verification_output.trim().length < 50) {
        return NextResponse.json(
          { 
            error: 'Verification required', 
            details: 'Cannot mark task for review without verification_output. Include: build output, runtime test results, and confirmation that features work. Minimum 50 characters.' 
          },
          { status: 400 }
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
    
    // Handle result field update
    if (validatedData.result !== undefined) {
      updates.push('result = ?');
      values.push(validatedData.result);
      updates.push('result_captured_at = ?');
      values.push(now);
    }

    // Handle verification_output field update
    if (validatedData.verification_output !== undefined) {
      updates.push('verification_output = ?');
      values.push(validatedData.verification_output);
    }

    // Handle output_url field update
    if (validatedData.output_url !== undefined) {
      updates.push('output_url = ?');
      values.push(validatedData.output_url);
    }

    // Handle PROCESS-V2 field updates
    if (validatedData.task_type !== undefined) {
      updates.push('task_type = ?');
      values.push(validatedData.task_type);
    }

    if (normalizedQcStatus !== undefined) {
      updates.push('qc_status = ?');
      values.push(normalizedQcStatus);
    }

    if (validatedData.qc_last_run !== undefined) {
      updates.push('qc_last_run = ?');
      values.push(validatedData.qc_last_run);
    }

    if (normalizedQcFailures !== undefined) {
      updates.push('qc_failures = ?');
      values.push(JSON.stringify(normalizedQcFailures));
    }

    if (validatedData.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(validatedData.tags));
    }

    // Track if we need to dispatch task
    let shouldDispatch = false;

    // Handle status change
    if (validatedData.status !== undefined && validatedData.status !== existing.status) {
      updates.push('status = ?');
      values.push(validatedData.status);

      // Auto-dispatch when moving to assigned
      if (validatedData.status === 'assigned' && existing.assigned_agent_id) {
        shouldDispatch = true;
      }

      // RESULT CAPTURE: When moving to "review", attempt to capture result from session
      // This is a fallback if the agent didn't explicitly log a "completed" activity
      if (validatedData.status === 'review') {
        // Do this asynchronously to not block the response
        captureResultFromSession(id).catch(err => {
          console.error('[TASK PATCH] Failed to capture result from session:', err);
        });
      }

      // Log status change event
      const eventType = validatedData.status === 'done' ? 'task_completed' : 'task_status_changed';
      run(
        `INSERT INTO events (id, type, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), eventType, id, `Task "${existing.title}" moved to ${validatedData.status}`, now]
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
          if (existing.status === 'assigned' || validatedData.status === 'assigned') {
            shouldDispatch = true;
          }
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

      // WEBHOOK TRIGGER: Fire webhook if status changed
      if (validatedData.status !== undefined && validatedData.status !== previousStatus) {
        triggerTaskStatusChange(task, previousStatus as TaskStatus).catch(err => {
          console.error('[WEBHOOK] Failed to trigger webhook for task status change:', err);
        });
      }
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
