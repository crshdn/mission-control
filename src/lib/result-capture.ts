/**
 * Result Capture Utility
 * 
 * Captures agent outputs when tasks complete, ensuring deliverables
 * are properly recorded even if the agent doesn't call the APIs.
 */

import { getOpenClawClient } from './openclaw/client';
import { queryOne, run } from './db';
import type { OpenClawSession, OpenClawHistoryMessage } from './types';

/**
 * Attempt to capture the result from an agent's session history.
 * Called when task moves to "review" status as a fallback if no result was captured via activity.
 */
export async function captureResultFromSession(taskId: string): Promise<string | null> {
  try {
    // Check if task already has a result
    const task = queryOne<{ result?: string }>('SELECT result FROM tasks WHERE id = ?', [taskId]);
    if (task?.result) {
      console.log(`[RESULT CAPTURE] Task ${taskId} already has result, skipping session capture`);
      return task.result;
    }

    // Find the active session for this task
    const session = queryOne<OpenClawSession>(
      `SELECT * FROM openclaw_sessions 
       WHERE task_id = ? OR (agent_id IN (
         SELECT assigned_agent_id FROM tasks WHERE id = ?
       ))
       ORDER BY created_at DESC
       LIMIT 1`,
      [taskId, taskId]
    );

    if (!session) {
      console.log(`[RESULT CAPTURE] No session found for task ${taskId}`);
      return null;
    }

    // Connect to OpenClaw Gateway
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (err) {
        console.error('[RESULT CAPTURE] Failed to connect to OpenClaw Gateway:', err);
        return null;
      }
    }

    // Get session history
    const history = await client.getSessionHistory(session.openclaw_session_id) as OpenClawHistoryMessage[];
    
    if (!history || history.length === 0) {
      console.log(`[RESULT CAPTURE] No history found for session ${session.openclaw_session_id}`);
      return null;
    }

    // Find the last assistant message containing TASK_COMPLETE or substantial output
    let result: string | null = null;
    
    // Search backwards through messages
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role === 'assistant' && msg.content) {
        const content = msg.content;
        
        // Look for TASK_COMPLETE pattern
        const taskCompleteMatch = content.match(/TASK_COMPLETE:\s*(.+?)(?:\n|$)/i);
        if (taskCompleteMatch) {
          result = taskCompleteMatch[1].trim();
          console.log(`[RESULT CAPTURE] Found TASK_COMPLETE in session history`);
          break;
        }
        
        // If this is the last assistant message and it's substantial (>100 chars), use it
        if (i === history.length - 1 && content.length > 100) {
          // Truncate to first 2000 chars for storage
          result = content.slice(0, 2000);
          if (content.length > 2000) {
            result += '... [truncated]';
          }
          console.log(`[RESULT CAPTURE] Using last assistant message as result`);
          break;
        }
      }
    }

    // Store the result if found
    if (result) {
      const now = new Date().toISOString();
      run(
        `UPDATE tasks SET result = ?, result_captured_at = ?, updated_at = ? WHERE id = ?`,
        [result, now, now, taskId]
      );
      console.log(`[RESULT CAPTURE] Stored result for task ${taskId} from session history`);
    }

    return result;
  } catch (err) {
    console.error('[RESULT CAPTURE] Error capturing result from session:', err);
    return null;
  }
}

/**
 * Parse and store result from a completion message.
 * Called when activity_type "completed" is logged or when agent sends TASK_COMPLETE.
 */
export function storeTaskResult(taskId: string, resultText: string): void {
  const now = new Date().toISOString();
  
  // Only store if no result exists yet
  run(
    `UPDATE tasks SET result = ?, result_captured_at = ?, updated_at = ? 
     WHERE id = ? AND result IS NULL`,
    [resultText, now, now, taskId]
  );
}
