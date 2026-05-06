import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const taskCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM tasks');
    const agentCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM agents');

    return NextResponse.json({
      status: 'ok',
      service: 'mission-control',
      tasks: taskCount?.count ?? 0,
      agents: agentCount?.count ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        service: 'mission-control',
        error: 'Database check failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
