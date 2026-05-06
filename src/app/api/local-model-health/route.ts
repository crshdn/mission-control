import { NextResponse } from 'next/server';
import fs from 'fs/promises';

const HEALTH_PATH = '/Users/lilly/clawd/monitoring/local-model-health.json';

export async function GET() {
  try {
    const raw = await fs.readFile(HEALTH_PATH, 'utf8');
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        checkedAt: null,
        models: [],
        error: 'Local model health data unavailable',
      },
      { status: 503 }
    );
  }
}
