import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { recordCostEvent } from '@/lib/costs/tracker';
import { CreateCostEventSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CreateCostEventSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const event = recordCostEvent(validation.data);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    logger.error('Failed to record cost event:', error);
    return NextResponse.json({ error: 'Failed to record cost event' }, { status: 500 });
  }
}
