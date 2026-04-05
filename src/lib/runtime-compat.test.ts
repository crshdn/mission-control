import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getApiToken,
  isDebugEnabledInStorage,
  PRIMARY_DEBUG_STORAGE_KEY,
  LEGACY_DEBUG_STORAGE_KEY,
} from './runtime-compat';
import {
  resolveWorkspaceMetadataPath,
  PRIMARY_WORKSPACE_METADATA_FILENAME,
  LEGACY_WORKSPACE_METADATA_FILENAME,
} from './workspace-metadata';

test('getApiToken prefers MC_API_TOKEN and falls back to AUTENSA_API_TOKEN', () => {
  assert.equal(getApiToken({ MC_API_TOKEN: 'mc-token', AUTENSA_API_TOKEN: 'autensa-token' }), 'mc-token');
  assert.equal(getApiToken({ AUTENSA_API_TOKEN: 'autensa-token' }), 'autensa-token');
  assert.equal(getApiToken({ MC_API_TOKEN: '   ' }), undefined);
  assert.equal(getApiToken({}), undefined);
});

test('isDebugEnabledInStorage supports Mission Control and legacy Autensa keys', () => {
  const storage = {
    values: new Map<string, string>(),
    getItem(key: string) {
      return this.values.get(key) ?? null;
    },
  };

  assert.equal(isDebugEnabledInStorage(storage), false);

  storage.values.set(PRIMARY_DEBUG_STORAGE_KEY, 'true');
  assert.equal(isDebugEnabledInStorage(storage), true);

  storage.values.delete(PRIMARY_DEBUG_STORAGE_KEY);
  storage.values.set(LEGACY_DEBUG_STORAGE_KEY, 'true');
  assert.equal(isDebugEnabledInStorage(storage), true);
});

test('resolveWorkspaceMetadataPath prefers Mission Control filename and falls back to legacy Autensa filename', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-runtime-compat-'));

  try {
    assert.equal(resolveWorkspaceMetadataPath(tempDir), null);

    const legacyPath = path.join(tempDir, LEGACY_WORKSPACE_METADATA_FILENAME);
    fs.writeFileSync(legacyPath, '{}');
    assert.equal(resolveWorkspaceMetadataPath(tempDir), legacyPath);

    const primaryPath = path.join(tempDir, PRIMARY_WORKSPACE_METADATA_FILENAME);
    fs.writeFileSync(primaryPath, '{}');
    assert.equal(resolveWorkspaceMetadataPath(tempDir), primaryPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});