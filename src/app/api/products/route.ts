import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createProduct, listProducts } from '@/lib/autopilot/products';
import { CreateProductSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || undefined;
    const products = listProducts(workspaceId);
    return NextResponse.json(products);
  } catch (error) {
    logger.error('Failed to list products:', error);
    return NextResponse.json({ error: 'Failed to list products' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CreateProductSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const product = createProduct(validation.data);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    logger.error('Failed to create product:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
