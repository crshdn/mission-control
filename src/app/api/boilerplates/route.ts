/**
 * Boilerplates API
 * Lists available boilerplate templates from ~/boilerplates/
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Boilerplates are local filesystem state and can change at runtime.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BOILERPLATES_DIR = path.join(os.homedir(), 'boilerplates');

interface Boilerplate {
  id: string;
  name: string;
  description: string;
  fileCount: number;
}

async function getBoilerplateDescription(dir: string): Promise<string> {
  // Try to read README.md for description
  try {
    const readmePath = path.join(dir, 'README.md');
    const content = await fs.readFile(readmePath, 'utf-8');
    // Get first non-empty, non-heading line
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('*') && !trimmed.startsWith('-')) {
        return trimmed.slice(0, 100) + (trimmed.length > 100 ? '...' : '');
      }
    }
  } catch {
    // No README, that's fine
  }
  return '';
}

const MAX_SCAN_DEPTH = 12;
const MAX_SCAN_ENTRIES = 5000;

async function countFiles(dir: string, depth = 0, state = { visited: 0 }): Promise<number> {
  if (depth > MAX_SCAN_DEPTH) return 0;
  if (state.visited > MAX_SCAN_ENTRIES) return 0;

  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      state.visited += 1;
      if (state.visited > MAX_SCAN_ENTRIES) break;

      if (entry.name.startsWith('.')) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        count += await countFiles(path.join(dir, entry.name), depth + 1, state);
      } else {
        count++;
      }
    }
  } catch {
    // Ignore errors
  }
  return count;
}

export async function GET() {
  try {
    // Check if boilerplates directory exists
    try {
      await fs.access(BOILERPLATES_DIR);
    } catch {
      return NextResponse.json({ boilerplates: [] });
    }

    const entries = await fs.readdir(BOILERPLATES_DIR, { withFileTypes: true });
    const boilerplates: Boilerplate[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const fullPath = path.join(BOILERPLATES_DIR, entry.name);
      const [description, fileCount] = await Promise.all([
        getBoilerplateDescription(fullPath),
        countFiles(fullPath),
      ]);

      // Only include if it has files
      if (fileCount > 0) {
        boilerplates.push({
          id: entry.name,
          name: entry.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          description,
          fileCount,
        });
      }
    }

    // Sort alphabetically
    boilerplates.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ boilerplates });
  } catch (error) {
    console.error('Failed to list boilerplates:', error);
    return NextResponse.json({ error: 'Failed to list boilerplates' }, { status: 500 });
  }
}
