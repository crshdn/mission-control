import { NextRequest, NextResponse } from 'next/server';
import { testWebhook } from '@/lib/webhooks';

/**
 * POST /api/webhooks/[id]/test - Test webhook by sending a sample event
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await testWebhook(params.id);
    return NextResponse.json({ 
      message: 'Test webhook sent successfully' 
    });
  } catch (error) {
    console.error('[API] Failed to test webhook:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to test webhook';
    const status = errorMessage === 'Webhook not found' ? 404 : 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}