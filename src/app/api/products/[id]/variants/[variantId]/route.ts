import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getVariant, updateVariant, deleteVariant } from '@/lib/autopilot/ab-testing';

export const dynamic = 'force-dynamic';

/** GET /api/products/:id/variants/:variantId — Get a single variant */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id, variantId } = await params;
    const variant = getVariant(variantId);
    if (!variant || variant.product_id !== id) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }
    return NextResponse.json(variant);
  } catch (error) {
    logger.error('Failed to get variant:', error);
    return NextResponse.json({ error: 'Failed to get variant' }, { status: 500 });
  }
}

/** PATCH /api/products/:id/variants/:variantId — Update a variant */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id, variantId } = await params;
    const body = await request.json();

    const existing = getVariant(variantId);
    if (!existing || existing.product_id !== id) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    const updated = updateVariant(variantId, {
      name: body.name,
      content: body.content,
    });
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Failed to update variant:', error);
    return NextResponse.json({ error: 'Failed to update variant' }, { status: 500 });
  }
}

/** DELETE /api/products/:id/variants/:variantId — Delete a variant */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id, variantId } = await params;
    const existing = getVariant(variantId);
    if (!existing || existing.product_id !== id) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    const result = deleteVariant(variantId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete variant:', error);
    return NextResponse.json({ error: 'Failed to delete variant' }, { status: 500 });
  }
}
