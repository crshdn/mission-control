import Database from 'better-sqlite3';

export const SQLITE_PRAGMA_TARGETS = {
  journalMode: 'wal',
  synchronous: 1, // NORMAL
  cacheSize: -64000,
  busyTimeout: 5000,
  foreignKeys: 1,
} as const;

export interface AppliedSqlitePragmas {
  journalMode: string;
  synchronous: number;
  cacheSize: number;
  busyTimeout: number;
  foreignKeys: number;
}

function readPragma<T>(db: Database.Database, pragma: string): T {
  return db.pragma(pragma, { simple: true }) as T;
}

function supportsWal(db: Database.Database): boolean {
  return Boolean(db.name && db.name !== ':memory:');
}

/**
 * SQLite connection tuning:
 * - journal_mode=WAL allows readers and one writer to proceed concurrently,
 *   which prevents UI reads from blocking autopilot writes.
 * - synchronous=NORMAL preserves durability for normal process crashes while
 *   reducing fsync overhead; the tradeoff is a small OS-crash data-loss window.
 * - cache_size=-64000 gives SQLite about 64 MB of page cache per connection
 *   using SQLite's negative-KiB form for read-heavy dashboard workloads.
 * - busy_timeout=5000 waits briefly for transient writer locks instead of
 *   immediately throwing SQLITE_BUSY under concurrent activity.
 * - foreign_keys=ON enforces declared relational integrity on every connection.
 */
export function applyDatabasePragmas(db: Database.Database): AppliedSqlitePragmas {
  readPragma<number>(db, 'busy_timeout = 5000');

  const journalMode = supportsWal(db)
    ? String(readPragma<string>(db, 'journal_mode = WAL')).toLowerCase()
    : String(readPragma<string>(db, 'journal_mode')).toLowerCase();

  readPragma<number>(db, 'synchronous = NORMAL');
  readPragma<number>(db, 'cache_size = -64000');
  readPragma<number>(db, 'foreign_keys = ON');

  return readDatabasePragmas(db, journalMode);
}

export function readDatabasePragmas(db: Database.Database, journalModeOverride?: string): AppliedSqlitePragmas {
  return {
    journalMode: (journalModeOverride || String(readPragma<string>(db, 'journal_mode'))).toLowerCase(),
    synchronous: Number(readPragma<number>(db, 'synchronous')),
    cacheSize: Number(readPragma<number>(db, 'cache_size')),
    busyTimeout: Number(readPragma<number>(db, 'busy_timeout')),
    foreignKeys: Number(readPragma<number>(db, 'foreign_keys')),
  };
}

export function verifyDatabasePragmas(db: Database.Database, pragmas = readDatabasePragmas(db)): void {
  if (supportsWal(db) && pragmas.journalMode !== SQLITE_PRAGMA_TARGETS.journalMode) {
    throw new Error(`Expected SQLite journal_mode=${SQLITE_PRAGMA_TARGETS.journalMode}, got ${pragmas.journalMode}`);
  }

  if (pragmas.synchronous !== SQLITE_PRAGMA_TARGETS.synchronous) {
    throw new Error(`Expected SQLite synchronous=NORMAL (${SQLITE_PRAGMA_TARGETS.synchronous}), got ${pragmas.synchronous}`);
  }

  if (pragmas.cacheSize !== SQLITE_PRAGMA_TARGETS.cacheSize) {
    throw new Error(`Expected SQLite cache_size=${SQLITE_PRAGMA_TARGETS.cacheSize}, got ${pragmas.cacheSize}`);
  }

  if (pragmas.busyTimeout !== SQLITE_PRAGMA_TARGETS.busyTimeout) {
    throw new Error(`Expected SQLite busy_timeout=${SQLITE_PRAGMA_TARGETS.busyTimeout}, got ${pragmas.busyTimeout}`);
  }

  if (pragmas.foreignKeys !== SQLITE_PRAGMA_TARGETS.foreignKeys) {
    throw new Error(`Expected SQLite foreign_keys=ON (${SQLITE_PRAGMA_TARGETS.foreignKeys}), got ${pragmas.foreignKeys}`);
  }
}
