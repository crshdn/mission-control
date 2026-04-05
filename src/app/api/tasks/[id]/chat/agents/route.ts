import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';
import type { Agent, Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ChatAgent {
  id: string;
  name: string;
  avatar_emoji: string;
  role: string;
  status: string;
  is_assigned: boolean;
  is_convoy_member: boolean;
}

// GET /api/tasks/[id]/chat/agents — Get agents available for @mention in chat
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: taskId } = await params;

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const agents: ChatAgent[] = [];
    const seenIds = new Set<string>();

    // 1. The assigned agent (primary)
    if (task.assigned_agent_id) {
      const assigned = queryOne<Agent>(
        'SELECT * FROM agents WHERE id = ?',
        [task.assigned_agent_id]
      );
      if (assigned) {
        agents.push({
          id: assigned.id,
          name: assigned.name,
          avatar_emoji: assigned.avatar_emoji,
          role: assigned.role,
          status: assigned.status,
          is_assigned: true,
          is_convoy_member: false,
        });
        seenIds.add(assigned.id);
      }
    }

    // 2. Convoy subtask agents (if convoy mode)
    if (task.convoy_id || task.status === 'convoy_active') {
      const convoyId = task.convoy_id || task.id;
      const subtaskAgents = queryAll<Agent & { is_subtask_agent: boolean }>(
        `SELECT DISTINCT a.* FROM agents a
         JOIN tasks t ON t.assigned_agent_id = a.id
         JOIN convoy_subtasks cs ON cs.task_id = t.id
         JOIN convoys c ON cs.convoy_id = c.id
         WHERE c.parent_task_id = ? OR c.id = ?`,
        [taskId, convoyId]
      );
      for (const agent of subtaskAgents) {
        if (!seenIds.has(agent.id)) {
          agents.push({
            id: agent.id,
            name: agent.name,
            avatar_emoji: agent.avatar_emoji,
            role: agent.role,
            status: agent.status,
            is_assigned: false,
            is_convoy_member: true,
          });
          seenIds.add(agent.id);
        }
      }
    }

    // 3. Task role agents
    const roleAgents = queryAll<Agent>(
      `SELECT DISTINCT a.* FROM agents a
       JOIN task_roles tr ON tr.agent_id = a.id
       WHERE tr.task_id = ?`,
      [taskId]
    );
    for (const agent of roleAgents) {
      if (!seenIds.has(agent.id)) {
        agents.push({
          id: agent.id,
          name: agent.name,
          avatar_emoji: agent.avatar_emoji,
          role: agent.role,
          status: agent.status,
          is_assigned: false,
          is_convoy_member: false,
        });
        seenIds.add(agent.id);
      }
    }

    // 4. All workspace agents as fallback
    const workspaceAgents = queryAll<Agent>(
      'SELECT * FROM agents WHERE workspace_id = ? ORDER BY name',
      [task.workspace_id || 'default']
    );
    for (const agent of workspaceAgents) {
      if (!seenIds.has(agent.id)) {
        agents.push({
          id: agent.id,
          name: agent.name,
          avatar_emoji: agent.avatar_emoji,
          role: agent.role,
          status: agent.status,
          is_assigned: false,
          is_convoy_member: false,
        });
        seenIds.add(agent.id);
      }
    }

    return NextResponse.json(agents);
  } catch (error) {
    logger.error('Failed to fetch chat agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}
