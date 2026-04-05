import { logger } from '@/lib/logger';
/**
 * GET  /api/admin/backups — List all available backups (local + S3)
 * POST /api/admin/backups — Create a new on-demand backup
 */

import { NextResponse } from 'next/server';
import {
  createBackup,
  listBackups,
  listS3Backups,
  isS3Configured,
  getS3Status,
} from '@/lib/backup';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — List backups
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const [localBackups, s3Backups] = await Promise.all([
      listBackups(),
      listS3Backups(),
    ]);

    // Merge local and S3: if a backup exists in both, mark as 'both'
    const s3Map = new Map(s3Backups.map(b => [b.filename, b]));
    const merged = localBackups.map(b => {
      if (s3Map.has(b.filename)) {
        s3Map.delete(b.filename);
        return { ...b, location: 'both' as const };
      }
      return b;
    });

    // Add S3-only backups
    s3Map.forEach((s3Backup) => {
      merged.push(s3Backup);
    });

    // Sort newest first
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      backups: merged,
      total: merged.length,
      s3: getS3Status(),
    });
  } catch (err) {
    logger.error('[API] Failed to list backups:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list backups' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Create backup
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const result = await createBackup();

    return NextResponse.json({
      success: true,
      backup: result.backup,
      s3Uploaded: result.s3Uploaded,
      s3Error: result.s3Error,
    }, { status: 201 });
  } catch (err) {
    logger.error('[API] Failed to create backup:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create backup' },
      { status: 500 }
    );
  }
}
