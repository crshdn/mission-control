import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { updateSkill, reportSkillUsage } from '@/lib/skills';
import { queryOne } from '@/lib/db';
import type { ProductSkill } from '@/lib/skills';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const body = await request.json();

    const skill = updateSkill(skillId, {
      title: body.title,
      triggerKeywords: body.trigger_keywords,
      prerequisites: body.prerequisites,
      steps: body.steps,
      verification: body.verification,
      status: body.status,
    });

    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    return NextResponse.json(skill);
  } catch (error) {
    logger.error('Failed to update skill:', error);
    return NextResponse.json({ error: 'Failed to update skill' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> }
) {
  const { skillId } = await params;
  const skill = queryOne<ProductSkill>('SELECT * FROM product_skills WHERE id = ?', [skillId]);
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  return NextResponse.json(skill);
}
