/**
 * Webhook System for Mission Control
 * 
 * Handles outbound webhook delivery to external systems (primarily OpenClaw)
 * with retry logic, HMAC authentication, and failure tracking.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { 
  Webhook, 
  WebhookEvent, 
  WebhookEventType, 
  Task, 
  TaskStatus, 
  TaskActivity, 
  Agent 
} from './types';
import { queryAll, queryOne, run, transaction } from './db';

// Webhook configuration
const WEBHOOK_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 30000, 120000]; // 5s, 30s, 2m

/**
 * Get all enabled webhooks that listen for a specific event type
 */
export function getWebhooksForEvent(eventType: WebhookEventType): Webhook[] {
  const webhooks = queryAll<{
    id: string;
    name: string;
    url: string;
    secret: string | null;
    events: string;
    enabled: number;
    created_at: string;
    last_triggered_at: string | null;
    failure_count: number;
  }>(`
    SELECT * FROM webhooks 
    WHERE enabled = 1
  `);

  return webhooks
    .map(webhook => ({
      ...webhook,
      events: JSON.parse(webhook.events) as WebhookEventType[],
      enabled: webhook.enabled === 1,
      secret: webhook.secret || undefined,
      last_triggered_at: webhook.last_triggered_at || undefined,
    }))
    .filter(webhook => webhook.events.includes(eventType));
}

/**
 * Create HMAC signature for webhook payload
 */
function createSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

/**
 * Send a single webhook with retry logic
 */
async function deliverWebhook(webhook: Webhook, event: WebhookEvent): Promise<void> {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-MC-Event': event.type,
    'X-MC-Delivery': event.id,
    'X-MC-Timestamp': timestamp.toString(),
  };

  // HMAC signature is REQUIRED (Bob's mandatory change)
  // Every webhook must have a secret for HMAC authentication
  if (!webhook.secret) {
    throw new Error(`Webhook ${webhook.name} has no secret - HMAC authentication required`);
  }

  // Create signature payload: timestamp.body (for replay attack protection)
  const signaturePayload = `${timestamp}.${payload}`;
  headers['X-MC-Signature'] = `sha256=${createSignature(signaturePayload, webhook.secret)}`;


  let lastError: Error | null = null;

  // Try delivery with retries
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT),
      });

      if (response.ok) {
        // Success - update last triggered time and reset failure count
        run(`
          UPDATE webhooks 
          SET last_triggered_at = datetime('now'), failure_count = 0 
          WHERE id = ?
        `, [webhook.id]);

        console.log(`[Webhook] Delivered ${event.type} to ${webhook.name} (${webhook.url})`);
        return;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      lastError = error as Error;
      console.error(`[Webhook] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${webhook.name}:`, error);

      // Wait before retry (except for last attempt)
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      }
    }
  }

  // All retries failed - increment failure count
  run(`
    UPDATE webhooks 
    SET failure_count = failure_count + 1 
    WHERE id = ?
  `, [webhook.id]);

  // Disable webhook after too many failures
  const failureCount = queryOne<{ failure_count: number }>(`
    SELECT failure_count FROM webhooks WHERE id = ?
  `, [webhook.id])?.failure_count || 0;

  if (failureCount >= 10) {
    run(`UPDATE webhooks SET enabled = 0 WHERE id = ?`, [webhook.id]);
    console.error(`[Webhook] Disabled ${webhook.name} after ${failureCount} failures`);
  }

  throw lastError || new Error('Webhook delivery failed');
}

/**
 * Trigger webhooks for a specific event
 */
export async function triggerWebhooks(eventType: WebhookEventType, data: WebhookEvent['data']): Promise<void> {
  const webhooks = getWebhooksForEvent(eventType);
  
  if (webhooks.length === 0) {
    console.log(`[Webhook] No webhooks configured for ${eventType}`);
    return;
  }

  const event: WebhookEvent = {
    id: `evt_${uuidv4().replace(/-/g, '').substring(0, 16)}`,
    type: eventType,
    timestamp: new Date().toISOString(),
    data,
    metadata: {
      workspace_id: 'default',
      triggered_by: 'mission_control'
    }
  };

  console.log(`[Webhook] Triggering ${eventType} for ${webhooks.length} webhook(s)`);

  // Deliver to all webhooks in parallel
  const deliveryPromises = webhooks.map(webhook => 
    deliverWebhook(webhook, event).catch(error => 
      console.error(`[Webhook] Failed to deliver to ${webhook.name}:`, error)
    )
  );

  await Promise.all(deliveryPromises);
}

/**
 * Trigger webhook when task status changes
 */
export async function triggerTaskStatusChange(task: Task, previousStatus?: TaskStatus): Promise<void> {
  const eventType = 'task.status_changed';
  
  // Also trigger specific events for important transitions
  const specificEvents: WebhookEventType[] = [];
  
  if (task.status === 'in_progress' && previousStatus === 'planning') {
    specificEvents.push('task.planning_complete');
  }
  
  if (task.status === 'review') {
    specificEvents.push('task.review_ready');
  }
  
  if (task.status === 'done') {
    specificEvents.push('task.completed');
  }

  // Trigger main status change event
  await triggerWebhooks(eventType, {
    task_id: task.id,
    title: task.title,
    status: task.status,
    previous_status: previousStatus,
    priority: task.priority,
    description: task.description,
    planning_spec: task.planning_spec,
  });

  // Trigger specific transition events
  for (const specificEvent of specificEvents) {
    await triggerWebhooks(specificEvent, {
      task_id: task.id,
      title: task.title,
      status: task.status,
      previous_status: previousStatus,
      priority: task.priority,
      description: task.description,
      planning_spec: task.planning_spec,
    });
  }
}

/**
 * Trigger webhook when task is created
 */
export async function triggerTaskCreated(task: Task): Promise<void> {
  await triggerWebhooks('task.created', {
    task_id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    description: task.description,
  });
}

/**
 * Trigger webhook when task is stuck
 */
export async function triggerTaskStuck(task: Task, stuckDurationMinutes: number): Promise<void> {
  const hours = Math.floor(stuckDurationMinutes / 60);
  const minutes = stuckDurationMinutes % 60;
  const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  await triggerWebhooks('task.stuck', {
    task_id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    description: task.description,
    stuck_duration: durationText,
  });
}

/**
 * Trigger webhook when agent spawned
 */
export async function triggerAgentSpawned(agent: Agent, taskId?: string, sessionId?: string): Promise<void> {
  await triggerWebhooks('agent.spawned', {
    agent_id: agent.id,
    agent_name: agent.name,
    task_id: taskId,
    session_id: sessionId,
  });
}

/**
 * Trigger webhook when agent completes work
 */
export async function triggerAgentCompleted(agent: Agent, taskId?: string, sessionId?: string): Promise<void> {
  await triggerWebhooks('agent.completed', {
    agent_id: agent.id,
    agent_name: agent.name,
    task_id: taskId,
    session_id: sessionId,
  });
}

/**
 * Check for stuck tasks and trigger webhooks
 * Called by background job every 5 minutes
 */
export async function checkStuckTasks(): Promise<void> {
  const stuckThresholdMinutes = 30;
  
  const stuckTasks = queryAll<Task>(`
    SELECT * FROM tasks 
    WHERE status = 'in_progress' 
    AND (julianday('now') - julianday(updated_at)) * 24 * 60 > ?
  `, [stuckThresholdMinutes]);

  console.log(`[Webhook] Checking for stuck tasks: found ${stuckTasks.length}`);

  for (const task of stuckTasks) {
    const minutesStuck = Math.floor(
      (Date.now() - new Date(task.updated_at).getTime()) / (1000 * 60)
    );
    
    await triggerTaskStuck(task, minutesStuck);
  }
}

// CRUD operations for webhook management

/**
 * Get all webhooks
 */
export function getAllWebhooks(): Webhook[] {
  const webhooks = queryAll<{
    id: string;
    name: string;
    url: string;
    secret: string | null;
    events: string;
    enabled: number;
    created_at: string;
    last_triggered_at: string | null;
    failure_count: number;
  }>(`SELECT * FROM webhooks ORDER BY created_at DESC`);

  return webhooks.map(webhook => ({
    ...webhook,
    events: JSON.parse(webhook.events) as WebhookEventType[],
    enabled: webhook.enabled === 1,
    secret: webhook.secret || undefined,
    last_triggered_at: webhook.last_triggered_at || undefined,
  }));
}

/**
 * Get webhook by ID
 */
export function getWebhookById(id: string): Webhook | null {
  const webhook = queryOne<{
    id: string;
    name: string;
    url: string;
    secret: string | null;
    events: string;
    enabled: number;
    created_at: string;
    last_triggered_at: string | null;
    failure_count: number;
  }>(`SELECT * FROM webhooks WHERE id = ?`, [id]);

  if (!webhook) return null;

  return {
    ...webhook,
    events: JSON.parse(webhook.events) as WebhookEventType[],
    enabled: webhook.enabled === 1,
    secret: webhook.secret || undefined,
    last_triggered_at: webhook.last_triggered_at || undefined,
  };
}

/**
 * Create a new webhook
 */
export function createWebhook(data: {
  name: string;
  url: string;
  secret?: string;
  events: WebhookEventType[];
  enabled?: boolean;
}): string {
  const id = uuidv4();
  
  run(`
    INSERT INTO webhooks (id, name, url, secret, events, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.name,
    data.url,
    data.secret || null,
    JSON.stringify(data.events),
    data.enabled !== false ? 1 : 0,
  ]);

  return id;
}

/**
 * Update webhook
 */
export function updateWebhook(id: string, data: {
  name?: string;
  url?: string;
  secret?: string;
  events?: WebhookEventType[];
  enabled?: boolean;
}): boolean {
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.url !== undefined) {
    updates.push('url = ?');
    params.push(data.url);
  }
  if (data.secret !== undefined) {
    updates.push('secret = ?');
    params.push(data.secret || null);
  }
  if (data.events !== undefined) {
    updates.push('events = ?');
    params.push(JSON.stringify(data.events));
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(data.enabled ? 1 : 0);
  }

  if (updates.length === 0) return false;

  params.push(id);
  const result = run(`
    UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?
  `, params);

  return result.changes > 0;
}

/**
 * Delete webhook
 */
export function deleteWebhook(id: string): boolean {
  const result = run(`DELETE FROM webhooks WHERE id = ?`, [id]);
  return result.changes > 0;
}

/**
 * Test webhook by sending a sample event
 */
export async function testWebhook(id: string): Promise<void> {
  const webhook = getWebhookById(id);
  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const testEvent: WebhookEvent = {
    id: `test_${uuidv4().replace(/-/g, '').substring(0, 16)}`,
    type: 'task.created',
    timestamp: new Date().toISOString(),
    data: {
      task_id: 'test-task-id',
      title: 'Test Task',
      status: 'inbox' as TaskStatus,
      priority: 'normal',
      description: 'This is a test webhook event from Mission Control',
    },
    metadata: {
      workspace_id: 'default',
      triggered_by: 'webhook_test'
    }
  };

  await deliverWebhook(webhook, testEvent);
}