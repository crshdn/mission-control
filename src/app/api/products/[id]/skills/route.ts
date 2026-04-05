import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createSkill, getSkillsForProduct } from '@/lib/skills';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = request.nextUrl;

  const skills = getSkillsForProduct(id, {
    status: searchParams.get('status') || undefined,
    skillType: searchParams.get('skill_type') || undefined,
  });

  return NextResponse.json(skills);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.title || !body.skill_type || !body.steps) {
      return NextResponse.json(
        { error: 'Missing required fields: title, skill_type, steps' },
        { status: 400 }
      );
    }

    const skill = createSkill({
      productId: id,
      skillType: body.skill_type,
      title: body.title,
      triggerKeywords: body.trigger_keywords,
      prerequisites: body.prerequisites,
      steps: body.steps,
      verification: body.verification,
      createdByTaskId: body.created_by_task_id,
      createdByAgentId: body.created_by_agent_id,
    });

    return NextResponse.json(skill, { status: 201 });
  } catch (error) {
    logger.error('Failed to create skill:', error);
    return NextResponse.json({ error: 'Failed to create skill' }, { status: 500 });
  }
}
