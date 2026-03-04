import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PR {
  number: number;
  title: string;
  author: string;
  url: string;
  createdAt: string;
  isDraft: boolean;
}

interface Issue {
  number: number;
  title: string;
  author: string;
  url: string;
  createdAt: string;
  labels: string[];
}

interface Repo {
  name: string;
  fullName: string;
  prs: PR[];
  issues: Issue[];
  lastCommit?: {
    message: string;
    author: string;
    date: string;
  };
}

export async function GET() {
  try {
    const repos = ['openclaw/openclaw', 'ateliertools/atelier-platform'];
    const results: Repo[] = [];
    
    for (const repo of repos) {
      try {
        // Get open PRs
        const { stdout: prsJson } = await execAsync(
          `gh pr list --repo ${repo} --json number,title,author,url,createdAt,isDraft --limit 5 2>/dev/null || echo "[]"`,
          { timeout: 10000 }
        );
        const prs = JSON.parse(prsJson || '[]').map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          author: pr.author?.login || 'unknown',
          url: pr.url,
          createdAt: pr.createdAt,
          isDraft: pr.isDraft
        }));
        
        // Get recent issues
        const { stdout: issuesJson } = await execAsync(
          `gh issue list --repo ${repo} --json number,title,author,url,createdAt,labels --limit 5 2>/dev/null || echo "[]"`,
          { timeout: 10000 }
        );
        const issues = JSON.parse(issuesJson || '[]').map((issue: any) => ({
          number: issue.number,
          title: issue.title,
          author: issue.author?.login || 'unknown',
          url: issue.url,
          createdAt: issue.createdAt,
          labels: issue.labels?.map((l: any) => l.name) || []
        }));
        
        // Get last commit
        let lastCommit;
        try {
          const { stdout: commitJson } = await execAsync(
            `gh api repos/${repo}/commits?per_page=1 2>/dev/null || echo "[]"`,
            { timeout: 10000 }
          );
          const commits = JSON.parse(commitJson || '[]');
          if (commits.length > 0) {
            lastCommit = {
              message: commits[0].commit?.message?.split('\n')[0] || '',
              author: commits[0].commit?.author?.name || 'unknown',
              date: commits[0].commit?.author?.date || ''
            };
          }
        } catch (e) {
          // Skip if can't get commits
        }
        
        results.push({
          name: repo.split('/')[1],
          fullName: repo,
          prs,
          issues,
          lastCommit
        });
      } catch (repoError) {
        // Skip repos that fail
        results.push({
          name: repo.split('/')[1],
          fullName: repo,
          prs: [],
          issues: [],
        });
      }
    }
    
    return NextResponse.json({ 
      repos: results,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('GitHub API error:', error);
    return NextResponse.json({ repos: [], error: String(error) });
  }
}
