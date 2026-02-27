import { NextRequest, NextResponse } from 'next/server';
import { startBackgroundJobs, getBackgroundJobStatus } from '@/lib/background-jobs';

/**
 * POST /api/webhooks/init - Initialize webhook system and background jobs
 */
export async function POST() {
  try {
    startBackgroundJobs();
    
    return NextResponse.json({ 
      message: 'Webhook system initialized',
      jobs: getBackgroundJobStatus()
    });
  } catch (error) {
    console.error('[API] Failed to initialize webhook system:', error);
    return NextResponse.json(
      { error: 'Failed to initialize webhook system' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/init - Get background job status
 */
export async function GET() {
  try {
    return NextResponse.json({
      status: 'webhook system status',
      jobs: getBackgroundJobStatus()
    });
  } catch (error) {
    console.error('[API] Failed to get webhook system status:', error);
    return NextResponse.json(
      { error: 'Failed to get webhook system status' },
      { status: 500 }
    );
  }
}