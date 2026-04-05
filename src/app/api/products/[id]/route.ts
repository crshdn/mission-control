import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getProduct, updateProduct, archiveProduct } from '@/lib/autopilot/products';
import { UpdateProductSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = getProduct(id);
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    logger.error('Failed to fetch product:', error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = UpdateProductSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const product = updateProduct(id, validation.data);
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    logger.error('Failed to update product:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = archiveProduct(id);
    if (!deleted) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to archive product:', error);
    return NextResponse.json({ error: 'Failed to archive product' }, { status: 500 });
  }
}
