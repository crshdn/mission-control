import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { reportSkillUsage } from '@/lib/skills';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const body = await request.json();

    if (body.used === undefined || body.succeeded === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: used, succeeded' },
        { status: 400 }
      );
    }

    const skill = reportSkillUsage({
      skillId,
      taskId: body.task_id,
      used: body.used,
      succeeded: body.succeeded,
      deviation: body.deviation,
      suggestedUpdate: body.suggested_update,
    });

    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    return NextResponse.json(skill);
  } catch (error) {
    logger.error('Failed to report skill usage:', error);
    return NextResponse.json({ error: 'Failed to report' }, { status: 500 });
  }
}
