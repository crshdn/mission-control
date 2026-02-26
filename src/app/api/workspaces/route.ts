import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Workspace, WorkspaceStats, TaskStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/workspaces - List all workspaces with stats
export async function GET(request: NextRequest) {
  const includeStats = request.nextUrl.searchParams.get('stats') === 'true';

  try {
    const db = getDb();
    
    if (includeStats) {
      // Get workspaces with task counts and agent counts
      const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY name').all() as Workspace[];
      
      const stats: WorkspaceStats[] = workspaces.map(workspace => {
        // Get task counts by status
        const taskCounts = db.prepare(`
          SELECT status, COUNT(*) as count 
          FROM tasks 
          WHERE workspace_id = ? 
          GROUP BY status
        `).all(workspace.id) as { status: TaskStatus; count: number }[];
        
        const counts: WorkspaceStats['taskCounts'] = {
          planning: 0,
          inbox: 0,
          assigned: 0,
          in_progress: 0,
          testing: 0,
          review: 0,
          done: 0,
          total: 0
        };
        
        taskCounts.forEach(tc => {
          counts[tc.status] = tc.count;
          counts.total += tc.count;
        });
        
        // Get agent count
        const agentCount = db.prepare(
          'SELECT COUNT(*) as count FROM agents WHERE workspace_id = ?'
        ).get(workspace.id) as { count: number };
        
        return {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          icon: workspace.icon,
          taskCounts: counts,
          agentCount: agentCount.count
        };
      });
      
      return NextResponse.json(stats);
    }
    
    const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY name').all();
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Failed to fetch workspaces:', error);
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
  }
}

// POST /api/workspaces - Create a new workspace
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, icon } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const slug = generateSlug(name);
    
    // Check if slug already exists
    const existing = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(slug);
    if (existing) {
      return NextResponse.json({ error: 'A workspace with this name already exists' }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO workspaces (id, name, slug, description, icon)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name.trim(), slug, description || null, icon || '📁');

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    console.error('Failed to create workspace:', error);
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }
}
