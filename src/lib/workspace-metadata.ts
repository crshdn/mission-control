import fs from 'fs';
import path from 'path';

export const PRIMARY_WORKSPACE_METADATA_FILENAME = '.mc-workspace.json';
export const LEGACY_WORKSPACE_METADATA_FILENAME = '.autensa-workspace.json';
export const WORKSPACE_METADATA_FILENAMES = [
  PRIMARY_WORKSPACE_METADATA_FILENAME,
  LEGACY_WORKSPACE_METADATA_FILENAME,
] as const;

export function getPrimaryWorkspaceMetadataPath(workspacePath: string): string {
  return path.join(workspacePath, PRIMARY_WORKSPACE_METADATA_FILENAME);
}

export function resolveWorkspaceMetadataPath(workspacePath: string): string | null {
  for (const filename of WORKSPACE_METADATA_FILENAMES) {
    const candidate = path.join(workspacePath, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}