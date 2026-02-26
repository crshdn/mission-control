/**
 * File Preview API
 * Serves local files for preview (HTML and Markdown)
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// Simple markdown to HTML (basic formatting)
function markdownToHtml(md: string): string {
  const sanitizeHref = (href: string): string => {
    const trimmed = href.trim();
    const lowered = trimmed.toLowerCase();
    if (
      lowered.startsWith('http://') ||
      lowered.startsWith('https://') ||
      lowered.startsWith('mailto:') ||
      lowered.startsWith('/') ||
      lowered.startsWith('#')
    ) {
      return trimmed;
    }
    return '#';
  };

  const html = md
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, text, href) => `<a href="${sanitizeHref(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`,
    )
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px; 
      margin: 40px auto; 
      padding: 20px;
      background: #0d0d0d;
      color: #e0e0e0;
      line-height: 1.6;
    }
    h1, h2, h3 { color: #ff6b35; margin-top: 24px; }
    code { background: #1a1a1a; padding: 2px 6px; border-radius: 4px; }
    pre { background: #1a1a1a; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { padding: 0; }
    a { color: #4fc3f7; }
    strong { color: #fff; }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  // Allow HTML and Markdown files
  const ext = path.extname(filePath).toLowerCase();
  if (!['.html', '.htm', '.md', '.markdown'].includes(ext)) {
    return NextResponse.json({ error: 'Only HTML and Markdown files can be previewed' }, { status: 400 });
  }

  // Expand tilde and normalize
  const expandedPath = filePath.replace(/^~/, process.env.HOME || '');
  const normalizedPath = path.normalize(expandedPath);

  // Security check - only allow paths from environment config
  const allowedPaths = [
    process.env.WORKSPACE_BASE_PATH?.replace(/^~/, process.env.HOME || ''),
    process.env.PROJECTS_PATH?.replace(/^~/, process.env.HOME || ''),
  ].filter(Boolean) as string[];

  const isAllowed = allowedPaths.some(allowed =>
    normalizedPath.startsWith(path.normalize(allowed))
  );

  if (!isAllowed) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  if (!existsSync(normalizedPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const content = readFileSync(normalizedPath, 'utf-8');
    
    // Convert markdown to HTML if needed
    const isMarkdown = ['.md', '.markdown'].includes(ext);
    const html = isMarkdown ? markdownToHtml(content) : content;
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('[FILE] Error reading file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
