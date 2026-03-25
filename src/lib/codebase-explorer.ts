/**
 * Codebase Explorer — Pre-Task Context Builder
 *
 * Clones/pulls a product's repo, analyzes its structure, and generates
 * a context document that gets injected into agent dispatch messages.
 * Results are cached per product+commit in the codebase_snapshots table.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { analyzeFile, extractTypeDefinitionBlocks, type FileAnalysis } from '@/lib/file-analyzer';

export type ExplorationDepth = 'shallow' | 'standard' | 'deep';

export interface CodebaseSnapshot {
  id: string;
  product_id: string;
  commit_sha: string;
  file_tree: string;
  framework: string | null;
  language: string | null;
  loc: number | null;
  key_files: string | null;   // JSON
  type_definitions: string | null; // JSON
  explored_at: string;
}

export interface ExplorationResult {
  snapshot: CodebaseSnapshot;
  contextDocument: string;
}

// Directories to exclude when walking the file tree
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output',
  '.cache', 'coverage', '__pycache__', '.venv', 'venv', 'env',
  '.turbo', '.vercel', '.svelte-kit', 'target', 'out',
]);

// Key files that indicate framework/tooling
const KEY_FILE_NAMES = new Set([
  'package.json', 'tsconfig.json', 'next.config.js', 'next.config.mjs', 'next.config.ts',
  'vite.config.ts', 'vite.config.js', 'webpack.config.js',
  'prisma/schema.prisma', 'drizzle.config.ts',
  'vitest.config.ts', 'jest.config.ts', 'jest.config.js',
  'tailwind.config.js', 'tailwind.config.ts',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'pyproject.toml', 'setup.py', 'requirements.txt',
  'Cargo.toml', 'go.mod',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs',
]);

/** Clone or pull a repo to a temp workspace, return local path and HEAD sha */
export function cloneOrPull(repoUrl: string, defaultBranch: string = 'main'): { localPath: string; commitSha: string } {
  // Deterministic temp directory based on repo URL
  const repoSlug = repoUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(-80);
  const localPath = path.join('/tmp', 'mc-codebase-explorer', repoSlug);

  if (fs.existsSync(path.join(localPath, '.git'))) {
    // Pull latest
    try {
      execSync(`git fetch origin && git reset --hard origin/${defaultBranch}`, {
        cwd: localPath,
        stdio: 'pipe',
        timeout: 60_000,
      });
    } catch (err) {
      console.warn('[CodebaseExplorer] git pull failed, re-cloning:', (err as Error).message);
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  }

  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    execSync(`git clone --depth 1 --branch ${defaultBranch} "${repoUrl}" "${localPath}"`, {
      stdio: 'pipe',
      timeout: 120_000,
    });
  }

  const commitSha = execSync('git rev-parse HEAD', { cwd: localPath, encoding: 'utf-8' }).trim();
  return { localPath, commitSha };
}

/** Walk directory and build file tree (respecting exclusions) */
function walkDir(dir: string, base: string, maxDepth: number = 6, currentDepth: number = 0): string[] {
  if (currentDepth >= maxDepth) return [];
  const entries: string[] = [];

  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const item of items) {
    if (item.name.startsWith('.') && item.name !== '.env.example') continue;
    if (EXCLUDED_DIRS.has(item.name)) continue;

    const relativePath = path.join(base, item.name);
    if (item.isDirectory()) {
      entries.push(relativePath + '/');
      entries.push(...walkDir(path.join(dir, item.name), relativePath, maxDepth, currentDepth + 1));
    } else {
      entries.push(relativePath);
    }
  }
  return entries;
}

/** Detect primary framework from package.json or config files */
function detectFramework(localPath: string): { framework: string; language: string; testRunner: string | null; db: string | null } {
  let framework = 'Unknown';
  let language = 'Unknown';
  let testRunner: string | null = null;
  let db: string | null = null;

  const pkgPath = path.join(localPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Framework detection
      if (allDeps['next']) framework = `Next.js ${allDeps['next'].replace(/[\^~]/, '')}`;
      else if (allDeps['nuxt']) framework = 'Nuxt';
      else if (allDeps['@sveltejs/kit']) framework = 'SvelteKit';
      else if (allDeps['react']) framework = 'React';
      else if (allDeps['vue']) framework = 'Vue';
      else if (allDeps['express']) framework = 'Express';
      else if (allDeps['fastify']) framework = 'Fastify';

      // Language
      if (allDeps['typescript']) language = 'TypeScript';
      else language = 'JavaScript';

      // Test runner
      if (allDeps['vitest']) testRunner = 'vitest';
      else if (allDeps['jest']) testRunner = 'jest';
      else if (allDeps['mocha']) testRunner = 'mocha';

      // DB
      if (allDeps['prisma'] || allDeps['@prisma/client']) db = 'PostgreSQL (Prisma)';
      else if (allDeps['drizzle-orm']) db = 'Drizzle ORM';
      else if (allDeps['better-sqlite3']) db = 'SQLite';
      else if (allDeps['pg']) db = 'PostgreSQL';
      else if (allDeps['mongoose'] || allDeps['mongodb']) db = 'MongoDB';
    } catch {
      // Ignore parse errors
    }
  }

  // Python fallback
  if (fs.existsSync(path.join(localPath, 'pyproject.toml')) || fs.existsSync(path.join(localPath, 'setup.py'))) {
    language = 'Python';
    if (fs.existsSync(path.join(localPath, 'manage.py'))) framework = 'Django';
    else if (fs.existsSync(path.join(localPath, 'app.py'))) framework = 'Flask/FastAPI';
  }

  // Go / Rust fallback
  if (fs.existsSync(path.join(localPath, 'go.mod'))) { language = 'Go'; framework = 'Go'; }
  if (fs.existsSync(path.join(localPath, 'Cargo.toml'))) { language = 'Rust'; framework = 'Rust'; }

  return { framework, language, testRunner, db };
}

/** Count total lines of code in source files */
function countLOC(localPath: string, fileTree: string[]): number {
  let total = 0;
  for (const file of fileTree) {
    if (file.endsWith('/')) continue;
    const ext = path.extname(file);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    try {
      const content = fs.readFileSync(path.join(localPath, file), 'utf-8');
      total += content.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length;
    } catch {
      // Skip unreadable files
    }
  }
  return total;
}

/** Find files relevant to a task based on keyword search */
function findRelevantFiles(localPath: string, fileTree: string[], keywords: string[], maxFiles: number = 10): string[] {
  if (keywords.length === 0) return [];

  const scored: { file: string; score: number }[] = [];
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  for (const file of fileTree) {
    if (file.endsWith('/')) continue;
    const ext = path.extname(file);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    let score = 0;
    const lowerFile = file.toLowerCase();

    // Score by filename match
    for (const kw of lowerKeywords) {
      if (lowerFile.includes(kw)) score += 3;
    }

    // Score by content match (only if filename had some relevance or for small files)
    if (score > 0 || fileTree.length < 200) {
      try {
        const content = fs.readFileSync(path.join(localPath, file), 'utf-8');
        const lowerContent = content.toLowerCase();
        for (const kw of lowerKeywords) {
          const matches = lowerContent.split(kw).length - 1;
          score += Math.min(matches, 5); // Cap per keyword
        }
      } catch {
        // Skip
      }
    }

    if (score > 0) scored.push({ file, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map(s => s.file);
}

/** Build structured tree summary for context doc */
function buildTreeSummary(fileTree: string[]): string {
  const dirs = new Map<string, number>();
  for (const file of fileTree) {
    if (file.endsWith('/')) continue;
    const parts = file.split('/');
    if (parts.length >= 2) {
      const topDir = parts.length >= 3 ? `${parts[0]}/${parts[1]}/` : `${parts[0]}/`;
      dirs.set(topDir, (dirs.get(topDir) || 0) + 1);
    }
  }

  const lines: string[] = [];
  const sortedDirs = Array.from(dirs.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [dir, count] of sortedDirs) {
    lines.push(`  ${dir} (${count} files)`);
  }
  return lines.join('\n');
}

/** Extract keywords from task title + description for relevance search */
export function extractKeywords(title: string, description?: string): string[] {
  const text = `${title} ${description || ''}`;
  // Remove common stop words and short words, extract meaningful terms
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'shall', 'can', 'for', 'and', 'but', 'or', 'nor', 'not', 'to', 'of', 'in', 'on', 'at', 'by',
    'with', 'from', 'as', 'into', 'this', 'that', 'these', 'those', 'it', 'its', 'add', 'create',
    'update', 'fix', 'implement', 'build', 'make', 'new', 'feature', 'bug', 'task']);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Main exploration entry point.
 * Clones/pulls repo, analyzes structure, caches result, returns context document.
 */
export async function exploreCodebase(
  productId: string,
  repoUrl: string,
  options: {
    defaultBranch?: string;
    depth?: ExplorationDepth;
    taskTitle?: string;
    taskDescription?: string;
  } = {}
): Promise<ExplorationResult> {
  const { defaultBranch = 'main', depth = 'standard', taskTitle, taskDescription } = options;

  // Clone or pull repo
  const { localPath, commitSha } = cloneOrPull(repoUrl, defaultBranch);

  // Check cache
  const cached = queryOne<CodebaseSnapshot>(
    'SELECT * FROM codebase_snapshots WHERE product_id = ? AND commit_sha = ?',
    [productId, commitSha]
  );

  if (cached) {
    // Rebuild context document from cached snapshot (keywords may differ per task)
    const contextDocument = buildContextDocument(cached, localPath, depth, taskTitle, taskDescription);
    return { snapshot: cached, contextDocument };
  }

  // Build file tree
  const fileTree = walkDir(localPath, '', 6);

  // Detect framework/language
  const { framework, language, testRunner, db } = detectFramework(localPath);

  // Count LOC
  const loc = countLOC(localPath, fileTree);

  // Identify key files
  const keyFiles: { path: string; loc: number; description: string }[] = [];
  for (const file of fileTree) {
    if (file.endsWith('/')) continue;
    const basename = path.basename(file);
    if (KEY_FILE_NAMES.has(basename) || KEY_FILE_NAMES.has(file)) {
      try {
        const content = fs.readFileSync(path.join(localPath, file), 'utf-8');
        const fileLoc = content.split('\n').length;
        keyFiles.push({ path: file, loc: fileLoc, description: basename });
      } catch {
        keyFiles.push({ path: file, loc: 0, description: basename });
      }
    }
  }

  // Extract type definitions (for standard/deep)
  let typeDefinitions: { file: string; types: string[] }[] = [];
  if (depth !== 'shallow') {
    for (const file of fileTree) {
      if (file.endsWith('/')) continue;
      if (!/\.(ts|tsx)$/.test(file)) continue;
      // Only analyze files in lib/, types, or models directories for standard depth
      if (depth === 'standard' && !/\b(lib|types|models|interfaces|schemas)\b/i.test(file)) continue;
      try {
        const content = fs.readFileSync(path.join(localPath, file), 'utf-8');
        const blocks = extractTypeDefinitionBlocks(content);
        if (blocks.length > 0) {
          typeDefinitions.push({ file, types: blocks });
        }
      } catch {
        // Skip
      }
    }
  }

  // Store snapshot
  const snapshotId = uuidv4();
  run(
    `INSERT INTO codebase_snapshots (id, product_id, commit_sha, file_tree, framework, language, loc, key_files, type_definitions, explored_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      snapshotId,
      productId,
      commitSha,
      JSON.stringify(fileTree),
      framework,
      language,
      loc,
      JSON.stringify(keyFiles),
      JSON.stringify(typeDefinitions),
    ]
  );

  const snapshot: CodebaseSnapshot = {
    id: snapshotId,
    product_id: productId,
    commit_sha: commitSha,
    file_tree: JSON.stringify(fileTree),
    framework,
    language,
    loc,
    key_files: JSON.stringify(keyFiles),
    type_definitions: JSON.stringify(typeDefinitions),
    explored_at: new Date().toISOString(),
  };

  const contextDocument = buildContextDocument(snapshot, localPath, depth, taskTitle, taskDescription);
  return { snapshot, contextDocument };
}

/** Build the markdown context document injected into dispatch messages */
function buildContextDocument(
  snapshot: CodebaseSnapshot,
  localPath: string,
  depth: ExplorationDepth,
  taskTitle?: string,
  taskDescription?: string,
): string {
  const fileTree: string[] = JSON.parse(snapshot.file_tree);
  const keyFiles: { path: string; loc: number; description: string }[] = snapshot.key_files ? JSON.parse(snapshot.key_files) : [];
  const typeDefinitions: { file: string; types: string[] }[] = snapshot.type_definitions ? JSON.parse(snapshot.type_definitions) : [];

  const lines: string[] = [];
  lines.push('## Codebase Context');
  lines.push('');

  // Header stats
  const stats: string[] = [];
  if (snapshot.framework) stats.push(`**Framework:** ${snapshot.framework}`);
  if (snapshot.language) stats.push(`**Language:** ${snapshot.language}`);
  if (snapshot.loc) stats.push(`**LOC:** ${snapshot.loc.toLocaleString()}`);
  lines.push(stats.join(' | '));
  lines.push('');

  // Relevant files (task-specific keyword search)
  if (depth !== 'shallow' && taskTitle) {
    const keywords = extractKeywords(taskTitle, taskDescription);
    if (keywords.length > 0) {
      const relevantFiles = findRelevantFiles(localPath, fileTree, keywords, 8);
      if (relevantFiles.length > 0) {
        lines.push('### Relevant Files');
        for (const file of relevantFiles) {
          try {
            const content = fs.readFileSync(path.join(localPath, file), 'utf-8');
            const analysis = analyzeFile(file, content);
            const desc = analysis.exports.length > 0
              ? ` — exports: ${analysis.exports.slice(0, 5).join(', ')}`
              : '';
            lines.push(`- \`${file}\` (${analysis.loc} lines)${desc}`);
          } catch {
            lines.push(`- \`${file}\``);
          }
        }
        lines.push('');
      }
    }
  }

  // Key type definitions (standard/deep)
  if (depth !== 'shallow' && typeDefinitions.length > 0) {
    lines.push('### Key Type Definitions');
    lines.push('```typescript');
    let typeCount = 0;
    for (const { types } of typeDefinitions) {
      for (const t of types) {
        if (typeCount >= 10) break;
        lines.push(t);
        lines.push('');
        typeCount++;
      }
      if (typeCount >= 10) break;
    }
    lines.push('```');
    lines.push('');
  }

  // Project structure
  lines.push('### Project Structure');
  lines.push('```');
  lines.push(buildTreeSummary(fileTree));
  lines.push('```');
  lines.push('');

  // Key files
  if (keyFiles.length > 0) {
    lines.push('### Key Files');
    for (const kf of keyFiles.slice(0, 10)) {
      lines.push(`- \`${kf.path}\` (${kf.loc} lines)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get cached context document for a product (used during dispatch).
 * Returns null if no snapshot exists or repo_url is missing.
 */
export function getCachedCodebaseContext(
  productId: string,
  repoUrl: string,
  depth: ExplorationDepth = 'standard',
  taskTitle?: string,
  taskDescription?: string,
): string | null {
  // Get most recent snapshot for this product
  const snapshot = queryOne<CodebaseSnapshot>(
    'SELECT * FROM codebase_snapshots WHERE product_id = ? ORDER BY explored_at DESC LIMIT 1',
    [productId]
  );

  if (!snapshot) return null;

  // Rebuild context from snapshot — we need the local path for keyword search
  const repoSlug = repoUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(-80);
  const localPath = path.join('/tmp', 'mc-codebase-explorer', repoSlug);

  if (!fs.existsSync(localPath)) return null;

  return buildContextDocument(snapshot, localPath, depth, taskTitle, taskDescription);
}
