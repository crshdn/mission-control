import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import {
  isPathWithinBase,
  resolveConfiguredBasePath,
  resolveDownloadTargetPath,
  resolveExistingBasePath,
  resolvePreviewPath,
  resolvePreviewRoots,
  resolveUploadTargetPath,
  resolveWritableBasePath,
} from './server-file-access';

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('isPathWithinBase rejects sibling-prefix paths', () => {
  const basePath = path.join('/tmp', 'workspace');
  const siblingPath = path.join('/tmp', 'workspace-evil', 'index.html');

  assert.equal(isPathWithinBase(siblingPath, basePath), false);
});

test('resolveConfiguredBasePath rejects filesystem roots', () => {
  const fileSystemRoot = path.parse(process.cwd()).root;
  const result = resolveConfiguredBasePath(fileSystemRoot, 'PROJECTS_PATH');

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
    assert.match(result.error, /filesystem root/);
  }
});

test('resolveExistingBasePath reports missing directories clearly', () => {
  const tempDir = makeTempDir('mission-control-file-access-');
  const missingDir = path.join(tempDir, 'missing-projects');

  try {
    const result = resolveExistingBasePath(missingDir, 'PROJECTS_PATH');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 500);
      assert.match(result.error, /does not exist/);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveWritableBasePath creates a missing configured base safely', () => {
  const tempDir = makeTempDir('mission-control-file-access-');
  const uploadBase = path.join(tempDir, 'projects');

  try {
    const result = resolveWritableBasePath(uploadBase, 'PROJECTS_PATH');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.realPath, realpathSync(uploadBase));
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolvePreviewPath rejects symlink escapes outside allowed roots', () => {
  const tempDir = makeTempDir('mission-control-file-access-');
  const previewBase = path.join(tempDir, 'workspace');
  const outsideDir = path.join(tempDir, 'outside');
  mkdirSync(previewBase, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });

  const outsideFile = path.join(outsideDir, 'escape.html');
  const symlinkPath = path.join(previewBase, 'escape.html');
  writeFileSync(outsideFile, '<html>escape</html>', 'utf-8');
  symlinkSync(outsideFile, symlinkPath);

  try {
    const roots = resolvePreviewRoots([{ label: 'WORKSPACE_BASE_PATH', path: previewBase }]);
    assert.equal(roots.ok, true);
    if (!roots.ok) {
      throw new Error('Expected preview roots to resolve');
    }

    const result = resolvePreviewPath(symlinkPath, roots.value);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.error, 'Path not allowed');
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveDownloadTargetPath rejects path traversal via relative paths', () => {
  const tempDir = makeTempDir('mission-control-file-access-');
  const projectsBase = path.join(tempDir, 'projects');
  mkdirSync(projectsBase, { recursive: true });

  try {
    const base = resolveExistingBasePath(projectsBase, 'PROJECTS_PATH');
    assert.equal(base.ok, true);
    if (!base.ok) {
      throw new Error('Expected projects base to resolve');
    }

    const result = resolveDownloadTargetPath({
      relativePathParam: '../secrets.txt',
      base: base.value,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveDownloadTargetPath rejects symlink escapes outside projects base', () => {
  const tempDir = makeTempDir('mission-control-file-access-');
  const projectsBase = path.join(tempDir, 'projects');
  const outsideDir = path.join(tempDir, 'outside');
  mkdirSync(projectsBase, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });

  const outsideFile = path.join(outsideDir, 'secrets.txt');
  const symlinkPath = path.join(projectsBase, 'linked-secret.txt');
  writeFileSync(outsideFile, 'nope', 'utf-8');
  symlinkSync(outsideFile, symlinkPath);

  try {
    const base = resolveExistingBasePath(projectsBase, 'PROJECTS_PATH');
    assert.equal(base.ok, true);
    if (!base.ok) {
      throw new Error('Expected projects base to resolve');
    }

    const result = resolveDownloadTargetPath({
      relativePathParam: 'linked-secret.txt',
      base: base.value,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.error, 'Access denied');
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveUploadTargetPath keeps files within resolved projects base', () => {
  const tempDir = makeTempDir('mission-control-file-access-');
  const projectsBase = path.join(tempDir, 'projects');

  try {
    const base = resolveWritableBasePath(projectsBase, 'PROJECTS_PATH');
    assert.equal(base.ok, true);
    if (!base.ok) {
      throw new Error('Expected writable projects base to resolve');
    }

    const result = resolveUploadTargetPath(base.value, path.join('demo', 'index.html'));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.relativePath, path.join('demo', 'index.html'));
      assert.equal(result.value.path.startsWith(base.value.realPath + path.sep), true);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveUploadTargetPath rejects writes through symlinked parent directories', () => {
  const tempDir = makeTempDir('mission-control-file-access-');
  const projectsBase = path.join(tempDir, 'projects');
  const outsideDir = path.join(tempDir, 'outside');
  mkdirSync(projectsBase, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  symlinkSync(outsideDir, path.join(projectsBase, 'demo'));

  try {
    const base = resolveWritableBasePath(projectsBase, 'PROJECTS_PATH');
    assert.equal(base.ok, true);
    if (!base.ok) {
      throw new Error('Expected writable projects base to resolve');
    }

    const result = resolveUploadTargetPath(base.value, path.join('demo', 'escape.txt'));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.error, 'Access denied');
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});