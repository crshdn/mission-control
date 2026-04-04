import { NextRequest, NextResponse } from 'next/server';
import { complete } from '@/lib/autopilot/llm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { repo_url, live_url, name } = await request.json();

    if (!repo_url && !live_url) {
      return NextResponse.json({ error: 'Provide a repo URL or live URL' }, { status: 400 });
    }

    // Gather context from both sources
    const context: string[] = [];

    // 1. Try to get README from repo
    if (repo_url) {
      const match = repo_url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
      if (match) {
        const [, owner, repo] = match;

        // Try GitHub API first
        try {
          const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
            headers: { 'Accept': 'application/vnd.github.raw+json', 'User-Agent': 'Autensa/2.0' },
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) {
            const readme = await res.text();
            context.push(`## README.md from ${repo_url}\n${readme.slice(0, 8000)}`);
          }
        } catch { /* ignore */ }

        // Try local filesystem if GitHub didn't work
        if (context.length === 0) {
          try {
            const fs = await import('fs');
            const path = await import('path');
            const homeDir = process.env.HOME || '/Users/nomames';
            const candidates = [
              path.join(homeDir, 'projects', repo, 'README.md'),
              path.join(homeDir, 'projects', repo.toLowerCase(), 'README.md'),
            ];
            for (const p of candidates) {
              if (fs.existsSync(p)) {
                const readme = fs.readFileSync(p, 'utf-8');
                context.push(`## README.md from local repo (${p})\n${readme.slice(0, 8000)}`);
                break;
              }
            }
          } catch { /* ignore */ }
        }

        // Also check for AGENTS.md in the agents directory
        try {
          const fs = await import('fs');
          const path = await import('path');
          const homeDir = process.env.HOME || '/Users/nomames';
          // Check common agent directory patterns
          const agentDirs = [
            path.join(homeDir, 'agents', repo),
            path.join(homeDir, 'agents', repo.toLowerCase()),
          ];
          for (const dir of agentDirs) {
            const agentsFile = path.join(dir, 'AGENTS.md');
            if (fs.existsSync(agentsFile)) {
              const agentsMd = fs.readFileSync(agentsFile, 'utf-8');
              context.push(`## AGENTS.md (project agent config)\n${agentsMd.slice(0, 4000)}`);
              break;
            }
          }
        } catch { /* ignore */ }
      }
    }

    // 2. Try to fetch live website
    if (live_url) {
      try {
        const res = await fetch(live_url, {
          headers: { 'User-Agent': 'Autensa/2.0' },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const html = await res.text();
          // Extract text content — strip tags, collapse whitespace
          const textContent = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 6000);
          context.push(`## Website content from ${live_url}\n${textContent}`);

          // Also grab meta description and title
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
          const metaParts: string[] = [];
          if (titleMatch) metaParts.push(`Title: ${titleMatch[1].trim()}`);
          if (metaDescMatch) metaParts.push(`Meta description: ${metaDescMatch[1].trim()}`);
          if (metaParts.length > 0) {
            context.push(`## Website metadata\n${metaParts.join('\n')}`);
          }
        }
      } catch { /* ignore */ }
    }

    if (context.length === 0) {
      return NextResponse.json(
        { error: 'Could not fetch any content from the provided URLs. Repo may be private and not found locally.' },
        { status: 404 }
      );
    }

    // 3. Ask the LLM to generate a description
    const prompt = `Based on the following information about a software product${name ? ` called "${name}"` : ''}, write a concise 1-2 sentence product description. Be specific about what the product does, who it's for, and what makes it valuable. No fluff, no marketing buzzwords. Just a clear, direct description.

${context.join('\n\n')}

Respond with ONLY the description text, nothing else. No quotes, no labels, no markdown.`;

    const result = await complete(prompt, {
      temperature: 0.3,
      maxTokens: 300,
      timeoutMs: 30_000,
    });

    return NextResponse.json({ description: result.content.trim() });
  } catch (error) {
    console.error('Generate description failed:', error);
    return NextResponse.json({ error: 'Failed to generate description' }, { status: 500 });
  }
}
