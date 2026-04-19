import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { WorkCheckpoint, CheckpointType } from '@/lib/types';

interface SaveCheckpointInput {
  taskId: string;
  agentId: string;
  checkpointType?: CheckpointType;
  stateSummary: string;
  filesSnapshot?: Array<{ path: string; hash: string; size: number }>;
  contextData?: Record<string, unknown>;
}

/**
 * Save a checkpoint only if no checkpoint has been saved for this task in
 * the last `thresholdSeconds`. Used by dispatch / stage-transition /
 * stall-detection call sites to avoid duplicate rows when recovery loops
 * hammer the task in quick succession.
 */
export function saveCheckpointThrottled(
  input: SaveCheckpointInput,
  thresholdSeconds: number
): WorkCheckpoint | null {
  const latest = getLatestCheckpoint(input.taskId);
  if (latest) {
    const ageSeconds = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
    if (ageSeconds < thresholdSeconds) return null;
  }
  return saveCheckpoint(input);
}

/**
 * Save a work checkpoint for a task.
 */
export function saveCheckpoint(input: SaveCheckpointInput): WorkCheckpoint {
  const { taskId, agentId, checkpointType = 'auto', stateSummary, filesSnapshot, contextData } = input;

  const id = uuidv4();
  const now = new Date().toISOString();

  run(
    `INSERT INTO work_checkpoints (id, task_id, agent_id, checkpoint_type, state_summary, files_snapshot, context_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, taskId, agentId, checkpointType, stateSummary, filesSnapshot ? JSON.stringify(filesSnapshot) : null, contextData ? JSON.stringify(contextData) : null, now]
  );

  // Update agent_health last_checkpoint_at
  run(
    `UPDATE agent_health SET last_checkpoint_at = ?, updated_at = ? WHERE agent_id = ? AND task_id = ?`,
    [now, now, agentId, taskId]
  );

  const checkpoint = queryOne<WorkCheckpoint>('SELECT * FROM work_checkpoints WHERE id = ?', [id])!;

  broadcast({ type: 'checkpoint_saved', payload: checkpoint });

  return checkpoint;
}

/**
 * Get the most recent checkpoint for a task.
 */
export function getLatestCheckpoint(taskId: string): WorkCheckpoint | null {
  const row = queryOne<WorkCheckpoint>(
    'SELECT * FROM work_checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
    [taskId]
  );
  if (!row) return null;

  return {
    ...row,
    files_snapshot: row.files_snapshot ? JSON.parse(row.files_snapshot as unknown as string) : undefined,
    context_data: row.context_data ? JSON.parse(row.context_data as unknown as string) : undefined,
  };
}

/**
 * Get all checkpoints for a task.
 */
export function getCheckpoints(taskId: string): WorkCheckpoint[] {
  const rows = queryAll<WorkCheckpoint>(
    'SELECT * FROM work_checkpoints WHERE task_id = ? ORDER BY created_at DESC',
    [taskId]
  );

  return rows.map(row => ({
    ...row,
    files_snapshot: row.files_snapshot ? JSON.parse(row.files_snapshot as unknown as string) : undefined,
    context_data: row.context_data ? JSON.parse(row.context_data as unknown as string) : undefined,
  }));
}

/**
 * Build checkpoint context string for injection into a dispatch message.
 */
export function buildCheckpointContext(taskId: string): string | null {
  const checkpoint = getLatestCheckpoint(taskId);
  if (!checkpoint) return null;

  let context = `\n---\n**🔄 CRASH RECOVERY — Resuming from checkpoint (${checkpoint.created_at}):**\n`;
  context += `**Summary of work done:** ${checkpoint.state_summary}\n`;

  if (checkpoint.files_snapshot && checkpoint.files_snapshot.length > 0) {
    context += `**Files created/modified:**\n`;
    for (const file of checkpoint.files_snapshot) {
      context += `  - ${file.path} (${file.size} bytes)\n`;
    }
  }

  if (checkpoint.context_data) {
    const data = checkpoint.context_data;
    if (data.current_step) context += `**Current step:** ${data.current_step}\n`;
    if (data.completed_steps) context += `**Completed steps:** ${(data.completed_steps as string[]).join(', ')}\n`;
    if (data.remaining_steps) context += `**Remaining steps:** ${(data.remaining_steps as string[]).join(', ')}\n`;
    if (data.notes) context += `**Notes:** ${data.notes}\n`;
  }

  context += `\n**Continue from where the previous agent left off. Do not redo completed work.**\n`;

  return context;
}
