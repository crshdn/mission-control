import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { saveCheckpoint, getLatestCheckpoint } from '@/lib/checkpoint';
import { deliverPendingNotesAtCheckpoint } from '@/lib/task-notes';
import type { CheckpointType } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/[id]/checkpoint — Save a work checkpoint
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { agent_id, checkpoint_type, state_summary, files_snapshot, context_data } = body as {
      agent_id: string;
      checkpoint_type?: CheckpointType;
      state_summary: string;
      files_snapshot?: Array<{ path: string; hash: string; size: number }>;
      context_data?: Record<string, unknown>;
    };

    if (!agent_id || !state_summary) {
      return NextResponse.json({ error: 'agent_id and state_summary are required' }, { status: 400 });
    }

    const checkpoint = saveCheckpoint({
      taskId: id,
      agentId: agent_id,
      checkpointType: checkpoint_type,
      stateSummary: state_summary,
      filesSnapshot: files_snapshot,
      contextData: context_data,
    });

    // Deliver any pending operator notes at this checkpoint
    deliverPendingNotesAtCheckpoint(id).catch(err => {
      logger.warn('[Checkpoint] Failed to deliver pending notes:', err);
    });

    return NextResponse.json(checkpoint, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save checkpoint' }, { status: 500 });
  }
}

// GET /api/tasks/[id]/checkpoint — Get latest checkpoint
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const checkpoint = getLatestCheckpoint(id);

    if (!checkpoint) {
      return NextResponse.json({ error: 'No checkpoints found' }, { status: 404 });
    }

    return NextResponse.json(checkpoint);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch checkpoint' }, { status: 500 });
  }
}
