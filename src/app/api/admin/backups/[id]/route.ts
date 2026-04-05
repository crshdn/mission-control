import { logger } from '@/lib/logger';
/**
 * DELETE /api/admin/backups/[id] — Delete a specific backup
 * 
 * The [id] parameter is the backup filename (URL-encoded).
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filename = decodeURIComponent(id);

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Missing backup filename' },
        { status: 400 }
      );
    }

    // Validate filename (basic security)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid backup filename' },
        { status: 400 }
      );
    }

    await deleteBackup(filename);

    return NextResponse.json({
      success: true,
      deleted: filename,
    });
  } catch (err) {
    logger.error('[API] Failed to delete backup:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete backup' },
      { status: 500 }
    );
  }
}
