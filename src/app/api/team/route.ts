import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const AGENTS_DIR = '/Users/lilly/clawd/agents';

export async function GET() {
  try {
    const agents: any[] = [];
    
    if (!fs.existsSync(AGENTS_DIR)) {
      return NextResponse.json({ agents: [], error: 'Agents directory not found' });
    }
    
    const dirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    for (const dir of dirs) {
      const soulPath = path.join(AGENTS_DIR, dir, 'SOUL.md');
      if (fs.existsSync(soulPath)) {
        const content = fs.readFileSync(soulPath, 'utf-8');
        
        // Extract name from first heading or directory name
        const nameMatch = content.match(/^#\s+(.+)/m);
        const name = nameMatch ? nameMatch[1].split(' ')[0] : dir;
        
        // Extract role from content
        const roleMatch = content.match(/role[:\s]+([^\n]+)/i) || 
                         content.match(/You are[:\s]+([^\n.]+)/i);
        const role = roleMatch ? roleMatch[1].trim() : 'Agent';
        
        agents.push({
          id: dir,
          name: name,
          role: role.substring(0, 50),
          status: 'active',
          soulPath: soulPath
        });
      }
    }
    
    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Team API error:', error);
    return NextResponse.json({ agents: [], error: String(error) });
  }
}
