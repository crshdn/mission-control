/**
 * Copy Boilerplate API
 * Copies a boilerplate template to a target directory
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getProjectsPath, getWorkspaceBasePath } from '@/lib/config';

const BOILERPLATES_DIR = path.join(os.homedir(), 'boilerplates');
const MAX_COPY_DEPTH = 12;
const MAX_COPY_BYTES = 100 * 1024 * 1024; // 100MB safety cap
const BOILERPLATE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function expandTilde(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function isWithinRoot(target: string, root: string): boolean {
  const normalizedTarget = path.resolve(target);
  const normalizedRoot = path.resolve(root);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(normalizedRoot + path.sep)
  );
}

async function copyDir(
  src: string,
  dest: string,
  depth = 0,
  state = { copiedBytes: 0 },
): Promise<void> {
  if (depth > MAX_COPY_DEPTH) {
    throw new Error(`Boilerplate directory nesting exceeds max depth (${MAX_COPY_DEPTH})`);
  }

  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isSymbolicLink()) {
      // Skip symlinks to prevent loop/traversal surprises.
      continue;
    }

    if (entry.isDirectory()) {
      // Skip .git directories
      if (entry.name === '.git') continue;
      await copyDir(srcPath, destPath, depth + 1, state);
    } else {
      const stat = await fs.stat(srcPath);
      state.copiedBytes += stat.size;
      if (state.copiedBytes > MAX_COPY_BYTES) {
        throw new Error(`Boilerplate exceeds max allowed size (${MAX_COPY_BYTES} bytes)`);
      }
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { boilerplateId, targetPath } = body;

    if (!boilerplateId || !targetPath) {
      return NextResponse.json(
        { error: 'boilerplateId and targetPath are required' },
        { status: 400 }
      );
    }

    if (
      typeof boilerplateId !== 'string' ||
      !BOILERPLATE_ID_PATTERN.test(boilerplateId) ||
      boilerplateId.includes('/') ||
      boilerplateId.includes('\\') ||
      boilerplateId.startsWith('.')
    ) {
      return NextResponse.json(
        { error: 'Invalid boilerplate ID' },
        { status: 400 }
      );
    }

    const srcPath = path.resolve(path.join(BOILERPLATES_DIR, boilerplateId));
    const boilerplatesRoot = path.resolve(BOILERPLATES_DIR);
    if (!isWithinRoot(srcPath, boilerplatesRoot)) {
      return NextResponse.json(
        { error: 'Boilerplate path is outside allowed directory' },
        { status: 400 }
      );
    }

    const destPath = path.resolve(expandTilde(targetPath));

    const allowedRoots = [
      path.resolve(expandTilde(getWorkspaceBasePath())),
      path.resolve(expandTilde(getProjectsPath())),
    ];
    const isAllowedDestination = allowedRoots.some((root) => isWithinRoot(destPath, root) && destPath !== root);
    if (!isAllowedDestination) {
      return NextResponse.json(
        { error: 'Target path is outside allowed workspace/project directories' },
        { status: 400 }
      );
    }

    // Verify source exists
    try {
      await fs.access(srcPath);
      const srcStat = await fs.stat(srcPath);
      if (!srcStat.isDirectory()) {
        return NextResponse.json(
          { error: 'Boilerplate source must be a directory' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: `Boilerplate "${boilerplateId}" not found` },
        { status: 404 }
      );
    }

    // Check if destination already has files (don't overwrite)
    try {
      const existing = await fs.readdir(destPath);
      const nonHidden = existing.filter(f => !f.startsWith('.'));
      if (nonHidden.length > 0) {
        return NextResponse.json(
          { error: 'Target directory is not empty' },
          { status: 409 }
        );
      }
    } catch {
      // Directory doesn't exist, that's fine
    }

    // Copy boilerplate to target
    await copyDir(srcPath, destPath);

    // Initialize git if not already present
    const gitPath = path.join(destPath, '.git');
    try {
      await fs.access(gitPath);
    } catch {
      // No .git, initialize one
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      try {
        await execAsync('git init', { cwd: destPath });
        await execAsync('git add -A', { cwd: destPath });
        await execAsync('git commit -m "Initial commit from boilerplate"', { cwd: destPath });
      } catch (error) {
        // Git init failure isn't fatal for project bootstrapping, but keep observability.
        console.warn('Git initialization failed for boilerplate copy:', destPath, error);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Copied ${boilerplateId} to ${targetPath}` 
    });
  } catch (error) {
    console.error('Failed to copy boilerplate:', error);
    return NextResponse.json(
      { error: 'Failed to copy boilerplate' },
      { status: 500 }
    );
  }
}
