import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listBackups } from './backup';

test('listBackups recognizes Mission Control and legacy Autensa backup filenames', async () => {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-backups-'));
  const backupDir = path.join(tempDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  try {
    fs.writeFileSync(path.join(backupDir, 'mc-backup-2026-04-05T10-11-13-v004.db'), 'mc');
    fs.writeFileSync(path.join(backupDir, 'autensa-backup-2026-04-05T10-11-12-v003.db'), 'autensa');
    fs.writeFileSync(path.join(backupDir, 'pre-restore-2026-04-05T10-11-14.db'), 'restore');

    process.chdir(tempDir);

    const backups = await listBackups();
    const filenames = backups.map((backup) => backup.filename);

    assert.deepEqual(filenames, [
      'pre-restore-2026-04-05T10-11-14.db',
      'mc-backup-2026-04-05T10-11-13-v004.db',
      'autensa-backup-2026-04-05T10-11-12-v003.db',
    ]);

    assert.equal(backups[1]?.migrationVersion, '004');
    assert.equal(backups[2]?.migrationVersion, '003');
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});