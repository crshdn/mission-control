import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { updateSchedule, deleteSchedule } from '@/lib/autopilot/scheduling';
import { UpdateScheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; schedId: string }> }
) {
  try {
    const { schedId } = await params;
    const body = await request.json();
    const validation = UpdateScheduleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const schedule = updateSchedule(schedId, validation.data);
    if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    return NextResponse.json(schedule);
  } catch (error) {
    logger.error('Failed to update schedule:', error);
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; schedId: string }> }
) {
  try {
    const { schedId } = await params;
    const deleted = deleteSchedule(schedId);
    if (!deleted) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete schedule:', error);
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
  }
}
