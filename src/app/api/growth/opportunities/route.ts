import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_PATH = join(process.env.HOME || '/Users/lilly', 'max/data/opportunity-queue.json');

export async function GET() {
  try {
    if (!existsSync(DATA_PATH)) {
      return NextResponse.json([]);
    }
    const raw = readFileSync(DATA_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Failed to read opportunity queue:', err);
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 });
  }
}
