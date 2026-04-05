import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { buildOpenClawSessionKey } from '@/lib/openclaw/session-routing';
import type { TaskNote, OpenClawSession, Agent } from '@/lib/types';

/**
 * Create a new task note (user message or agent response).
 */
export function createNote(taskId: string, content: string, mode: 'note' | 'direct', role: 'user' | 'assistant' = 'user'): TaskNote {
  const id = uuidv4();
  const status = role === 'assistant' ? 'delivered' : 'pending';
  const deliveredAt = role === 'assistant' ? new Date().toISOString() : null;

  run(
    `INSERT INTO task_notes (id, task_id, content, mode, role, status, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, taskId, content, mode, role, status, deliveredAt]
  );

  return queryOne<TaskNote>('SELECT * FROM task_notes WHERE id = ?', [id])!;
}

/**
 * Get all notes for a task (for chat history display).
 */
export function getTaskNotes(taskId: string): TaskNote[] {
  return queryAll<TaskNote>(
    'SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC',
    [taskId]
  );
}

/**
 * Get pending notes and format them for injection into a dispatch message.
 */
export function getPendingNotesForDispatch(taskId: string): { notes: TaskNote[]; formatted: string | null } {
  const notes = queryAll<TaskNote>(
    `SELECT * FROM task_notes WHERE task_id = ? AND status = 'pending' ORDER BY created_at ASC`,
    [taskId]
  );

  if (notes.length === 0) return { notes: [], formatted: null };

  const lines = notes.map(n => {
    const time = new Date(n.created_at).toLocaleString();
    return `- ${n.content} (queued at ${time})`;
  });

  const formatted = `\n---\n📌 **OPERATOR NOTES** (added while you were working):\n${lines.join('\n')}\nPlease incorporate these into your current work.\n`;

  // Mark as delivered
  markNotesDelivered(notes.map(n => n.id));

  return { notes, formatted };
}

/**
 * Deliver pending notes to the agent via OpenClaw at checkpoint time.
 */
export async function deliverPendingNotesAtCheckpoint(taskId: string): Promise<number> {
  const notes = queryAll<TaskNote>(
    `SELECT * FROM task_notes WHERE task_id = ? AND status = 'pending' ORDER BY created_at ASC`,
    [taskId]
  );

  if (notes.length === 0) return 0;

  // Find the active OpenClaw session for this task
  const session = queryOne<OpenClawSession>(
    `SELECT os.* FROM openclaw_sessions os
     JOIN agents a ON os.agent_id = a.id
     WHERE os.task_id = ? AND os.status = 'active'
     ORDER BY os.created_at DESC LIMIT 1`,
    [taskId]
  );

  // If no task-specific session, try finding session via assigned agent
  let activeSession = session;
  if (!activeSession) {
    const taskAgent = queryOne<{ assigned_agent_id: string }>('SELECT assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
    if (taskAgent?.assigned_agent_id) {
      activeSession = queryOne<OpenClawSession>(
        `SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [taskAgent.assigned_agent_id]
      );
    }
  }

  if (!activeSession) {
    logger.warn(`[TaskNotes] No active session for task ${taskId} — notes remain pending`);
    return 0;
  }

  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) await client.connect();

    // Get the agent's session key prefix
    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [activeSession.agent_id]);
    const sessionKey = buildOpenClawSessionKey(agent, activeSession.openclaw_session_id);

    // Build the message
    const lines = notes.map(n => `- ${n.content}`);
    const message = `📌 **OPERATOR NOTES:**\n${lines.join('\n')}\n\nPlease incorporate these into your current work.`;

    await client.call('chat.send', {
      sessionKey,
      message,
      idempotencyKey: `notes-${taskId}-${Date.now()}`
    });

    markNotesDelivered(notes.map(n => n.id));
    return notes.length;
  } catch (error) {
    logger.error(`[TaskNotes] Failed to deliver notes for task ${taskId}:`, error);
    return 0;
  }
}

/**
 * Mark notes as delivered.
 */
export function markNotesDelivered(noteIds: string[]): void {
  if (noteIds.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = noteIds.map(() => '?').join(', ');
  run(
    `UPDATE task_notes SET status = 'delivered', delivered_at = ? WHERE id IN (${placeholders})`,
    [now, ...noteIds]
  );

  for (const noteId of noteIds) {
    broadcast({ type: 'note_delivered', payload: { noteId } });
  }
}

/**
 * Find the active OpenClaw session for a task.
 * Checks task-specific sessions first, then falls back to the assigned agent's session.
 */
export function getActiveSessionForTask(taskId: string): { session: OpenClawSession; sessionKey: string } | null {
  // Try task-specific session first
  let session = queryOne<OpenClawSession>(
    `SELECT * FROM openclaw_sessions WHERE task_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [taskId]
  );

  // Fall back to assigned agent's active session
  if (!session) {
    const task = queryOne<{ assigned_agent_id: string }>('SELECT assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
    if (task?.assigned_agent_id) {
      session = queryOne<OpenClawSession>(
        `SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [task.assigned_agent_id]
      );
    }
  }

  if (!session) return null;

  const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [session.agent_id]);
  const sessionKey = buildOpenClawSessionKey(agent, session.openclaw_session_id);

  return { session, sessionKey };
}
