import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createSchedule, listSchedules } from '@/lib/autopilot/scheduling';
import { CreateScheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const schedules = listSchedules(id);
    return NextResponse.json(schedules);
  } catch (error) {
    logger.error('Failed to list schedules:', error);
    return NextResponse.json({ error: 'Failed to list schedules' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = CreateScheduleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const schedule = createSchedule(id, validation.data);
    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    logger.error('Failed to create schedule:', error);
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
  }
}
