import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { applyDatabasePragmas, readDatabasePragmas, verifyDatabasePragmas } from './pragmas';

function cleanupDb(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

test('applyDatabasePragmas sets the SQLite WAL performance profile', () => {
  const tmpDir = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, 'pragma-test.db');
  cleanupDb(dbPath);

  const db = new Database(dbPath);
  try {
    const pragmas = applyDatabasePragmas(db);

    assert.equal(pragmas.journalMode, 'wal');
    assert.equal(pragmas.synchronous, 1);
    assert.equal(pragmas.cacheSize, -64000);
    assert.equal(pragmas.busyTimeout, 5000);
    assert.equal(pragmas.foreignKeys, 1);
    assert.doesNotThrow(() => verifyDatabasePragmas(db, pragmas));
  } finally {
    db.close();
  }

  const reopened = new Database(dbPath);
  try {
    assert.equal(readDatabasePragmas(reopened).journalMode, 'wal');
  } finally {
    reopened.close();
    cleanupDb(dbPath);
  }
});

test('WAL profile allows a writer to commit while another connection is reading', () => {
  const tmpDir = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, 'pragma-concurrency-test.db');
  cleanupDb(dbPath);

  const writer = new Database(dbPath);
  const reader = new Database(dbPath);
  const countRows = () => (reader.prepare('SELECT COUNT(*) AS count FROM items').get() as { count: number }).count;

  try {
    applyDatabasePragmas(writer);
    applyDatabasePragmas(reader);

    writer.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)');
    writer.prepare('INSERT INTO items (label) VALUES (?)').run('initial');

    const commitWrite = writer.transaction(() => {
      writer.prepare('INSERT INTO items (label) VALUES (?)').run('during-read');
    });

    reader.transaction(() => {
      assert.equal(countRows(), 1);
      assert.doesNotThrow(() => commitWrite());
      assert.equal(countRows(), 1);
    })();

    assert.equal(countRows(), 2);
  } finally {
    reader.close();
    writer.close();
    cleanupDb(dbPath);
  }
});
