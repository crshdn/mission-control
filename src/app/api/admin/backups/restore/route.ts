import { logger } from '@/lib/logger';
/**
 * POST /api/admin/backups/restore — Restore from a specific backup
 * 
 * Body: { filename: string }
 * 
 * Safety: always creates a pre-restore backup of the current database
 * before overwriting with the selected backup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { restoreBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename } = body;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: filename' },
        { status: 400 }
      );
    }

    // Validate filename format (basic security check)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid backup filename' },
        { status: 400 }
      );
    }

    const result = await restoreBackup(filename);

    return NextResponse.json({
      success: true,
      restored: result.restored,
      safetyBackup: result.safetyBackup,
      message: `Database restored from ${result.restored}. Safety backup created: ${result.safetyBackup}`,
    });
  } catch (err) {
    logger.error('[API] Failed to restore backup:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to restore backup' },
      { status: 500 }
    );
  }
}
