import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const BRAIN_DIR = '/Users/nithis4th/.openclaw/workspace/second-brain';

export async function GET(
  _request: Request,
  { params }: { params: { slug: string[] } }
) {
  try {
    const slug = params.slug.join('/');
    const fullPath = path.join(BRAIN_DIR, `${slug}.md`);

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const fileContent = fs.readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(fileContent);

    return NextResponse.json({
      id: slug,
      title: data.title || slug.split('/').pop() || slug,
      date: data.date
        ? data.date instanceof Date
          ? data.date.toISOString().split('T')[0]
          : String(data.date)
        : '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      type: data.type || 'concept',
      content: content.trim(),
    });
  } catch (error) {
    console.error('Failed to read brain document:', error);
    return NextResponse.json({ error: 'Failed to read document' }, { status: 500 });
  }
}
