import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { updateCostCap, deleteCostCap } from '@/lib/costs/caps';
import { UpdateCostCapSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = UpdateCostCapSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.issues }, { status: 400 });
    }
    const cap = updateCostCap(id, validation.data);
    if (!cap) return NextResponse.json({ error: 'Cost cap not found' }, { status: 404 });
    return NextResponse.json(cap);
  } catch (error) {
    logger.error('Failed to update cost cap:', error);
    return NextResponse.json({ error: 'Failed to update cost cap' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deleteCostCap(id);
    if (!deleted) return NextResponse.json({ error: 'Cost cap not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete cost cap:', error);
    return NextResponse.json({ error: 'Failed to delete cost cap' }, { status: 500 });
  }
}
