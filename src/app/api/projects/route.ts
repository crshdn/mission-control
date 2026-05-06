import { NextResponse } from 'next/server';
import { queryAll, queryOne, run, getDb } from '@/lib/db';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'shelved' | 'not_started';
  category: 'web' | 'mobile' | 'saas' | 'game' | 'extension' | 'other';
  progress: number; // 0-100
  priority: 'high' | 'medium' | 'low';
  created_at?: string;
  updated_at?: string;
}

// Seed data - Ged's actual projects
const SEED_PROJECTS: Omit<Project, 'created_at' | 'updated_at'>[] = [
  {
    id: 'atelier-tools',
    name: 'Atelier Tools',
    description: 'Web tools collection (250+ tools)',
    status: 'active',
    category: 'web',
    progress: 75,
    priority: 'high',
  },
  {
    id: 'atelier-saas',
    name: 'Atelier SaaS',
    description: 'SaaS version of Atelier Tools',
    status: 'not_started',
    category: 'saas',
    progress: 0,
    priority: 'medium',
  },
  {
    id: 'ahoy-vibe',
    name: 'Ahoy Vibe',
    description: 'Agency website',
    status: 'active',
    category: 'web',
    progress: 60,
    priority: 'medium',
  },
  {
    id: 'do-this-one',
    name: 'Do This One',
    description: 'ADHD Prioritiser mobile app',
    status: 'shelved',
    category: 'mobile',
    progress: 40,
    priority: 'low',
  },
  {
    id: 'overboard',
    name: 'Overboard',
    description: 'Web/mobile game',
    status: 'active',
    category: 'game',
    progress: 20,
    priority: 'medium',
  },
  {
    id: 'ahoy-game',
    name: 'Ahoy',
    description: 'Mobile game',
    status: 'active',
    category: 'game',
    progress: 30,
    priority: 'medium',
  },
  {
    id: 'warriner',
    name: 'Warriner',
    description: 'Careers - ready for work project',
    status: 'active',
    category: 'web',
    progress: 50,
    priority: 'medium',
  },
  {
    id: 'sell-your-soul',
    name: 'SellYourSoul.ai',
    description: 'Agent marketplace',
    status: 'shelved',
    category: 'saas',
    progress: 10,
    priority: 'low',
  },
  {
    id: 'izzy',
    name: 'Izzy',
    description: 'Muted project - ongoing',
    status: 'active',
    category: 'other',
    progress: 40,
    priority: 'medium',
  },
  {
    id: 'tab-pouch',
    name: 'Tab Pouch',
    description: 'Browser extension',
    status: 'completed',
    category: 'extension',
    progress: 100,
    priority: 'low',
  },
];

// Ensure projects table exists and is seeded
function ensureProjectsTable() {
  const db = getDb();
  
  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      category TEXT DEFAULT 'other',
      progress INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Seed if empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number };
  if (count.cnt === 0) {
    const insert = db.prepare(`
      INSERT INTO projects (id, name, description, status, category, progress, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const project of SEED_PROJECTS) {
      insert.run(
        project.id,
        project.name,
        project.description,
        project.status,
        project.category,
        project.progress,
        project.priority
      );
    }
  }
}

export async function GET() {
  try {
    ensureProjectsTable();
    
    const projects = queryAll<Project>(`
      SELECT * FROM projects 
      ORDER BY 
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        CASE status WHEN 'active' THEN 1 WHEN 'paused' THEN 2 WHEN 'not_started' THEN 3 ELSE 4 END,
        name ASC
    `);
    
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Projects API error:', error);
    return NextResponse.json({ projects: [], error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    ensureProjectsTable();
    
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }
    
    const allowedFields = ['name', 'description', 'status', 'category', 'progress', 'priority'];
    const setClause: string[] = [];
    const values: any[] = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (setClause.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }
    
    setClause.push('updated_at = datetime("now")');
    values.push(id);
    
    run(`UPDATE projects SET ${setClause.join(', ')} WHERE id = ?`, values);
    
    const updated = queryOne<Project>('SELECT * FROM projects WHERE id = ?', [id]);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Projects update error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
