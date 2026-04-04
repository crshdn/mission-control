/**
 * File Download API
 * Returns file content over HTTP from the server filesystem.
 * This enables remote agents to read files from
 * the Mission Control server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, statSync } from 'fs';
import path from 'path';
import { getProjectsPath } from '@/lib/config';
import { resolveDownloadTargetPath, resolveExistingBasePath } from '@/lib/server-file-access';

export const dynamic = 'force-dynamic';

// MIME types for common file extensions
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

/**
 * GET /api/files/download?path=...
 * Download a file from the projects directory
 *
 * Query params:
 *   - path: Full path (must be under PROJECTS_BASE)
 *   - relativePath: Path relative to PROJECTS_BASE (alternative to path)
 *   - raw: If 'true', returns raw file content; otherwise returns JSON wrapper
 */
export async function GET(request: NextRequest) {
  try {
    const projectsBase = resolveExistingBasePath(getProjectsPath(), 'PROJECTS_PATH');
    if (!projectsBase.ok) {
      return NextResponse.json({ error: projectsBase.error }, { status: projectsBase.status });
    }

    const searchParams = request.nextUrl.searchParams;
    const fullPathParam = searchParams.get('path');
    const relativePathParam = searchParams.get('relativePath');
    const raw = searchParams.get('raw') === 'true';

    const target = resolveDownloadTargetPath({
      fullPathParam,
      relativePathParam,
      base: projectsBase.value,
    });

    if (!target.ok) {
      return NextResponse.json({ error: target.error }, { status: target.status });
    }

    const targetPath = target.value.path;

    // Check it's a file, not a directory
    const stats = statSync(targetPath);
    if (stats.isDirectory()) {
      return NextResponse.json(
        { error: 'Path is a directory, not a file', path: targetPath },
        { status: 400 }
      );
    }

    // Determine content type
    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isText = contentType.startsWith('text/') ||
                   contentType === 'application/json' ||
                   contentType === 'application/javascript' ||
                   contentType === 'application/xml';

    // Read file
    const content = readFileSync(targetPath, isText ? 'utf-8' : undefined);

    console.log(`[FILE DOWNLOAD] Read: ${targetPath} (${stats.size} bytes)`);

    // Return raw content or JSON wrapper
    if (raw) {
      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stats.size),
        },
      });
    }

    // JSON response with metadata
    return NextResponse.json({
      success: true,
      path: targetPath,
      relativePath: target.value.relativePath,
      size: stats.size,
      contentType,
      content: isText ? content : Buffer.from(content).toString('base64'),
      encoding: isText ? 'utf-8' : 'base64',
      modifiedAt: stats.mtime.toISOString(),
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
