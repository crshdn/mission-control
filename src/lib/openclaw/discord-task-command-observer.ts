import { v4 as uuidv4 } from 'uuid';
import type { OpenClawClient } from '@/lib/openclaw/client';
import { getDiscordTaskCommandConfig } from '@/lib/config';
import { queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Agent, Task, TaskPriority } from '@/lib/types';

const observedClients = new WeakSet<OpenClawClient>();
const dedupeCache = new Map<string, number>();
const senderRateLimit = new Map<string, number>();
const DEDUPE_TTL_MS = 5 * 60 * 1000;
const MAX_TITLE_LENGTH = 140;
const MIN_TITLE_LENGTH = 3;
const MAX_DESCRIPTION_LENGTH = 4000;
const MIN_DESCRIPTION_LENGTH = 5;

function pruneCache(map: Map<string, number>, ttlMs: number, now: number): void {
  for (const [key, value] of Array.from(map.entries())) {
    if (now - value > ttlMs) map.delete(key);
  }
}

function normalizeSessionKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function recursiveFindByKeys(input: unknown, keys: Set<string>): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (keys.has(key) && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (value && typeof value === 'object') {
      const nested = recursiveFindByKeys(value, keys);
      if (nested) return nested;
    }
  }
  return null;
}

function recursiveCollectStrings(input: unknown, out: string[] = []): string[] {
  if (typeof input === 'string') {
    out.push(input);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) recursiveCollectStrings(item, out);
    return out;
  }
  if (input && typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      recursiveCollectStrings(value, out);
    }
  }
  return out;
}

function extractSessionKey(notification: unknown): string | null {
  const keys = new Set(['sessionKey', 'session_key', 'key']);
  return recursiveFindByKeys(notification, keys);
}

function extractSenderId(notification: unknown): string | null {
  const keys = new Set(['senderId', 'sender_id', 'userId', 'user_id', 'authorId', 'author_id', 'fromId', 'from_id']);
  return recursiveFindByKeys(notification, keys);
}

function extractSenderRole(notification: unknown): string | null {
  const keys = new Set(['senderRole', 'sender_role', 'authorRole', 'author_role', 'role']);
  const role = recursiveFindByKeys(notification, keys);
  return role ? role.toLowerCase() : null;
}

function extractCommandText(notification: unknown, commandPrefix: string): string | null {
  const candidateKeys = new Set(['content', 'message', 'text', 'body']);
  const candidate = recursiveFindByKeys(notification, candidateKeys);
  if (candidate && candidate.trim().toLowerCase().startsWith(commandPrefix.toLowerCase())) {
    return candidate.trim();
  }

  for (const value of recursiveCollectStrings(notification)) {
    const trimmed = value.trim();
    if (trimmed.toLowerCase().startsWith(commandPrefix.toLowerCase())) {
      return trimmed;
    }
  }
  return null;
}

function parseTaskCommand(commandText: string, commandPrefix: string): { title: string; description: string } | null {
  const escapedPrefix = commandPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}\\s+([^|]+?)\\s*\\|\\s*([\\s\\S]+)$`, 'i');
  const match = commandText.match(pattern);
  if (!match) return null;

  const title = match[1].replace(/\s+/g, ' ').trim();
  const description = match[2].trim();
  if (title.length < MIN_TITLE_LENGTH || title.length > MAX_TITLE_LENGTH) return null;
  if (description.length < MIN_DESCRIPTION_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) return null;

  return { title, description };
}

function logAudit(status: 'attempt' | 'rejected' | 'success' | 'failure', message: string, metadata: Record<string, unknown>): void {
  run(
    `INSERT INTO events (id, type, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      'system',
      `[openclaw:discord_task_command:${status}] ${message}`,
      JSON.stringify(metadata),
      new Date().toISOString(),
    ],
  );
}

async function sendAck(client: OpenClawClient, sessionKey: string, message: string, fingerprint: string): Promise<void> {
  await client.call('chat.send', {
    sessionKey,
    message,
    idempotencyKey: `discord-task-command-ack-${fingerprint}-${Date.now()}`,
  });
}

function createTaskFromDiscordCommand(input: {
  title: string;
  description: string;
  workspaceId: string;
  priority: TaskPriority;
  senderId: string | null;
  sessionKey: string;
}): Task {
  const now = new Date().toISOString();
  const taskId = uuidv4();
  const creator = queryOne<Agent>(
    `SELECT id FROM agents
     WHERE workspace_id = ?
     ORDER BY is_master DESC, updated_at DESC
     LIMIT 1`,
    [input.workspaceId],
  );

  transaction(() => {
    run(
      `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        input.title,
        input.description,
        'inbox',
        input.priority,
        null,
        creator?.id || null,
        input.workspaceId,
        'default',
        null,
        now,
        now,
      ],
    );

    run(
      `INSERT INTO events (id, type, task_id, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'task_created',
        taskId,
        creator?.id || null,
        `Discord command created task: ${input.title}`,
        now,
      ],
    );
  });

  const createdTask = queryOne<Task>(
    `SELECT t.*,
      aa.name as assigned_agent_name,
      aa.avatar_emoji as assigned_agent_emoji,
      ca.name as created_by_agent_name,
      ca.avatar_emoji as created_by_agent_emoji
     FROM tasks t
     LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
     LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
     WHERE t.id = ?`,
    [taskId],
  );

  if (!createdTask) {
    throw new Error('Task was created but could not be read back');
  }

  broadcast({
    type: 'task_created',
    payload: createdTask,
  });

  logAudit('success', 'Task created from Discord command', {
    task_id: createdTask.id,
    title: createdTask.title,
    session_key: input.sessionKey,
    sender_id: input.senderId,
    workspace_id: input.workspaceId,
    priority: input.priority,
  });

  return createdTask;
}

export function attachDiscordTaskCommandObserver(client: OpenClawClient): void {
  if (observedClients.has(client)) return;
  observedClients.add(client);

  client.on('notification', (notification: unknown) => {
    try {
      const config = getDiscordTaskCommandConfig();
      if (!config.enabled || !config.sessionKey) return;

      const sessionKey = normalizeSessionKey(extractSessionKey(notification));
      if (!sessionKey || sessionKey !== config.sessionKey) return;

      const commandText = extractCommandText(notification, config.commandPrefix);
      if (!commandText) return;

      const senderRole = extractSenderRole(notification);
      const senderId = extractSenderId(notification);
      if (senderRole === 'assistant' || senderRole === 'system' || senderRole === 'tool') return;
      if (!senderId) {
        logAudit('rejected', 'Missing sender identity', { session_key: sessionKey, command: commandText });
        return;
      }

      const now = Date.now();
      pruneCache(dedupeCache, DEDUPE_TTL_MS, now);
      pruneCache(senderRateLimit, Math.max(config.minIntervalMs, 1000), now);

      const fingerprint = `${sessionKey}:${senderId}:${commandText.toLowerCase()}`;
      if (dedupeCache.has(fingerprint)) {
        logAudit('rejected', 'Duplicate command suppressed', { session_key: sessionKey, sender_id: senderId, command: commandText });
        return;
      }
      dedupeCache.set(fingerprint, now);

      if (config.allowedUserIds.size > 0 && (!senderId || !config.allowedUserIds.has(senderId))) {
        logAudit('rejected', 'Sender not allowlisted', {
          session_key: sessionKey,
          sender_id: senderId,
          command: commandText,
        });
        void sendAck(client, sessionKey, '⛔ Not authorized to create Mission Control tasks from Discord.', fingerprint);
        return;
      }

      const senderKey = `${sessionKey}:${senderId}`;
      const lastCommandAt = senderRateLimit.get(senderKey) || 0;
      if (now - lastCommandAt < config.minIntervalMs) {
        logAudit('rejected', 'Rate limit hit', {
          session_key: sessionKey,
          sender_id: senderId,
          command: commandText,
          min_interval_ms: config.minIntervalMs,
        });
        void sendAck(client, sessionKey, `⏳ Rate limit: wait ${Math.ceil((config.minIntervalMs - (now - lastCommandAt)) / 1000)}s and retry.`, fingerprint);
        return;
      }
      senderRateLimit.set(senderKey, now);

      const parsed = parseTaskCommand(commandText, config.commandPrefix);
      if (!parsed) {
        logAudit('rejected', 'Invalid command format', { session_key: sessionKey, sender_id: senderId, command: commandText });
        void sendAck(
          client,
          sessionKey,
          `⚠️ Invalid format. Use: ${config.commandPrefix} <title> | <description>`,
          fingerprint,
        );
        return;
      }

      const openTaskCountResult = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM tasks
         WHERE workspace_id = ?
           AND status != 'done'`,
        [config.workspaceId],
      );
      const openTaskCount = openTaskCountResult?.count || 0;
      if (openTaskCount >= config.maxOpenTasks) {
        logAudit('rejected', 'Open task threshold reached', {
          workspace_id: config.workspaceId,
          open_task_count: openTaskCount,
          max_open_tasks: config.maxOpenTasks,
          sender_id: senderId,
          session_key: sessionKey,
        });
        void sendAck(
          client,
          sessionKey,
          `⛔ Task not created: workspace has ${openTaskCount} open tasks (limit ${config.maxOpenTasks}).`,
          fingerprint,
        );
        return;
      }

      logAudit('attempt', 'Processing Discord task command', {
        command: commandText,
        title: parsed.title,
        sender_id: senderId,
        session_key: sessionKey,
        workspace_id: config.workspaceId,
      });

      const created = createTaskFromDiscordCommand({
        title: parsed.title,
        description: parsed.description,
        workspaceId: config.workspaceId,
        priority: config.defaultPriority,
        senderId,
        sessionKey,
      });

      void sendAck(
        client,
        sessionKey,
        `✅ Mission Control task created: "${created.title}" (id: ${created.id}, status: ${created.status}).`,
        fingerprint,
      );
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      console.error('[OpenClaw][DiscordTaskCommand] Failed to process command:', errMessage);
      try {
        logAudit('failure', 'Command processing failed', { error: errMessage });
      } catch {
        // no-op
      }
    }
  });
}
