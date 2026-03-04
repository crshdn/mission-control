import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    // Force a fresh scan by removing the cache
    const cacheFile = path.join(process.cwd(), '.next/cache/docs-library.json');
    
    try {
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    } catch (error) {
      console.warn('Failed to remove cache file:', error);
    }

    // Trigger a fresh scan by calling the library endpoint
    const baseUrl = request.nextUrl.origin;
    const response = await fetch(`${baseUrl}/api/docs/library`);
    
    if (!response.ok) {
      throw new Error('Failed to trigger document scan');
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Document scan completed',
      documentsFound: data.documents?.length || 0,
      lastScan: data.lastScan,
    });
  } catch (error) {
    console.error('Document scan error:', error);
    return NextResponse.json({ error: 'Failed to trigger document scan' }, { status: 500 });
  }
}