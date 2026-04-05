import os from 'os';
import path from 'path';

const HOME_DIR = os.homedir();

export function expandHomePath(rawPath: string): string {
  if (rawPath === '~') {
    return HOME_DIR;
  }

  if (rawPath.startsWith('~/') || rawPath.startsWith('~\\')) {
    return path.join(HOME_DIR, rawPath.slice(2));
  }

  return rawPath;
}

export function normalizeServerPath(rawPath: string): string {
  const expandedPath = expandHomePath(rawPath.trim());

  if (path.isAbsolute(expandedPath)) {
    return path.normalize(expandedPath);
  }

  return path.normalize(path.join(process.cwd(), expandedPath));
}
