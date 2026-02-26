/**
 * Copy Boilerplate API
 * Copies a boilerplate template to a target directory
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const BOILERPLATES_DIR = path.join(os.homedir(), 'boilerplates');

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip .git directories
      if (entry.name === '.git') continue;
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function expandTilde(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
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

    const srcPath = path.join(BOILERPLATES_DIR, boilerplateId);
    const destPath = expandTilde(targetPath);

    // Verify source exists
    try {
      await fs.access(srcPath);
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
      } catch {
        // Git init failed, not critical
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
