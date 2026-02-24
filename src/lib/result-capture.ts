/**
 * Result Capture Utility
 * 
 * Captures agent outputs when tasks complete, ensuring deliverables
 * are properly recorded even if the agent doesn't call the APIs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { queryOne, run } from './db';
import type { OpenClawSession } from './types';

interface SessionMessage {
  type: string;
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }> | string;
  };
}

/**
 * Read session history from the JSONL file directly
 * Searches for the task ID in session files to find the right session
 */
function readSessionHistory(sessionKey: string, taskId?: string): Array<{ role: string; content: string }> {
  const openclawDir = path.join(os.homedir(), '.openclaw');
  const sessionsDir = path.join(openclawDir, 'agents', 'main', 'sessions');
  
  // Find session files - look for task ID or session key
  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(sessionsDir, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first
  
  const messages: Array<{ role: string; content: string }> = [];
  
  for (const { name: file } of files) {
    const filePath = path.join(sessionsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    // Check if this file contains our task ID or session key
    const hasTaskId = taskId && content.includes(taskId);
    const hasSessionKey = content.includes(sessionKey);
    if (!hasTaskId && !hasSessionKey) continue;
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as SessionMessage;
        if (parsed.type === 'message' && parsed.message?.role === 'assistant') {
          const msgContent = parsed.message.content;
          let textContent = '';
          
          if (typeof msgContent === 'string') {
            textContent = msgContent;
          } else if (Array.isArray(msgContent)) {
            textContent = msgContent
              .filter(c => c.type === 'text' && c.text)
              .map(c => c.text!)
              .join('\n');
          }
          
          if (textContent) {
            messages.push({ role: 'assistant', content: textContent });
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }
  
  return messages;
}

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

    // Read session history from file
    const history = readSessionHistory(session.openclaw_session_id, taskId);
    console.log(`[RESULT CAPTURE] Found ${history.length} messages for task ${taskId}`);
    
    if (!history || history.length === 0) {
      console.log(`[RESULT CAPTURE] No history found for session ${session.openclaw_session_id}`);
      return null;
    }

    // Find the last assistant message containing deliverable block or TASK_COMPLETE
    let result: string | null = null;
    
    // Search backwards through messages
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const content = msg.content;
      
      // First priority: Look for ```deliverable block
      const deliverableMatch = content.match(/```deliverable\n([\s\S]*?)```/);
      if (deliverableMatch) {
        result = deliverableMatch[1].trim();
        console.log(`[RESULT CAPTURE] Found deliverable block in session history`);
        break;
      }
      
      // Second priority: Look for ```output block (alternative format)
      const outputMatch = content.match(/```output\n([\s\S]*?)```/);
      if (outputMatch) {
        result = outputMatch[1].trim();
        console.log(`[RESULT CAPTURE] Found output block in session history`);
        break;
      }
      
      // Third priority: Look for TASK_COMPLETE pattern
      const taskCompleteMatch = content.match(/TASK_COMPLETE:\s*(.+?)(?:\n|$)/i);
      if (taskCompleteMatch) {
        result = taskCompleteMatch[1].trim();
        console.log(`[RESULT CAPTURE] Found TASK_COMPLETE in session history`);
        break;
      }
      
      // Fallback: If this is the last assistant message and it's substantial (>100 chars), use it
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
