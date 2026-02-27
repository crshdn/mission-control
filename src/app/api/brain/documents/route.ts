import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const BRAIN_DIR = '/Users/nithis4th/.openclaw/workspace/second-brain';

function getMarkdownFiles(dir: string, baseDir: string = dir): Array<{
  id: string;
  title: string;
  date: string;
  tags: string[];
  type: string;
  path: string;
}> {
  const results: Array<{
    id: string;
    title: string;
    date: string;
    tags: string[];
    type: string;
    path: string;
  }> = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getMarkdownFiles(fullPath, baseDir));
    } else if (entry.name.endsWith('.md')) {
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const { data } = matter(fileContent);
        const relativePath = path.relative(baseDir, fullPath);
        const id = relativePath.replace(/\.md$/, '');

        results.push({
          id,
          title: data.title || entry.name.replace(/\.md$/, ''),
          date: data.date
            ? data.date instanceof Date
              ? data.date.toISOString().split('T')[0]
              : String(data.date)
            : '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          type: data.type || 'concept',
          path: relativePath,
        });
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  return results;
}

export async function GET() {
  try {
    const documents = getMarkdownFiles(BRAIN_DIR);
    // Sort by date descending
    documents.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return NextResponse.json(documents);
  } catch (error) {
    console.error('Failed to list brain documents:', error);
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: docPath, title, date, tags, type, content } = body;

    if (!docPath || !title || !content) {
      return NextResponse.json(
        { error: 'path, title, and content are required' },
        { status: 400 }
      );
    }

    const fullPath = path.join(BRAIN_DIR, docPath.endsWith('.md') ? docPath : `${docPath}.md`);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Build frontmatter
    const frontmatter = {
      title,
      date: date || new Date().toISOString().split('T')[0],
      tags: tags || [],
      type: type || 'concept',
    };

    const fileContent = matter.stringify(content, frontmatter);
    fs.writeFileSync(fullPath, fileContent, 'utf-8');

    const relativePath = path.relative(BRAIN_DIR, fullPath);
    const id = relativePath.replace(/\.md$/, '');

    return NextResponse.json({ id, ...frontmatter, path: relativePath }, { status: 201 });
  } catch (error) {
    console.error('Failed to create brain document:', error);
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
  }
}
