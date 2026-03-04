import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const PROJECTS_DIR = '/Users/lilly/clawd/projects';

export async function GET() {
  try {
    const projects: any[] = [];
    
    if (!fs.existsSync(PROJECTS_DIR)) {
      return NextResponse.json({ projects: [], error: 'Projects directory not found' });
    }
    
    const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    for (const dir of dirs) {
      const projectPath = path.join(PROJECTS_DIR, dir);
      const projectJsonPath = path.join(projectPath, 'project.json');
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      let projectData: any = {
        id: dir,
        name: dir,
        path: projectPath,
        progress: 0,
        status: 'unknown'
      };
      
      // Try project.json first
      if (fs.existsSync(projectJsonPath)) {
        try {
          const json = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
          projectData = { ...projectData, ...json };
        } catch (e) {}
      }
      // Fall back to package.json for name
      else if (fs.existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          projectData.name = pkg.name || dir;
          projectData.status = 'active';
        } catch (e) {}
      }
      
      // Get last modified time
      const stats = fs.statSync(projectPath);
      projectData.lastModified = stats.mtime.toISOString();
      
      projects.push(projectData);
    }
    
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Projects API error:', error);
    return NextResponse.json({ projects: [], error: String(error) });
  }
}
