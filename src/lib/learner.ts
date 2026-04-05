import { logger } from '@/lib/logger';
/**
 * Learner Module
 *
 * Captures lessons learned from stage transitions and injects
 * relevant knowledge into agent dispatch messages.
 */

import { queryOne, queryAll, run } from '@/lib/db';
import { getMissionControlUrl } from '@/lib/config';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { buildOpenClawSessionKey, getDefaultOpenClawSessionId } from '@/lib/openclaw/session-routing';
import type { KnowledgeEntry, TaskRole, OpenClawSession } from '@/lib/types';

/**
 * Notify the Learner agent about a stage transition.
 * The learner captures what happened and writes to the knowledge base.
 */
export async function notifyLearner(
  taskId: string,
  event: {
    previousStatus: string;
    newStatus: string;
    passed: boolean;
    failReason?: string;
    context?: string;
  }
): Promise<void> {
  // Find learner role assignment for this task
  const learnerRole = queryOne<TaskRole & { agent_name: string; session_key_prefix?: string }>(
    `SELECT tr.*, a.name as agent_name, a.session_key_prefix
     FROM task_roles tr
     JOIN agents a ON tr.agent_id = a.id
     WHERE tr.task_id = ? AND tr.role = 'learner'`,
    [taskId]
  );

  if (!learnerRole) return; // No learner assigned, skip

  const task = queryOne<{ title: string; workspace_id: string }>(
    'SELECT title, workspace_id FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!task) return;

  // Find or create a session for the learner
  let session = queryOne<OpenClawSession>(
    'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
    [learnerRole.agent_id, 'active']
  );

  const missionControlUrl = getMissionControlUrl();

  const learningMessage = `📚 **STAGE TRANSITION — LEARNING CAPTURE**

**Task:** ${task.title} (${taskId})
**Transition:** ${event.previousStatus} → ${event.newStatus}
**Result:** ${event.passed ? 'PASSED ✅' : 'FAILED ❌'}
${event.failReason ? `**Failure Reason:** ${event.failReason}` : ''}
${event.context ? `**Context:** ${event.context}` : ''}

**Your job:** Analyze this transition and capture any lessons learned.
When done, call this API to save your findings:

POST ${missionControlUrl}/api/workspaces/${task.workspace_id}/knowledge
Body: {
  "task_id": "${taskId}",
  "category": "failure" | "fix" | "pattern" | "checklist",
  "title": "Brief lesson title",
  "content": "Detailed description of what was learned",
  "tags": ["relevant", "tags"],
  "confidence": 0.8
}

Focus on:
- What went wrong (if failed)
- What pattern caused the issue
- How to prevent it in the future
- Any checklist items that should be added`;

  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    if (!session) {
      // Create session for learner if needed
      const { v4: uuidv4 } = await import('uuid');
      const sessionId = uuidv4();
      const openclawSessionId = getDefaultOpenClawSessionId({
        name: learnerRole.agent_name,
        session_key_prefix: learnerRole.session_key_prefix,
      });

      run(
        `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [sessionId, learnerRole.agent_id, openclawSessionId, 'mission-control', 'active']
      );

      session = queryOne<OpenClawSession>('SELECT * FROM openclaw_sessions WHERE id = ?', [sessionId]);
    }

    if (session) {
      const sessionKey = buildOpenClawSessionKey(
        {
          name: learnerRole.agent_name,
          session_key_prefix: learnerRole.session_key_prefix,
        },
        session.openclaw_session_id
      );
      await client.call('chat.send', {
        sessionKey,
        message: learningMessage,
        idempotencyKey: `learner-${taskId}-${event.newStatus}-${Date.now()}`
      });
      logger.info(`[Learner] Notified ${learnerRole.agent_name} about ${event.previousStatus}→${event.newStatus}`);
    }
  } catch (err) {
    // Learner notification is best-effort — don't fail the transition
    logger.error('[Learner] Failed to notify learner:', (err as Error).message);
  }
}

/**
 * Get relevant knowledge entries to inject into a builder's dispatch context.
 * Called before dispatching to the builder agent.
 */
export function getRelevantKnowledge(workspaceId: string, taskTitle: string, limit = 5): KnowledgeEntry[] {
  // Get recent knowledge entries from this workspace, prioritize high confidence
  const entries = queryAll<KnowledgeEntry & { tags: string }>(
    `SELECT * FROM knowledge_entries
     WHERE workspace_id = ?
     ORDER BY confidence DESC, created_at DESC
     LIMIT ?`,
    [workspaceId, limit]
  );

  return entries.map(e => ({
    ...e,
    tags: e.tags ? (typeof e.tags === 'string' ? JSON.parse(e.tags) : e.tags) : [],
  }));
}

/**
 * Format knowledge entries for injection into a dispatch message
 */
export function formatKnowledgeForDispatch(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return '';

  const items = entries.map((e, i) =>
    `${i + 1}. **${e.title}** (${e.category}, confidence: ${(e.confidence * 100).toFixed(0)}%)\n   ${e.content}`
  ).join('\n\n');

  return `\n---\n📚 **PREVIOUS LESSONS LEARNED:**\n${items}\n\nKeep these in mind to avoid repeating past mistakes.\n`;
}
