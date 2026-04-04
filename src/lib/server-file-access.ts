import { existsSync, mkdirSync, realpathSync, statSync } from 'fs';
import path from 'path';
import { normalizeServerPath } from './server-paths';

export interface PathAccessError {
  error: string;
  status: number;
}

export interface ResolvedBasePath {
  configuredPath: string;
  realPath: string;
}

type PathResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

function fail<T>(status: number, error: string): PathResult<T> {
  return { ok: false, status, error };
}

function isFileSystemRoot(candidatePath: string): boolean {
  return candidatePath === path.parse(candidatePath).root;
}

function getNearestExistingAncestor(targetPath: string): string {
  let currentPath = targetPath;

  while (!existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return currentPath;
    }
    currentPath = parentPath;
  }

  return currentPath;
}

export function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const relativePath = path.relative(basePath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function resolveConfiguredBasePath(rawPath: string, label: string): PathResult<string> {
  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    return fail(500, `${label} is not configured`);
  }

  const normalizedPath = normalizeServerPath(trimmedPath);
  if (isFileSystemRoot(normalizedPath)) {
    return fail(500, `${label} cannot point to the filesystem root`);
  }

  return { ok: true, value: normalizedPath };
}

export function resolveExistingBasePath(rawPath: string, label: string): PathResult<ResolvedBasePath> {
  const configuredBase = resolveConfiguredBasePath(rawPath, label);
  if (!configuredBase.ok) {
    return configuredBase;
  }

  if (!existsSync(configuredBase.value)) {
    return fail(500, `${label} directory does not exist: ${configuredBase.value}`);
  }

  const stats = statSync(configuredBase.value);
  if (!stats.isDirectory()) {
    return fail(500, `${label} is not a directory: ${configuredBase.value}`);
  }

  return {
    ok: true,
    value: {
      configuredPath: configuredBase.value,
      realPath: realpathSync(configuredBase.value),
    },
  };
}

export function resolveWritableBasePath(rawPath: string, label: string): PathResult<ResolvedBasePath> {
  const configuredBase = resolveConfiguredBasePath(rawPath, label);
  if (!configuredBase.ok) {
    return configuredBase;
  }

  if (!existsSync(configuredBase.value)) {
    mkdirSync(configuredBase.value, { recursive: true });
  }

  const stats = statSync(configuredBase.value);
  if (!stats.isDirectory()) {
    return fail(500, `${label} is not a directory: ${configuredBase.value}`);
  }

  return {
    ok: true,
    value: {
      configuredPath: configuredBase.value,
      realPath: realpathSync(configuredBase.value),
    },
  };
}

export function resolvePreviewRoots(
  roots: Array<{ label: string; path: string }>
): PathResult<string[]> {
  const existingRoots = new Set<string>();

  for (const root of roots) {
    const configuredRoot = resolveConfiguredBasePath(root.path, root.label);
    if (!configuredRoot.ok) {
      return configuredRoot;
    }

    if (!existsSync(configuredRoot.value)) {
      continue;
    }

    const stats = statSync(configuredRoot.value);
    if (!stats.isDirectory()) {
      return fail(500, `${root.label} is not a directory: ${configuredRoot.value}`);
    }

    existingRoots.add(realpathSync(configuredRoot.value));
  }

  if (existingRoots.size === 0) {
    return fail(500, 'No preview base directories are available');
  }

  return { ok: true, value: [...existingRoots] };
}

export function resolvePreviewPath(
  rawPath: string,
  allowedRoots: string[]
): PathResult<string> {
  const normalizedPath = normalizeServerPath(rawPath);
  if (!existsSync(normalizedPath)) {
    return fail(404, 'File not found');
  }

  const resolvedPath = realpathSync(normalizedPath);
  const isAllowed = allowedRoots.some((root) => isPathWithinBase(resolvedPath, root));
  if (!isAllowed) {
    return fail(403, 'Path not allowed');
  }

  return { ok: true, value: resolvedPath };
}

export function resolveRelativePath(rawPath: string): PathResult<string> {
  const normalizedPath = path.normalize(rawPath);
  if (
    !normalizedPath ||
    normalizedPath === '.' ||
    normalizedPath.startsWith('..') ||
    path.isAbsolute(normalizedPath)
  ) {
    return fail(400, 'Invalid path: must be relative and cannot traverse upward');
  }

  return { ok: true, value: normalizedPath };
}

export function resolveDownloadTargetPath(options: {
  fullPathParam?: string | null;
  relativePathParam?: string | null;
  base: ResolvedBasePath;
}): PathResult<{ path: string; relativePath: string }> {
  const { fullPathParam, relativePathParam, base } = options;

  let targetPath: string;
  if (fullPathParam) {
    targetPath = normalizeServerPath(fullPathParam);
  } else if (relativePathParam) {
    const normalizedRelative = resolveRelativePath(relativePathParam);
    if (!normalizedRelative.ok) {
      return normalizedRelative;
    }
    targetPath = path.join(base.realPath, normalizedRelative.value);
  } else {
    return fail(400, 'Either path or relativePath query parameter is required');
  }

  if (!existsSync(targetPath)) {
    return fail(404, 'File not found');
  }

  const resolvedPath = realpathSync(targetPath);
  if (!isPathWithinBase(resolvedPath, base.realPath)) {
    return fail(403, 'Access denied');
  }

  return {
    ok: true,
    value: {
      path: resolvedPath,
      relativePath: path.relative(base.realPath, resolvedPath),
    },
  };
}

export function resolveUploadTargetPath(
  base: ResolvedBasePath,
  rawRelativePath: string
): PathResult<{ path: string; relativePath: string }> {
  const normalizedRelative = resolveRelativePath(rawRelativePath);
  if (!normalizedRelative.ok) {
    return normalizedRelative;
  }

  const resolvedPath = path.join(base.realPath, normalizedRelative.value);
  if (!isPathWithinBase(resolvedPath, base.realPath)) {
    return fail(400, 'Invalid path: must be relative and cannot traverse upward');
  }

  const existingAncestor = getNearestExistingAncestor(resolvedPath);
  const resolvedAncestor = realpathSync(existingAncestor);
  if (!isPathWithinBase(resolvedAncestor, base.realPath)) {
    return fail(403, 'Access denied');
  }

  return {
    ok: true,
    value: {
      path: resolvedPath,
      relativePath: normalizedRelative.value,
    },
  };
}

export function toPathErrorResponse(result: PathAccessError): { error: string; status: number } {
  return { error: result.error, status: result.status };
}