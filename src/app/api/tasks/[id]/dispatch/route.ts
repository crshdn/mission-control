import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import { getRelevantKnowledge, formatKnowledgeForDispatch } from '@/lib/learner';
import { getTaskWorkflow } from '@/lib/workflow-engine';
import { syncGatewayAgentsToCatalog } from '@/lib/agent-catalog-sync';
import { pickDynamicAgent } from '@/lib/task-governance';
import { buildCheckpointContext } from '@/lib/checkpoint';
import { formatMailForDispatch } from '@/lib/mailbox';
import { getPendingNotesForDispatch } from '@/lib/task-notes';
import { createTaskWorkspace, determineIsolationStrategy } from '@/lib/workspace-isolation';
import type { Task, Agent, Product, OpenClawSession, WorkflowStage, TaskImage } from '@/lib/types';

export const dynamic = 'force-dynamic';
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/dispatch
 * 
 * Dispatches a task to its assigned agent's OpenClaw session.
 * Creates session if needed, sends task details to agent.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Keep canonical agent catalog synced before every dispatch (best-effort)
    await syncGatewayAgentsToCatalog({ reason: 'dispatch' }).catch(err => {
      console.warn('[Dispatch] agent catalog sync failed:', err);
    });

    // Get task with agent info
    const task = queryOne<Task & { assigned_agent_name?: string; workspace_id: string }>(
      `SELECT t.*, a.name as assigned_agent_name, a.is_master
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    let assignedAgentId = task.assigned_agent_id;
    if (!assignedAgentId) {
      const statusRoleMap: Record<string, string> = {
        assigned: 'builder',
        in_progress: 'builder',
        testing: 'tester',
        review: 'reviewer',
        verification: 'reviewer',
      };
      const dynamicAgent = pickDynamicAgent(id, statusRoleMap[task.status] || 'builder');
      if (dynamicAgent) {
        assignedAgentId = dynamicAgent.id;
        run('UPDATE tasks SET assigned_agent_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [assignedAgentId, id]);
      }
    }

    if (!assignedAgentId) {
      return NextResponse.json(
        { error: 'Task has no routable agent' },
        { status: 400 }
      );
    }

    // Get agent details
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [assignedAgentId]
    );

    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    // Check if dispatching to the master agent while there are other orchestrators available
    if (agent.is_master) {
      // Check for other master agents in the same workspace (excluding this one)
      const otherOrchestrators = queryAll<{
        id: string;
        name: string;
        role: string;
      }>(
        `SELECT id, name, role
         FROM agents
         WHERE is_master = 1
         AND id != ?
         AND workspace_id = ?
         AND status != 'offline'`,
        [agent.id, task.workspace_id]
      );

      if (otherOrchestrators.length > 0) {
        return NextResponse.json({
          success: false,
          warning: 'Other orchestrators available',
          message: `There ${otherOrchestrators.length === 1 ? 'is' : 'are'} ${otherOrchestrators.length} other orchestrator${otherOrchestrators.length === 1 ? '' : 's'} available in this workspace: ${otherOrchestrators.map(o => o.name).join(', ')}. Consider assigning this task to them instead.`,
          otherOrchestrators,
        }, { status: 409 }); // 409 Conflict - indicating there's an alternative
      }
    }

    // Connect to OpenClaw Gateway
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (err) {
        console.error('Failed to connect to OpenClaw Gateway:', err);
        client.forceReconnect();
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Get or create OpenClaw session for this agent
    let session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [agent.id, 'active']
    );

    const now = new Date().toISOString();

    if (!session) {
      // Create session record
      const sessionId = uuidv4();
      const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
      
      run(
        `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, agent.id, openclawSessionId, 'mission-control', 'active', now, now]
      );

      session = queryOne<OpenClawSession>(
        'SELECT * FROM openclaw_sessions WHERE id = ?',
        [sessionId]
      );

      // Log session creation
      run(
        `INSERT INTO events (id, type, agent_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), 'agent_status_changed', agent.id, `${agent.name} session created`, now]
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create agent session' },
        { status: 500 }
      );
    }

    // Cost cap warning check
    let costCapWarning: string | undefined;
    if (task.product_id) {
      const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [task.product_id]);
      if (product?.cost_cap_monthly) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthlySpend = queryOne<{ total: number }>(
          `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events
           WHERE product_id = ? AND created_at >= ?`,
          [task.product_id, monthStart.toISOString()]
        );
        if (monthlySpend && monthlySpend.total >= product.cost_cap_monthly) {
          costCapWarning = `Monthly cost cap reached: $${monthlySpend.total.toFixed(2)}/$${product.cost_cap_monthly.toFixed(2)}`;
          console.warn(`[Dispatch] ${costCapWarning} for product ${product.name}`);
        }
      }
    }

    // Build task message for agent
    const priorityEmoji = {
      low: '🔵',
      normal: '⚪',
      high: '🟡',
      urgent: '🔴'
    }[task.priority] || '⚪';

    // Get project path for deliverables — with workspace isolation if needed
    const projectsPath = getProjectsPath();
    const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let taskProjectDir = `${projectsPath}/${projectDir}`;
    const missionControlUrl = getMissionControlUrl();

    // Create isolated workspace if parallel builds are possible
    // Only for builder dispatches (assigned/in_progress), not tester/reviewer
    let workspaceIsolated = false;
    let workspaceBranchName: string | undefined;
    let workspacePort: number | undefined;
    const isolationStrategy = determineIsolationStrategy(task as Task);
    const isBuilderDispatch = task.status === 'assigned' || task.status === 'in_progress' || task.status === 'inbox';
    if (isolationStrategy && isBuilderDispatch) {
      try {
        const workspace = await createTaskWorkspace(task as Task);
        taskProjectDir = workspace.path;
        workspaceIsolated = true;
        workspaceBranchName = workspace.branch;
        workspacePort = workspace.port;
        console.log(`[Dispatch] Created ${workspace.strategy} workspace for task ${task.id}: ${workspace.path}`);
      } catch (err) {
        console.warn(`[Dispatch] Workspace isolation failed, using default path:`, (err as Error).message);
      }
    }

    // Parse planning_spec and planning_agents if present (stored as JSON text on the task row)
    const rawTask = task as Task & { assigned_agent_name?: string; workspace_id: string; planning_spec?: string; planning_agents?: string };
    let planningSpecSection = '';
    let agentInstructionsSection = '';

    if (rawTask.planning_spec) {
      try {
        const spec = JSON.parse(rawTask.planning_spec);
        // planning_spec may be an object with spec_markdown, or a raw string
        const specText = typeof spec === 'string' ? spec : (spec.spec_markdown || JSON.stringify(spec, null, 2));
        planningSpecSection = `\n---\n**📋 PLANNING SPECIFICATION:**\n${specText}\n`;
      } catch {
        // If not valid JSON, treat as plain text
        planningSpecSection = `\n---\n**📋 PLANNING SPECIFICATION:**\n${rawTask.planning_spec}\n`;
      }
    }

    if (rawTask.planning_agents) {
      try {
        const agents = JSON.parse(rawTask.planning_agents);
        if (Array.isArray(agents)) {
          // Find instructions for this specific agent, or include all if none match
          const myInstructions = agents.find(
            (a: { agent_id?: string; name?: string; instructions?: string }) =>
              a.agent_id === agent.id || a.name === agent.name
          );
          if (myInstructions?.instructions) {
            agentInstructionsSection = `\n**🎯 YOUR INSTRUCTIONS:**\n${myInstructions.instructions}\n`;
          } else {
            // Include all agent instructions for context
            const allInstructions = agents
              .filter((a: { instructions?: string }) => a.instructions)
              .map((a: { name?: string; role?: string; instructions?: string }) =>
                `- **${a.name || a.role || 'Agent'}:** ${a.instructions}`
              )
              .join('\n');
            if (allInstructions) {
              agentInstructionsSection = `\n**🎯 AGENT INSTRUCTIONS:**\n${allInstructions}\n`;
            }
          }
        }
      } catch {
        // Ignore malformed planning_agents JSON
      }
    }

    // Inject relevant knowledge from the learner knowledge base
    let knowledgeSection = '';
    try {
      const knowledge = getRelevantKnowledge(task.workspace_id, task.title);
      knowledgeSection = formatKnowledgeForDispatch(knowledge);
    } catch {
      // Knowledge injection is best-effort
    }

    // Determine role-specific instructions based on workflow template
    const workflow = getTaskWorkflow(id);
    let currentStage: WorkflowStage | undefined;
    let nextStage: WorkflowStage | undefined;
    if (workflow) {
      let stageIndex = workflow.stages.findIndex(s => s.status === task.status);
      // 'assigned' isn't a workflow stage — resolve to the 'build' stage (in_progress)
      if (stageIndex < 0 && (task.status === 'assigned' || task.status === 'inbox')) {
        stageIndex = workflow.stages.findIndex(s => s.role === 'builder');
      }
      if (stageIndex >= 0) {
        currentStage = workflow.stages[stageIndex];
        nextStage = workflow.stages[stageIndex + 1];
      }
    }

    const isBuilder = !currentStage || currentStage.role === 'builder' || task.status === 'assigned';
    const isTester = currentStage?.role === 'tester';
    const isVerifier = currentStage?.role === 'verifier' || currentStage?.role === 'reviewer';
    const nextStatus = nextStage?.status || 'review';
    const failEndpoint = `POST ${missionControlUrl}/api/tasks/${task.id}/fail`;

    let completionInstructions: string;
    if (isBuilder) {
      completionInstructions = `**IMPORTANT:** After completing work, you MUST call these APIs:
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Description of what was done"}
2. Register deliverable: POST ${missionControlUrl}/api/tasks/${task.id}/deliverables
   Body: {"deliverable_type": "file", "title": "File name", "path": "${taskProjectDir}/filename.html"}
3. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}

When complete, reply with:
\`TASK_COMPLETE: [brief summary of what you did]\``;
    } else if (isTester) {
      completionInstructions = `**YOUR ROLE: TESTER** — Test the deliverables for this task.

Review the output directory for deliverables and run any applicable tests.

**If tests PASS:**
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Tests passed: [summary]"}
2. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}

**If tests FAIL:**
1. ${failEndpoint}
   Body: {"reason": "Detailed description of what failed and what needs fixing"}

Reply with: \`TEST_PASS: [summary]\` or \`TEST_FAIL: [what failed]\``;
    } else if (isVerifier) {
      completionInstructions = `**YOUR ROLE: VERIFIER** — Verify that all work meets quality standards.

Review deliverables, test results, and task requirements.

**If verification PASSES:**
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Verification passed: [summary]"}
2. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}

**If verification FAILS:**
1. ${failEndpoint}
   Body: {"reason": "Detailed description of what failed and what needs fixing"}

Reply with: \`VERIFY_PASS: [summary]\` or \`VERIFY_FAIL: [what failed]\``;
    } else {
      // Fallback for unknown roles
      completionInstructions = `**IMPORTANT:** After completing work:
1. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}`;
    }

    // Build image references section
    let imagesSection = '';
    if (task.images) {
      try {
        const images: TaskImage[] = JSON.parse(task.images);
        if (images.length > 0) {
          const imageList = images
            .map(img => `- ${img.original_name}: ${missionControlUrl}/api/task-images/${task.id}/${img.filename}`)
            .join('\n');
          imagesSection = `\n**Reference Images:**\n${imageList}\n`;
        }
      } catch {
        // Ignore malformed images JSON
      }
    }

    // Build repo/PR section for builder agents when task has a repo
    let repoSection = '';
    if ((task as Task & { repo_url?: string }).repo_url && isBuilder) {
      const repoUrl = (task as Task & { repo_url?: string }).repo_url!;
      const repoBranch = (task as Task & { repo_branch?: string }).repo_branch || 'main';
      const branchName = `autopilot/${task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;

      repoSection = `
---
**\u{1F517} REPOSITORY:**
- **Repo:** ${repoUrl}
- **Base branch:** ${repoBranch}
- **Feature branch:** ${branchName}

**GIT WORKFLOW:**
1. First, verify you have git access: run \`git ls-remote ${repoUrl}\`
   - If this fails, report the error immediately via:
     PATCH ${missionControlUrl}/api/tasks/${task.id}
     Body: {"status_reason": "Git auth not configured: [error message]"}
     Then STOP — do not proceed without repo access.
2. Clone the repo (or use existing local copy)
3. Create branch \`${branchName}\` from \`${repoBranch}\`
4. Implement the feature
5. Commit with clear messages (reference task: ${task.id})
6. Push branch and create a Pull Request

**PR REQUIREMENTS:**
- Title: "\u{1F916} Autopilot: ${task.title}"
- Body must include:
  - What was built and why
  - Research backing (from the idea)
  - Technical approach taken
  - Any risks or trade-offs
  - Task ID: ${task.id}
- Target branch: ${repoBranch}
- After creating PR, report the PR URL:
  PATCH ${missionControlUrl}/api/tasks/${task.id}
  Body: {"pr_url": "<github PR url>", "pr_status": "open"}
`;
    }

    const roleLabel = currentStage?.label || 'Task';
    const taskMessage = `${priorityEmoji} **${isBuilder ? 'NEW TASK ASSIGNED' : `${roleLabel.toUpperCase()} STAGE — ${task.title}`}**

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}
**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}
**Task ID:** ${task.id}
${planningSpecSection}${agentInstructionsSection}${knowledgeSection}${imagesSection}${buildCheckpointContext(task.id) || ''}${formatMailForDispatch(agent.id) || ''}${repoSection}
${isBuilder ? (workspaceIsolated
  ? `**\u{1F512} ISOLATED WORKSPACE:** ${taskProjectDir}\n- **Port:** ${workspacePort || 'default'} (use this for dev server, NOT the default)\n${workspaceBranchName ? `- **Branch:** ${workspaceBranchName}\n` : ''}- **IMPORTANT:** Do NOT modify files outside this workspace directory. Other agents may be working on the same project in parallel. All your work must stay within: ${taskProjectDir}\nCreate this directory if needed and save all deliverables there.\n`
  : `**OUTPUT DIRECTORY:** ${taskProjectDir}\nCreate this directory and save all deliverables there.\n`)
: `**OUTPUT DIRECTORY:** ${taskProjectDir}\n`}
${completionInstructions}

If you need help or clarification, ask the orchestrator.`;

    // Inject any pending operator notes (queued via /btw chat)
    const { formatted: pendingNotes } = getPendingNotesForDispatch(id);
    const finalMessage = pendingNotes ? taskMessage + pendingNotes : taskMessage;

    // Send message to agent's session using chat.send
    try {
      // Use sessionKey for routing to the agent's session
      // Format: {prefix}{openclaw_session_id} where prefix defaults to 'agent:main:'
      const prefix = agent.session_key_prefix || 'agent:main:';
      const sessionKey = `${prefix}${session.openclaw_session_id}`;
      await client.call('chat.send', {
        sessionKey,
        message: finalMessage,
        idempotencyKey: `dispatch-${task.id}-${Date.now()}`
      });

      // Only move to in_progress for builder dispatch (task is in 'assigned' status)
      // For tester/reviewer/verifier, the task status is already correct
      if (task.status === 'assigned') {
        run(
          'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
          ['in_progress', now, id]
        );
      }

      // Broadcast task update
      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }

      // Update agent status to working
      run(
        'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
        ['working', now, agent.id]
      );

      // Log dispatch event to events table
      const eventId = uuidv4();
      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, 'task_dispatched', agent.id, task.id, `Task "${task.title}" dispatched to ${agent.name}`, now]
      );

      // Log dispatch activity to task_activities table (for Activity tab)
      const activityId = crypto.randomUUID();
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [activityId, task.id, agent.id, 'status_changed', `Task dispatched to ${agent.name} - Agent is now working on this task`, now]
      );

      return NextResponse.json({
        success: true,
        task_id: task.id,
        agent_id: agent.id,
        session_id: session.openclaw_session_id,
        message: 'Task dispatched to agent',
        ...(costCapWarning ? { cost_cap_warning: costCapWarning } : {}),
      });
    } catch (err) {
      console.error('Failed to send message to agent:', err);
      // Force-reconnect so the next dispatch attempt gets a fresh WebSocket
      const client2 = getOpenClawClient();
      client2.forceReconnect();
      // Reset task to 'assigned' so dispatch can be retried
      run(
        `UPDATE tasks SET status = 'assigned', planning_dispatch_error = ?, updated_at = datetime('now') WHERE id = ? AND status != 'done'`,
        [`Dispatch delivery failed: ${(err as Error).message}`, id]
      );
      const failedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (failedTask) {
        broadcast({ type: 'task_updated', payload: failedTask });
      }
      return NextResponse.json(
        { error: `Failed to deliver task to agent: ${(err as Error).message}` },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
