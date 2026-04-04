/**
 * File Preview API
 * Serves local files for preview (HTML only for security)
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { getProjectsPath, getWorkspaceBasePath } from '@/lib/config';
import { resolvePreviewPath, resolvePreviewRoots } from '@/lib/server-file-access';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  // Only allow HTML files
  if (!filePath.endsWith('.html') && !filePath.endsWith('.htm')) {
    return NextResponse.json({ error: 'Only HTML files can be previewed' }, { status: 400 });
  }

  const allowedRoots = resolvePreviewRoots([
    { label: 'WORKSPACE_BASE_PATH', path: getWorkspaceBasePath() },
    { label: 'PROJECTS_PATH', path: getProjectsPath() },
  ]);

  if (!allowedRoots.ok) {
    return NextResponse.json({ error: allowedRoots.error }, { status: allowedRoots.status });
  }

  const previewPath = resolvePreviewPath(filePath, allowedRoots.value);
  if (!previewPath.ok) {
    return NextResponse.json({ error: previewPath.error }, { status: previewPath.status });
  }

  try {
    const content = readFileSync(previewPath.value, 'utf-8');
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('[FILE] Error reading file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
