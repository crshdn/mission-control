import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const IMPROVEMENTS_PATH = '/Users/lilly/clawd/agents/polly/memory/system-improvements.md';

export async function GET() {
  try {
    const improvements: any[] = [];
    
    if (!fs.existsSync(IMPROVEMENTS_PATH)) {
      // Check alternative paths
      const altPaths = [
        '/Users/lilly/clawd/memory/system-improvements.md',
        '/Users/lilly/clawd/squad/system-improvements.md'
      ];
      
      for (const altPath of altPaths) {
        if (fs.existsSync(altPath)) {
          return parseImprovementsFile(altPath);
        }
      }
      
      return NextResponse.json({ 
        improvements: [], 
        message: 'No system-improvements.md found',
        searchedPaths: [IMPROVEMENTS_PATH, ...altPaths]
      });
    }
    
    return parseImprovementsFile(IMPROVEMENTS_PATH);
  } catch (error) {
    console.error('Self-healing API error:', error);
    return NextResponse.json({ improvements: [], error: String(error) });
  }
}

function parseImprovementsFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const improvements: any[] = [];
  
  // Parse markdown sections - look for headers with dates or improvement descriptions
  const sections = content.split(/^##\s+/m).filter(s => s.trim());
  
  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0]?.trim();
    if (!title) continue;
    
    // Try to extract date from title
    const dateMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
    
    improvements.push({
      id: improvements.length + 1,
      title: title,
      date: dateMatch ? dateMatch[1] : null,
      content: lines.slice(1).join('\n').trim().substring(0, 200),
      severity: title.toLowerCase().includes('critical') ? 'critical' : 
                title.toLowerCase().includes('fix') ? 'high' : 'medium'
    });
  }
  
  return NextResponse.json({ 
    improvements,
    source: filePath,
    total: improvements.length
  });
}
