import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface Document {
  id: string;
  title: string;
  path: string;
  content: string;
  category: 'research' | 'briefs' | 'specs' | 'reports' | 'memory' | 'other';
  agent: string;
  project?: string;
  created_at: string;
  modified_at: string;
  word_count: number;
  file_size: number;
}

const SCAN_DIRECTORIES = [
  { path: '/Users/lilly/clawd/squad/research', category: 'research' as const },
  { path: '/Users/lilly/clawd/squad/briefs', category: 'briefs' as const },
  { path: '/Users/lilly/clawd/projects', category: 'specs' as const },
  { path: '/Users/lilly/clawd/memory', category: 'memory' as const },
];

function extractMetadata(filePath: string, content: string, category: string): Partial<Document> {
  const fileName = path.basename(filePath, '.md');
  const stats = fs.statSync(filePath);
  
  // Extract title from first H1 or use filename
  let title = fileName;
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    title = h1Match[1].trim();
  }

  // Extract agent name from content or path
  let agent = 'Unknown';
  
  // Look for agent mentions in content
  const agentPatterns = [
    /Author[:\s]+([A-Z][a-z]+)/i,
    /Agent[:\s]+([A-Z][a-z]+)/i,
    /By[:\s]+([A-Z][a-z]+)/i,
    /(Mason|Vale|Riff|Polly|Archie|Bob|Ged|Lilly)/g,
  ];
  
  for (const pattern of agentPatterns) {
    const match = content.match(pattern);
    if (match) {
      agent = match[1] || match[0];
      break;
    }
  }

  // Extract project from path
  let project = undefined;
  if (filePath.includes('/projects/')) {
    const projectMatch = filePath.match(/\/projects\/([^\/]+)/);
    if (projectMatch) {
      project = projectMatch[1];
    }
  }

  // Count words (simple approximation)
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

  return {
    title,
    agent,
    project,
    word_count: wordCount,
    file_size: stats.size,
    created_at: stats.birthtime.toISOString(),
    modified_at: stats.mtime.toISOString(),
  };
}

function scanDirectory(dirPath: string, category: string): Document[] {
  const documents: Document[] = [];

  if (!fs.existsSync(dirPath)) {
    console.warn(`Directory does not exist: ${dirPath}`);
    return documents;
  }

  try {
    const scanRecursively = (currentPath: string) => {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanRecursively(entryPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const content = fs.readFileSync(entryPath, 'utf-8');
            const metadata = extractMetadata(entryPath, content, category);
            
            documents.push({
              id: crypto.createHash('md5').update(entryPath).digest('hex'),
              path: entryPath,
              content,
              category: category as any,
              ...metadata,
            } as Document);
          } catch (error) {
            console.error(`Failed to read file ${entryPath}:`, error);
          }
        }
      }
    }

    scanRecursively(dirPath);
  } catch (error) {
    console.error(`Failed to scan directory ${dirPath}:`, error);
  }

  return documents;
}

export async function GET(request: NextRequest) {
  try {
    // Check if we have cached data
    const cacheFile = path.join(process.cwd(), '.next/cache/docs-library.json');
    let cachedData = null;
    let lastScan = new Date(0);

    try {
      if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        cachedData = cached.documents;
        lastScan = new Date(cached.lastScan);
      }
    } catch (error) {
      console.warn('Failed to read cached docs data:', error);
    }

    // Return cached data if it's less than 5 minutes old
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (cachedData && lastScan > fiveMinutesAgo) {
      return NextResponse.json({
        documents: cachedData,
        lastScan: lastScan.toISOString(),
        fromCache: true,
      });
    }

    // Scan directories for new data
    const allDocuments: Document[] = [];

    for (const { path: dirPath, category } of SCAN_DIRECTORIES) {
      const documents = scanDirectory(dirPath, category);
      allDocuments.push(...documents);
    }

    // Sort by most recently modified
    allDocuments.sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    // Cache the results
    try {
      const cacheDir = path.dirname(cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      fs.writeFileSync(cacheFile, JSON.stringify({
        documents: allDocuments,
        lastScan: new Date().toISOString(),
      }, null, 2));
    } catch (error) {
      console.error('Failed to cache docs data:', error);
    }

    return NextResponse.json({
      documents: allDocuments,
      lastScan: new Date().toISOString(),
      fromCache: false,
    });
  } catch (error) {
    console.error('Docs library error:', error);
    return NextResponse.json({ error: 'Failed to fetch document library' }, { status: 500 });
  }
}