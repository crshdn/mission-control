/**
 * Database Backup Service
 * 
 * Handles on-demand backup creation, listing, restoration, and optional S3 upload
 * for the Mission Control SQLite database.
 * 
 * Backup naming convention: mc-backup-{ISO-timestamp}-v{migration-version}.db
 * Timestamps use dashes instead of colons for filesystem safety.
 * 
 * Safety: restore always creates a pre-restore safety backup first.
 */

import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '@/lib/db';
import { getMigrationStatus } from '@/lib/db/migrations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupMetadata {
  filename: string;
  filepath: string;
  size: number;
  timestamp: string;        // ISO-8601 original timestamp
  migrationVersion: string; // e.g. "021"
  location: 'local' | 's3' | 'both';
  createdAt: string;        // ISO-8601 file creation time
}

export interface BackupResult {
  backup: BackupMetadata;
  s3Uploaded: boolean;
  s3Error?: string;
}

export interface RestoreResult {
  restored: string;
  safetyBackup: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getDbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), 'mission-control.db');
}

function getBackupDir(): string {
  return path.join(process.cwd(), 'backups');
}

function ensureBackupDir(): string {
  const dir = getBackupDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Backup filename parsing
// ---------------------------------------------------------------------------

const BACKUP_PATTERN = /^mc-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?)-v(\d+)\.db$/;

function parseBackupFilename(filename: string): { timestamp: string; version: string } | null {
  const match = filename.match(BACKUP_PATTERN);
  if (!match) return null;
  // Convert filesystem-safe timestamp back to ISO timestamp.
  const timestamp = match[1].replace(
    /T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?$/,
    (_full, hours, minutes, seconds, millis) =>
      `T${hours}:${minutes}:${seconds}${millis ? `.${millis}` : ''}`
  );
  return { timestamp, version: match[2] };
}

function formatTimestamp(date: Date): string {
  return date.toISOString()
    .replace(/:/g, '-')
    .replace(/\.(\d{3})Z$/, '-$1');
}

// ---------------------------------------------------------------------------
// Core: createBackup
// ---------------------------------------------------------------------------

export async function createBackup(): Promise<BackupResult> {
  const db = getDb();
  const backupDir = ensureBackupDir();

  // 1. WAL checkpoint to flush all pending writes
  db.pragma('wal_checkpoint(TRUNCATE)');

  // 2. Determine current migration version
  const { applied } = getMigrationStatus(db);
  const currentVersion = applied.length > 0 ? applied[applied.length - 1] : '000';

  // 3. Build filename
  const timestamp = formatTimestamp(new Date());
  const filename = `mc-backup-${timestamp}-v${currentVersion}.db`;
  const filepath = path.join(backupDir, filename);

  // 4. Copy database file
  const dbPath = getDbPath();
  fs.copyFileSync(dbPath, filepath);

  // 5. Stat the backup
  const stat = fs.statSync(filepath);
  const parsed = parseBackupFilename(filename);

  const metadata: BackupMetadata = {
    filename,
    filepath,
    size: stat.size,
    timestamp: parsed?.timestamp || new Date().toISOString(),
    migrationVersion: currentVersion,
    location: 'local',
    createdAt: stat.birthtime.toISOString(),
  };

  // 6. Optional S3 upload
  let s3Uploaded = false;
  let s3Error: string | undefined;

  if (isS3Configured()) {
    try {
      await uploadToS3(filepath, filename);
      metadata.location = 'both';
      s3Uploaded = true;
    } catch (err) {
      s3Error = err instanceof Error ? err.message : String(err);
      console.warn('[Backup] S3 upload failed (local backup still created):', s3Error);
    }
  }

  console.log(`[Backup] Created: ${filename} (${formatBytes(stat.size)})`);

  return { backup: metadata, s3Uploaded, s3Error };
}

// ---------------------------------------------------------------------------
// Core: listBackups
// ---------------------------------------------------------------------------

export async function listBackups(): Promise<BackupMetadata[]> {
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = fs.readdirSync(backupDir);
  const backups: BackupMetadata[] = [];

  for (const filename of files) {
    const parsed = parseBackupFilename(filename);
    // Also include pre-restore safety backups
    const isPreRestore = filename.startsWith('pre-restore-') && filename.endsWith('.db');

    if (!parsed && !isPreRestore) continue;

    const filepath = path.join(backupDir, filename);

    try {
      const stat = fs.statSync(filepath);
      backups.push({
        filename,
        filepath,
        size: stat.size,
        timestamp: parsed?.timestamp || stat.birthtime.toISOString(),
        migrationVersion: parsed?.version || 'unknown',
        location: 'local', // S3 status checked separately if needed
        createdAt: stat.birthtime.toISOString(),
      });
    } catch {
      // Skip files we can't stat
      continue;
    }
  }

  // Sort newest first
  backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return backups;
}

// ---------------------------------------------------------------------------
// Core: restoreBackup
// ---------------------------------------------------------------------------

export async function restoreBackup(filename: string): Promise<RestoreResult> {
  const backupDir = getBackupDir();
  const backupPath = path.join(backupDir, filename);

  // Validate the backup file exists
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${filename}`);
  }

  // Validate filename doesn't contain path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid backup filename');
  }

  const dbPath = getDbPath();

  // 1. Create safety backup of current database BEFORE restoring
  const safetyTimestamp = formatTimestamp(new Date());
  const safetyFilename = `pre-restore-${safetyTimestamp}.db`;
  const safetyPath = path.join(backupDir, safetyFilename);

  // Close the database first so we get a clean copy
  closeDb();

  try {
    // Copy current DB as safety backup
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, safetyPath);
      console.log(`[Backup] Safety backup created: ${safetyFilename}`);
    }

    // 2. Restore: overwrite current DB with backup
    fs.copyFileSync(backupPath, dbPath);

    // 3. Remove WAL/SHM files if they exist (stale after restore)
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    console.log(`[Backup] Restored from: ${filename}`);
  } catch (err) {
    // If restore fails, try to re-open the DB (which may use the safety backup)
    console.error('[Backup] Restore failed:', err);
    throw err;
  }

  // Next getDb() call will reinitialize the connection to the restored database

  return {
    restored: filename,
    safetyBackup: safetyFilename,
  };
}

// ---------------------------------------------------------------------------
// Core: deleteBackup
// ---------------------------------------------------------------------------

export async function deleteBackup(filename: string): Promise<void> {
  // Validate filename doesn't contain path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid backup filename');
  }

  const backupDir = getBackupDir();
  const filepath = path.join(backupDir, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Backup file not found: ${filename}`);
  }

  fs.unlinkSync(filepath);
  console.log(`[Backup] Deleted: ${filename}`);

  // Optionally delete from S3
  if (isS3Configured()) {
    try {
      await deleteFromS3(filename);
    } catch (err) {
      console.warn('[Backup] S3 delete failed (local deleted):', err);
    }
  }
}

// ---------------------------------------------------------------------------
// S3 integration (optional)
// ---------------------------------------------------------------------------

function getS3Config() {
  return {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION || 'us-east-1',
  };
}

export function isS3Configured(): boolean {
  const config = getS3Config();
  return !!(config.endpoint && config.bucket && config.accessKey && config.secretKey);
}

export function getS3Status(): { configured: boolean; endpoint?: string; bucket?: string } {
  const config = getS3Config();
  return {
    configured: isS3Configured(),
    endpoint: config.endpoint,
    bucket: config.bucket,
  };
}

async function getS3Client() {
  // Dynamic import to avoid requiring @aws-sdk/client-s3 when not configured
  try {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const config = getS3Config();

    return new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey!,
        secretAccessKey: config.secretKey!,
      },
      forcePathStyle: true, // Required for MinIO, Backblaze, etc.
    });
  } catch {
    throw new Error('@aws-sdk/client-s3 is not installed. Run: npm install @aws-sdk/client-s3');
  }
}

export async function uploadToS3(filepath: string, key: string): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client();
  const config = getS3Config();

  const fileBuffer = fs.readFileSync(filepath);

  await client.send(new PutObjectCommand({
    Bucket: config.bucket!,
    Key: `mission-control-backups/${key}`,
    Body: fileBuffer,
    ContentType: 'application/x-sqlite3',
  }));

  console.log(`[Backup] Uploaded to S3: ${key}`);
}

async function deleteFromS3(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client();
  const config = getS3Config();

  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket!,
    Key: `mission-control-backups/${key}`,
  }));

  console.log(`[Backup] Deleted from S3: ${key}`);
}

export async function listS3Backups(): Promise<BackupMetadata[]> {
  if (!isS3Configured()) return [];

  try {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();
    const config = getS3Config();

    const response = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket!,
      Prefix: 'mission-control-backups/',
    }));

    if (!response.Contents) return [];

    return response.Contents
      .filter(obj => obj.Key && obj.Key.endsWith('.db'))
      .map(obj => {
        const filename = obj.Key!.replace('mission-control-backups/', '');
        const parsed = parseBackupFilename(filename);
        return {
          filename,
          filepath: `s3://${config.bucket}/mission-control-backups/${filename}`,
          size: obj.Size || 0,
          timestamp: parsed?.timestamp || (obj.LastModified?.toISOString() ?? new Date().toISOString()),
          migrationVersion: parsed?.version || 'unknown',
          location: 's3' as const,
          createdAt: obj.LastModified?.toISOString() ?? new Date().toISOString(),
        };
      });
  } catch (err) {
    console.warn('[Backup] Failed to list S3 backups:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
