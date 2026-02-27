import { NextRequest, NextResponse } from 'next/server';
import { 
  getWebhookById, 
  updateWebhook,
  deleteWebhook
} from '@/lib/webhooks';
import type { UpdateWebhookRequest, WebhookEventType } from '@/lib/types';

/**
 * GET /api/webhooks/[id] - Get specific webhook
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const webhook = getWebhookById(params.id);
    
    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(webhook);
  } catch (error) {
    console.error('[API] Failed to get webhook:', error);
    return NextResponse.json(
      { error: 'Failed to get webhook' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/webhooks/[id] - Update webhook
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body: UpdateWebhookRequest = await request.json();

    // Validate URL format if provided
    if (body.url) {
      try {
        new URL(body.url);
      } catch {
        return NextResponse.json(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
      }
    }

    // Validate events array if provided
    if (body.events) {
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
    }

    const updated = updateWebhook(params.id, body);
    
    if (!updated) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Webhook updated successfully' });
  } catch (error) {
    console.error('[API] Failed to update webhook:', error);
    return NextResponse.json(
      { error: 'Failed to update webhook' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/webhooks/[id] - Delete webhook
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deleteWebhook(params.id);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Webhook deleted successfully' });
  } catch (error) {
    console.error('[API] Failed to delete webhook:', error);
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}