import test from 'node:test';
import assert from 'node:assert/strict';
import { findTaskForSessionCompletion } from './completion-routing';

async function createCompletionDb() {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_agent_id TEXT REFERENCES agents(id),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE openclaw_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT REFERENCES agents(id),
      openclaw_session_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      task_id TEXT REFERENCES tasks(id)
    );

    INSERT INTO agents (id, name)
    VALUES ('agent-1', 'Builder Agent');

    INSERT INTO tasks (id, title, status, assigned_agent_id, updated_at)
    VALUES
      ('task-a', 'Task A', 'in_progress', 'agent-1', '2026-04-04T10:00:00.000Z'),
      ('task-b', 'Task B', 'in_progress', 'agent-1', '2026-04-04T10:05:00.000Z');
  `);

  return db;
}

test('findTaskForSessionCompletion prefers the session task_id over the latest task for the same agent', async () => {
  const db = await createCompletionDb();

  db.exec(`
    INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, status, task_id)
    VALUES ('session-a', 'agent-1', 'task:task-a', 'active', 'task-a');
  `);

  const task = findTaskForSessionCompletion(db, {
    agent_id: 'agent-1',
    task_id: 'task-a',
  });

  assert.ok(task);
  assert.equal(task.id, 'task-a');

  db.close();
});

test('findTaskForSessionCompletion falls back to agent-based lookup for legacy sessions without task_id', async () => {
  const db = await createCompletionDb();

  db.exec(`
    INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, status, task_id)
    VALUES ('legacy-session', 'agent-1', 'mission-control-builder-agent', 'active', NULL);
  `);

  const task = findTaskForSessionCompletion(db, {
    agent_id: 'agent-1',
    task_id: undefined,
  });

  assert.ok(task);
  assert.equal(task.id, 'task-b');

  db.close();
});