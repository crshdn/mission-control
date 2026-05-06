import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';

const LIBRARY_PATH = '/Users/lilly/clawd/tools/library/data.json';

export interface LibraryItem {
  id: string;
  title: string;
  content: string;
  type: 'research' | 'marketing' | 'reference' | 'chat-message' | 'url' | 'note';
  source: string;
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

async function readLibrary(): Promise<{ items: LibraryItem[] }> {
  try {
    const content = await readFile(LIBRARY_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return { items: [] };
  }
}

async function writeLibrary(data: { items: LibraryItem[] }): Promise<void> {
  await writeFile(LIBRARY_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const data = await readLibrary();
  const item = data.items.find(item => item.id === params.id);
  
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  
  return NextResponse.json(item);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const data = await readLibrary();
  
  const itemIndex = data.items.findIndex(item => item.id === params.id);
  if (itemIndex === -1) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  
  const updatedItem = {
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
  
  data.items[itemIndex] = updatedItem;
  await writeLibrary(data);
  
  return NextResponse.json(updatedItem);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const data = await readLibrary();
  
  const itemIndex = data.items.findIndex(item => item.id === params.id);
  if (itemIndex === -1) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  
  const deletedItem = data.items.splice(itemIndex, 1)[0];
  await writeLibrary(data);
  
  return NextResponse.json(deletedItem);
}