/**
 * Workspace File Sync
 * 
 * Maps gateway_agent_id to actual workspace paths and provides
 * read/write functions for SOUL.md, USER.md, AGENTS.md files.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Mapping from gateway_agent_id to workspace directory path.
 * 'main' is the default agent (no suffix).
 */
const WORKSPACE_MAP: Record<string, string> = {
  main: path.join(os.homedir(), '.openclaw/workspace'),
  shelby: path.join(os.homedir(), '.openclaw/workspace-shelby'),
  sherlock: path.join(os.homedir(), '.openclaw/workspace-sherlock'),
  goku: path.join(os.homedir(), '.openclaw/workspace-goku'),
  monalisa: path.join(os.homedir(), '.openclaw/workspace-monalisa'),
  dexter: path.join(os.homedir(), '.openclaw/workspace-dexter'),
  bluma: path.join(os.homedir(), '.openclaw/workspace-bluma'),
};

/** Valid filenames that can be synced */
const ALLOWED_FILES = new Set(['SOUL.md', 'USER.md', 'AGENTS.md']);

/**
 * Get the workspace directory path for a given gateway_agent_id.
 * Returns null if the agent is not mapped.
 */
export function getWorkspacePath(gatewayAgentId: string): string | null {
  return WORKSPACE_MAP[gatewayAgentId] ?? null;
}

/**
 * Read a file from the agent's workspace.
 * Returns the file content as a string, or null if the file doesn't exist
 * or the agent has no mapped workspace.
 */
export function readAgentFile(gatewayAgentId: string, filename: string): string | null {
  if (!ALLOWED_FILES.has(filename)) {
    console.warn(`[workspace] Attempted to read disallowed file: ${filename}`);
    return null;
  }

  const wsPath = getWorkspacePath(gatewayAgentId);
  if (!wsPath) return null;

  const filePath = path.join(wsPath, filename);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist — that's fine, return null
      return null;
    }
    console.error(`[workspace] Failed to read ${filePath}:`, err);
    return null;
  }
}

/**
 * Write content to a file in the agent's workspace.
 * Returns true on success, false on failure.
 */
export function writeAgentFile(gatewayAgentId: string, filename: string, content: string): boolean {
  if (!ALLOWED_FILES.has(filename)) {
    console.warn(`[workspace] Attempted to write disallowed file: ${filename}`);
    return false;
  }

  const wsPath = getWorkspacePath(gatewayAgentId);
  if (!wsPath) {
    console.warn(`[workspace] No workspace mapped for agent: ${gatewayAgentId}`);
    return false;
  }

  const filePath = path.join(wsPath, filename);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[workspace] Wrote ${filePath} (${content.length} bytes)`);
    return true;
  } catch (err) {
    console.error(`[workspace] Failed to write ${filePath}:`, err);
    return false;
  }
}

/**
 * Read all three md files from workspace for a given agent.
 * Returns an object with soul_md, user_md, agents_md (null if not found).
 */
export function readAllAgentFiles(gatewayAgentId: string): {
  soul_md: string | null;
  user_md: string | null;
  agents_md: string | null;
} {
  return {
    soul_md: readAgentFile(gatewayAgentId, 'SOUL.md'),
    user_md: readAgentFile(gatewayAgentId, 'USER.md'),
    agents_md: readAgentFile(gatewayAgentId, 'AGENTS.md'),
  };
}
