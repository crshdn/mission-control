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
    
    const fullContent = lines.slice(1).join('\n').trim();
    
    // Extract gap detected - get first line after **Gap Detected**
    const gapMatch = fullContent.match(/\*\*Gap Detected[:\*]*\*?\s*([^\n]+)/);
    const gapDetected = gapMatch ? gapMatch[1].trim() : title;
    
    // Extract root cause(s) - look for bullet points after Root Cause
    const rootCauseSection = fullContent.split(/\*\*Root Cause/i)[1]?.split(/\*\*Self-Healing|\*\*Action/i)[0] || '';
    const rootCause = rootCauseSection
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line.length > 0);
    
    // Extract actions - look for numbered items after Actions
    const actionsSection = fullContent.split(/\*\*(?:Self-Healing )?Actions?/i)[1]?.split(/\*\*Result/i)[0] || '';
    const actions = actionsSection
      .split('\n')
      .filter(line => line.trim().match(/^\d+\.|^-/))
      .map(line => line.replace(/^\d+\.\s*|-\s*/, '').trim())
      .filter(line => line.length > 0);
    
    // Determine type
    let type: 'process' | 'technical' | 'policy' | 'automation' = 'process';
    if (fullContent.includes('technical') || fullContent.includes('code')) type = 'technical';
    else if (fullContent.includes('policy') || fullContent.includes('authority')) type = 'policy';
    else if (fullContent.includes('auto') || fullContent.includes('monitoring')) type = 'automation';
    
    improvements.push({
      id: String(improvements.length + 1),
      timestamp: dateMatch ? `${dateMatch[1]}T00:00:00Z` : new Date().toISOString(),
      title: title,
      gapDetected: gapDetected.substring(0, 200),
      rootCause: rootCause.length > 0 ? rootCause : ['See details'],
      actions: actions.length > 0 ? actions : ['See details'],
      outcome: fullContent.includes('Result') ? 'Documented' : undefined,
      type: type,
      severity: title.toLowerCase().includes('critical') ? 'critical' : 
                title.toLowerCase().includes('fix') || title.toLowerCase().includes('high') ? 'high' : 'medium'
    });
  }
  
  return NextResponse.json({ 
    improvements,
    source: filePath,
    total: improvements.length
  });
}
