import { v4 as uuidv4 } from 'uuid';
import { queryAll, run } from '@/lib/db';

type DiagnosticKind = 'discord_relay' | 'completion_forward';
type DiagnosticStatus = 'attempt' | 'success' | 'failure' | 'skipped';

interface DiagnosticWrite {
  kind: DiagnosticKind;
  status: DiagnosticStatus;
  message: string;
  metadata?: Record<string, unknown>;
}

function safeStringify(input?: Record<string, unknown>): string | null {
  if (!input) return null;
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

export function logOpenClawDiagnostic(entry: DiagnosticWrite): void {
  try {
    const now = new Date().toISOString();
    run(
      `INSERT INTO events (id, type, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'system',
        `[openclaw:${entry.kind}:${entry.status}] ${entry.message}`,
        safeStringify(entry.metadata),
        now,
      ],
    );
  } catch (error) {
    console.error('[OpenClaw][Diagnostics] Failed to write diagnostic event:', error);
  }
}

export function getRecentOpenClawDiagnostics(limit = 100): Array<{
  id: string;
  type: string;
  message: string;
  metadata: string | null;
  created_at: string;
}> {
  return queryAll(
    `SELECT id, type, message, metadata, created_at
     FROM events
     WHERE type = 'system'
       AND message LIKE '[openclaw:%'
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
  );
}

