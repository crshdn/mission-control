import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ScanUrlSchema = z.object({
  url: z.string().url().refine(u => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'URL must use http or https',
  }),
});

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 50_000;

// --- HTML extraction ---

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

function extractFromHtml(html: string): { name: string | null; description: string | null } {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null;

  // Extract og:title
  const ogTitleMatch = html.match(/<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']og:title["'][^>]*?\s+content=["']([^"']*?)["']/i)
    || html.match(/<meta\s+(?:[^>]*?\s+)?content=["']([^"']*?)["'][^>]*?\s+(?:property|name)=["']og:title["']/i);
  const ogTitle = ogTitleMatch ? decodeHtmlEntities(ogTitleMatch[1].trim()) : null;

  // Extract meta description
  const metaDescMatch = html.match(/<meta\s+(?:[^>]*?\s+)?name=["']description["'][^>]*?\s+content=["']([^"']*?)["']/i)
    || html.match(/<meta\s+(?:[^>]*?\s+)?content=["']([^"']*?)["'][^>]*?\s+name=["']description["']/i);
  const metaDesc = metaDescMatch ? decodeHtmlEntities(metaDescMatch[1].trim()) : null;

  // Extract og:description
  const ogDescMatch = html.match(/<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']og:description["'][^>]*?\s+content=["']([^"']*?)["']/i)
    || html.match(/<meta\s+(?:[^>]*?\s+)?content=["']([^"']*?)["'][^>]*?\s+(?:property|name)=["']og:description["']/i);
  const ogDesc = ogDescMatch ? decodeHtmlEntities(ogDescMatch[1].trim()) : null;

  return {
    name: ogTitle || title || null,
    description: ogDesc || metaDesc || null,
  };
}

// --- GitHub README extraction ---

const GITHUB_REPO_REGEX = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/;

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(GITHUB_REPO_REGEX);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')              // *italic* → italic
    .replace(/`([^`]+)`/g, '$1')                // `code` → code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')     // ![alt](img) → remove
    .trim();
}

function extractFromReadme(readme: string, repoName: string): { name: string | null; description: string | null } {
  const lines = readme.split('\n');

  let name: string | null = null;
  let description: string | null = null;
  let foundHeading = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and badges/images
    if (!trimmed || trimmed.startsWith('![') || trimmed.startsWith('[![')) continue;

    // Look for first heading
    const headingMatch = trimmed.match(/^#+\s+(.+)$/);
    if (headingMatch && !foundHeading) {
      name = stripMarkdownFormatting(headingMatch[1]);
      foundHeading = true;
      continue;
    }

    // After heading, grab first non-empty paragraph as description
    if (foundHeading && !headingMatch && !trimmed.startsWith('<!--') && !trimmed.startsWith('---')) {
      description = stripMarkdownFormatting(trimmed);
      if (description.length > 500) {
        description = description.slice(0, 497) + '...';
      }
      break;
    }
  }

  return {
    name: name || repoName,
    description,
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Autensa/1.0 (Product Scanner)',
        'Accept': 'text/html, text/plain, text/markdown, */*',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (totalSize < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalSize += value.length;
  }

  reader.cancel();
  const decoder = new TextDecoder();
  return chunks.map(c => decoder.decode(c, { stream: true })).join('');
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ScanUrlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { url } = parsed.data;

  try {
    // Check if GitHub repo
    const github = parseGitHubUrl(url);
    if (github) {
      return await handleGitHub(github.owner, github.repo);
    }

    // Regular website
    return await handleWebsite(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch URL';
    logger.error(`[scan-url] Error scanning ${url}:`, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function handleGitHub(owner: string, repo: string): Promise<NextResponse> {
  // Try main branch first, then master
  for (const branch of ['main', 'master']) {
    const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
    try {
      const res = await fetchWithTimeout(readmeUrl, FETCH_TIMEOUT_MS);
      if (res.ok) {
        const readme = await readLimited(res, MAX_BODY_BYTES);
        const result = extractFromReadme(readme, repo);
        return NextResponse.json(result);
      }
    } catch {
      // Try next branch
    }
  }

  // Fallback: just use repo name
  return NextResponse.json({ name: repo, description: null });
}

async function handleWebsite(url: string): Promise<NextResponse> {
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    return NextResponse.json({ error: `Site returned ${res.status}` }, { status: 502 });
  }

  const html = await readLimited(res, MAX_BODY_BYTES);
  const result = extractFromHtml(html);
  return NextResponse.json(result);
}
