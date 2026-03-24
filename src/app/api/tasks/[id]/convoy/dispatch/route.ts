import { NextRequest, NextResponse } from 'next/server';
import { getConvoy } from '@/lib/convoy';
import { dispatchReadyConvoySubtasks } from '@/lib/convoy-dispatch';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/[id]/convoy/dispatch — Dispatch all ready sub-tasks
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const convoy = getConvoy(id);

    if (!convoy) {
      return NextResponse.json({ error: 'No convoy found for this task' }, { status: 404 });
    }

    if (convoy.status !== 'active') {
      return NextResponse.json({ error: `Convoy is ${convoy.status}, cannot dispatch` }, { status: 400 });
    }

    const result = await dispatchReadyConvoySubtasks(convoy.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to dispatch convoy' }, { status: 500 });
  }
}
