import { NextRequest, NextResponse } from 'next/server';
import { triggerSyntheticCompletionForward } from '@/lib/openclaw/completion-observer';

/**
 * POST /api/openclaw/diagnostics/trigger-completion
 *
 * Dev-only helper: force a synthetic TASK_COMPLETE forward through the same
 * completion observer pipeline used for real OpenClaw notifications.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = String(body.session_id || 'mission-control-developer');
    const summary = String(body.summary || 'diagnostics trigger');

    const result = await triggerSyntheticCompletionForward(sessionId, summary);
    return NextResponse.json({
      success: true,
      session_id: result.sessionId,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trigger failed' },
      { status: 400 },
    );
  }
}

