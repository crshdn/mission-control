import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllWebhooks, 
  createWebhook,
  testWebhook
} from '@/lib/webhooks';
import type { CreateWebhookRequest, WebhookEventType } from '@/lib/types';

/**
 * GET /api/webhooks - Get all webhooks
 */
export async function GET() {
  try {
    const webhooks = getAllWebhooks();
    return NextResponse.json(webhooks);
  } catch (error) {
    console.error('[API] Failed to get webhooks:', error);
    return NextResponse.json(
      { error: 'Failed to get webhooks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks - Create a new webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateWebhookRequest = await request.json();
    
    // Validate required fields
    if (!body.name || !body.url || !body.events || !body.secret) {
      return NextResponse.json(
        { error: 'Missing required fields: name, url, events, secret' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Validate events array
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json(
        { error: 'Events must be a non-empty array' },
        { status: 400 }
      );
    }

    const validEvents: WebhookEventType[] = [
      'task.created',
      'task.status_changed',
      'task.planning_complete',
      'task.stuck',
      'task.review_ready',
      'task.completed',
      'agent.spawned',
      'agent.completed'
    ];

    const invalidEvents = body.events.filter(event => !validEvents.includes(event));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid event types: ${invalidEvents.join(', ')}` },
        { status: 400 }
      );
    }

    const webhookId = createWebhook({
      name: body.name,
      url: body.url,
      secret: body.secret,
      events: body.events,
      enabled: body.enabled
    });

    return NextResponse.json(
      { id: webhookId, message: 'Webhook created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('[API] Failed to create webhook:', error);
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    );
  }
}