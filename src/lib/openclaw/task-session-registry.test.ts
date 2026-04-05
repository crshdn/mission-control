import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTaskSession, endTaskSession } from './task-session-registry';

async function createTestDb() {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gateway_agent_id TEXT
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL
    );

    CREATE TABLE openclaw_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT REFERENCES agents(id),
      openclaw_session_id TEXT NOT NULL,
      channel TEXT,
      status TEXT DEFAULT 'active',
      session_type TEXT DEFAULT 'persistent',
      task_id TEXT REFERENCES tasks(id),
      ended_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO agents (id, name, gateway_agent_id)
    VALUES ('agent-1', 'Builder Agent', 'builder-agent');

    INSERT INTO tasks (id, title)
    VALUES ('task-a', 'Task A'), ('task-b', 'Task B');
  `);

  return db;
}

test('ensureTaskSession isolates gateway sessions per task and reuses the same task session', async () => {
  const db = await createTestDb();
  const agent = { id: 'agent-1', name: 'Builder Agent', gateway_agent_id: 'builder-agent' };

  const firstTaskSession = ensureTaskSession(db, agent, 'task-a', '2026-04-04T10:00:00.000Z');
  const secondTaskSession = ensureTaskSession(db, agent, 'task-b', '2026-04-04T10:01:00.000Z');
  const repeatedFirstTaskSession = ensureTaskSession(db, agent, 'task-a', '2026-04-04T10:02:00.000Z');

  assert.equal(firstTaskSession.task_id, 'task-a');
  assert.equal(secondTaskSession.task_id, 'task-b');
  assert.equal(firstTaskSession.openclaw_session_id, 'task:task-a');
  assert.equal(secondTaskSession.openclaw_session_id, 'task:task-b');
  assert.notEqual(firstTaskSession.id, secondTaskSession.id);
  assert.equal(repeatedFirstTaskSession.id, firstTaskSession.id);

  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM openclaw_sessions').get() as { count: number };
  assert.equal(sessionCount.count, 2);

  db.close();
});

test('endTaskSession only ends the matching task session', async () => {
  const db = await createTestDb();
  const agent = { id: 'agent-1', name: 'Builder Agent', gateway_agent_id: 'builder-agent' };

  ensureTaskSession(db, agent, 'task-a', '2026-04-04T10:00:00.000Z');
  ensureTaskSession(db, agent, 'task-b', '2026-04-04T10:01:00.000Z');

  endTaskSession(db, 'agent-1', 'task-a', '2026-04-04T10:03:00.000Z');

  const sessions = db.prepare(
    'SELECT task_id, status, ended_at FROM openclaw_sessions ORDER BY task_id ASC'
  ).all() as Array<{ task_id: string; status: string; ended_at: string | null }>;

  assert.deepEqual(sessions, [
    { task_id: 'task-a', status: 'ended', ended_at: '2026-04-04T10:03:00.000Z' },
    { task_id: 'task-b', status: 'active', ended_at: null },
  ]);

  db.close();
});