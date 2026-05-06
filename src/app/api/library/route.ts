import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const LIBRARY_PATH = '/Users/lilly/clawd/tools/library/data.json';
const LIBRARY_DIR = path.dirname(LIBRARY_PATH);

export interface LibraryItem {
  id: string;
  title: string;
  content: string;
  type: 'research' | 'marketing' | 'reference' | 'chat-message' | 'url' | 'note';
  source: string; // Vale report, chat link, URL, etc.
  tags: string[];
  folder: string;
  createdAt: string;
  updatedAt: string;
  priority: 'high' | 'normal' | 'low';
  status: 'active' | 'archived';
  metadata: {
    url?: string;
    chatId?: string;
    messageId?: string;
    agentId?: string;
    wordCount?: number;
    preview?: string;
  };
}

async function ensureLibraryDir(): Promise<void> {
  try {
    await mkdir(LIBRARY_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

async function readLibrary(): Promise<{ items: LibraryItem[] }> {
  try {
    await ensureLibraryDir();
    const content = await readFile(LIBRARY_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading library:', error);
    return { items: [] };
  }
}

async function writeLibrary(data: { items: LibraryItem[] }): Promise<void> {
  try {
    await ensureLibraryDir();
    await writeFile(LIBRARY_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing library:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get('folder');
  const tag = searchParams.get('tag');
  const type = searchParams.get('type');
  const search = searchParams.get('search');

  const data = await readLibrary();
  let items = data.items;

  // Apply filters
  if (folder && folder !== 'all') {
    items = items.filter(item => item.folder === folder);
  }
  
  if (tag) {
    items = items.filter(item => item.tags.includes(tag));
  }
  
  if (type && type !== 'all') {
    items = items.filter(item => item.type === type);
  }
  
  if (search) {
    const searchLower = search.toLowerCase();
    items = items.filter(item => 
      item.title.toLowerCase().includes(searchLower) ||
      item.content.toLowerCase().includes(searchLower) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  }

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const data = await readLibrary();
  
  const newItem: LibraryItem = {
    id: body.id || crypto.randomUUID(),
    title: body.title,
    content: body.content,
    type: body.type || 'note',
    source: body.source || 'manual',
    tags: body.tags || [],
    folder: body.folder || 'inbox',
    priority: body.priority || 'normal',
    status: body.status || 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      ...body.metadata,
      wordCount: body.content.split(/\s+/).length,
      preview: body.content.substring(0, 200) + (body.content.length > 200 ? '...' : '')
    }
  };
  
  data.items.push(newItem);
  await writeLibrary(data);
  
  return NextResponse.json(newItem, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const data = await readLibrary();
  
  const itemIndex = data.items.findIndex(item => item.id === body.id);
  if (itemIndex === -1) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  
  data.items[itemIndex] = {
    ...data.items[itemIndex],
    ...body,
    updatedAt: new Date().toISOString(),
    metadata: {
      ...data.items[itemIndex].metadata,
      ...body.metadata,
      wordCount: body.content ? body.content.split(/\s+/).length : data.items[itemIndex].metadata.wordCount,
      preview: body.content ? 
        body.content.substring(0, 200) + (body.content.length > 200 ? '...' : '') :
        data.items[itemIndex].metadata.preview
    }
  };
  
  await writeLibrary(data);
  
  return NextResponse.json(data.items[itemIndex]);
}