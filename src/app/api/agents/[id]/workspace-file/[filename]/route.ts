import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { queryOne } from '@/lib/db';
import type { Agent } from '@/lib/types';

// GET /api/agents/[id]/workspace-file/[filename] - Read workspace file directly
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  try {
    const { id, filename } = await params;

    // Validate filename - only allow specific markdown files
    const allowedFiles = ['SOUL.md', 'USER.md', 'AGENTS.md'];
    if (!allowedFiles.includes(filename)) {
      return NextResponse.json(
        { error: 'Invalid filename. Only SOUL.md, USER.md, and AGENTS.md are allowed.' },
        { status: 400 }
      );
    }

    // Get agent details
    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Map gateway_agent_id to actual directory names
    // Most match, but some don't (e.g., "dispatcher" -> "polly")
    const dirMapping: Record<string, string> = {
      'dispatcher': 'polly',
      // Add others here if needed
    };
    
    const gatewayId = agent.gateway_agent_id || agent.name.toLowerCase();
    const agentDirName = dirMapping[gatewayId] || gatewayId;
    const workspacePath = `/Users/lilly/clawd/agents/${agentDirName}`;
    const filePath = join(workspacePath, filename);

    try {
      const content = readFileSync(filePath, 'utf-8');
      return NextResponse.json({
        content,
        filename,
        agentName: agent.name,
        lastModified: Date.now(), // Could use fs.statSync for real last modified time
      });
    } catch (fileError) {
      // File doesn't exist or can't be read
      console.warn(`Workspace file not found: ${filePath}`, fileError);
      return NextResponse.json(
        {
          content: null,
          filename,
          agentName: agent.name,
          error: `File not found: ${filename}`,
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Failed to read workspace file:', error);
    return NextResponse.json({ error: 'Failed to read workspace file' }, { status: 500 });
  }
}