import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { listIdeas, createManualIdea } from '@/lib/autopilot/ideation';
import { CreateIdeaSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const filters = {
      status: searchParams.get('status') || undefined,
      category: searchParams.get('category') || undefined,
      source: searchParams.get('source') || undefined,
    };
    const ideas = listIdeas(id, filters);
    return NextResponse.json(ideas);
  } catch (error) {
    logger.error('Failed to list ideas:', error);
    return NextResponse.json({ error: 'Failed to list ideas' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = CreateIdeaSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const idea = createManualIdea(id, validation.data);
    return NextResponse.json(idea, { status: 201 });
  } catch (error) {
    logger.error('Failed to create idea:', error);
    return NextResponse.json({ error: 'Failed to create idea' }, { status: 500 });
  }
}
