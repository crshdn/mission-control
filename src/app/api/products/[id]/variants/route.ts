import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createVariant, listVariants } from '@/lib/autopilot/ab-testing';

export const dynamic = 'force-dynamic';

/** GET /api/products/:id/variants — List all variants for a product */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const variants = listVariants(id);
    return NextResponse.json(variants);
  } catch (error) {
    logger.error('Failed to list variants:', error);
    return NextResponse.json({ error: 'Failed to list variants' }, { status: 500 });
  }
}

/** POST /api/products/:id/variants — Create a new variant */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const variant = createVariant({
      product_id: id,
      name: body.name,
      content: body.content,
      is_control: body.is_control === true,
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    logger.error('Failed to create variant:', error);
    return NextResponse.json({ error: 'Failed to create variant' }, { status: 500 });
  }
}
