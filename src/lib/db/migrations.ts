/**
 * Database Migrations System
 * 
 * Handles schema changes in a production-safe way:
 * 1. Tracks which migrations have been applied
 * 2. Runs new migrations automatically on startup
 * 3. Never runs the same migration twice
 */

import Database from 'better-sqlite3';

interface Migration {
  id: string;
  name: string;
  up: (db: Database.Database) => void;
  transactional?: boolean;
}

// All migrations in order - NEVER remove or reorder existing migrations
const migrations: Migration[] = [
  {
    id: '001',
    name: 'initial_schema',
    up: (db) => {
      // Core tables - these are created in schema.ts on fresh databases
      // This migration exists to mark the baseline for existing databases
      console.log('[Migration 001] Baseline schema marker');
    }
  },
  {
    id: '002',
    name: 'add_workspaces',
    up: (db) => {
      console.log('[Migration 002] Adding workspaces table and columns...');
      
      // Create workspaces table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          icon TEXT DEFAULT '📁',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Insert default workspace if not exists
      db.exec(`
        INSERT OR IGNORE INTO workspaces (id, name, slug, description, icon) 
        VALUES ('default', 'Default Workspace', 'default', 'Default workspace', '🏠');
      `);
      
      // Add workspace_id to tasks if not exists
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'workspace_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)`);
        console.log('[Migration 002] Added workspace_id to tasks');
      }
      
      // Add workspace_id to agents if not exists
      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      if (!agentsInfo.some(col => col.name === 'workspace_id')) {
        db.exec(`ALTER TABLE agents ADD COLUMN workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)`);
        console.log('[Migration 002] Added workspace_id to agents');
      }
    }
  },
  {
    id: '003',
    name: 'add_planning_tables',
    up: (db) => {
      console.log('[Migration 003] Adding planning tables...');
      
      // Create planning_questions table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS planning_questions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          category TEXT NOT NULL,
          question TEXT NOT NULL,
          question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'text', 'yes_no')),
          options TEXT,
          answer TEXT,
          answered_at TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Create planning_specs table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS planning_specs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
          spec_markdown TEXT NOT NULL,
          locked_at TEXT NOT NULL,
          locked_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Create index
      db.exec(`CREATE INDEX IF NOT EXISTS idx_planning_questions_task ON planning_questions(task_id, sort_order)`);
      
      // Update tasks status check constraint to include 'planning'
      // SQLite doesn't support ALTER CONSTRAINT, so we check if it's needed
      const taskSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
      if (taskSchema && !taskSchema.sql.includes("'planning'")) {
        console.log('[Migration 003] Note: tasks table needs planning status - will be handled by schema recreation on fresh dbs');
      }
    }
  },
  {
    id: '004',
    name: 'add_planning_session_columns',
    up: (db) => {
      console.log('[Migration 004] Adding planning session columns to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      // Add planning_session_key column
      if (!tasksInfo.some(col => col.name === 'planning_session_key')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_session_key TEXT`);
        console.log('[Migration 004] Added planning_session_key');
      }

      // Add planning_messages column (stores JSON array of messages)
      if (!tasksInfo.some(col => col.name === 'planning_messages')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_messages TEXT`);
        console.log('[Migration 004] Added planning_messages');
      }

      // Add planning_complete column
      if (!tasksInfo.some(col => col.name === 'planning_complete')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_complete INTEGER DEFAULT 0`);
        console.log('[Migration 004] Added planning_complete');
      }

      // Add planning_spec column (stores final spec JSON)
      if (!tasksInfo.some(col => col.name === 'planning_spec')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_spec TEXT`);
        console.log('[Migration 004] Added planning_spec');
      }

      // Add planning_agents column (stores generated agents JSON)
      if (!tasksInfo.some(col => col.name === 'planning_agents')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_agents TEXT`);
        console.log('[Migration 004] Added planning_agents');
      }
    }
  },
  {
    id: '005',
    name: 'add_agent_model_field',
    up: (db) => {
      console.log('[Migration 005] Adding model field to agents...');

      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];

      // Add model column
      if (!agentsInfo.some(col => col.name === 'model')) {
        db.exec(`ALTER TABLE agents ADD COLUMN model TEXT`);
        console.log('[Migration 005] Added model to agents');
      }
    }
  },
  {
    id: '006',
    name: 'add_planning_dispatch_error_column',
    up: (db) => {
      console.log('[Migration 006] Adding planning_dispatch_error column to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      // Add planning_dispatch_error column
      if (!tasksInfo.some(col => col.name === 'planning_dispatch_error')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_dispatch_error TEXT`);
        console.log('[Migration 006] Added planning_dispatch_error to tasks');
      }
    }
  },
  {
    id: '007',
    name: 'add_agent_source_and_gateway_id',
    up: (db) => {
      console.log('[Migration 007] Adding source and gateway_agent_id to agents...');

      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];

      // Add source column: 'local' for MC-created, 'gateway' for imported from OpenClaw Gateway
      if (!agentsInfo.some(col => col.name === 'source')) {
        db.exec(`ALTER TABLE agents ADD COLUMN source TEXT DEFAULT 'local'`);
        console.log('[Migration 007] Added source to agents');
      }

      // Add gateway_agent_id column: stores the original agent ID/name from the Gateway
      if (!agentsInfo.some(col => col.name === 'gateway_agent_id')) {
        db.exec(`ALTER TABLE agents ADD COLUMN gateway_agent_id TEXT`);
        console.log('[Migration 007] Added gateway_agent_id to agents');
      }
    }
  },
  {
    id: '008',
    name: 'add_task_result_field',
    up: (db) => {
      console.log('[Migration 008] Adding result field to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      // Add result column to store agent output when task completes
      if (!tasksInfo.some(col => col.name === 'result')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN result TEXT`);
        console.log('[Migration 008] Added result to tasks');
      }

      // Add result_captured_at column to track when result was captured
      if (!tasksInfo.some(col => col.name === 'result_captured_at')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN result_captured_at TEXT`);
        console.log('[Migration 008] Added result_captured_at to tasks');
      }
    }
  },
  {
    id: '010',
    name: 'add_brief_content_field',
    up: (db) => {
      console.log('[Migration 010] Adding brief_content field to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      // Add brief_content column to store brief file content
      if (!tasksInfo.some(col => col.name === 'brief_content')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN brief_content TEXT`);
        console.log('[Migration 010] Added brief_content to tasks');
      }
    }
  },
  {
    id: '011',
    name: 'add_process_v2_fields',
    up: (db) => {
      console.log('[Migration 011] Adding PROCESS-V2 fields to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      if (!tasksInfo.some(col => col.name === 'task_type')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN task_type TEXT CHECK (task_type IN ('bug_fix', 'feature', 'compliance_batch', 'research', 'maintenance', 'documentation', 'ops'))`);
        console.log('[Migration 011] Added task_type to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'qc_status')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN qc_status TEXT DEFAULT 'pending' CHECK (qc_status IN ('pending', 'passed', 'failed', 'skipped'))`);
        console.log('[Migration 011] Added qc_status to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'qc_last_run')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN qc_last_run TEXT`);
        console.log('[Migration 011] Added qc_last_run to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'qc_failures')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN qc_failures TEXT`);
        console.log('[Migration 011] Added qc_failures to tasks (JSON array)');
      }

      if (!tasksInfo.some(col => col.name === 'tags')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN tags TEXT`);
        console.log('[Migration 011] Added tags to tasks (JSON array)');
      }

      // Index for fast qc_status lookups (nightly sweep, compliance queries)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_qc_status ON tasks(qc_status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type)`);

      console.log('[Migration 011] PROCESS-V2 fields added successfully');
    }
  },
  {
    id: '012',
    name: 'normalize_task_type_categories',
    transactional: false,
    up: (db) => {
      console.log('[Migration 012] Normalizing task_type categories and rebuilding tasks table constraints...');

      const tasksTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get() as { sql?: string } | undefined;
      const currentSql = tasksTable?.sql || '';
      if (currentSql.includes("task_type IN ('bug_fix', 'feature', 'compliance_batch', 'research', 'maintenance', 'documentation', 'ops')")) {
        console.log('[Migration 012] tasks table already uses task metadata v3 categories; skipping rebuild');
        return;
      }

      db.exec(`
        PRAGMA foreign_keys = OFF;

        ALTER TABLE tasks RENAME TO tasks_old;

        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'inbox' CHECK (status IN ('pending_dispatch', 'planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'done')),
          priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
          task_type TEXT CHECK (task_type IN ('bug_fix', 'feature', 'compliance_batch', 'research', 'maintenance', 'documentation', 'ops')),
          qc_status TEXT DEFAULT 'pending' CHECK (qc_status IN ('pending', 'passed', 'failed', 'skipped')),
          qc_last_run TEXT,
          qc_failures TEXT,
          tags TEXT,
          assigned_agent_id TEXT REFERENCES agents(id),
          created_by_agent_id TEXT REFERENCES agents(id),
          workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
          business_id TEXT DEFAULT 'default',
          due_date TEXT,
          planning_session_key TEXT,
          planning_messages TEXT,
          planning_complete INTEGER DEFAULT 0,
          planning_spec TEXT,
          planning_agents TEXT,
          planning_dispatch_error TEXT,
          execution_state TEXT,
          result TEXT,
          result_captured_at TEXT,
          verification_output TEXT,
          verified_at TEXT,
          output_url TEXT,
          brief_content TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        INSERT INTO tasks (
          id, title, description, status, priority, task_type, qc_status, qc_last_run, qc_failures, tags,
          assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date,
          planning_session_key, planning_messages, planning_complete, planning_spec, planning_agents, planning_dispatch_error,
          execution_state, result, result_captured_at, verification_output, verified_at, output_url, brief_content,
          created_at, updated_at
        )
        SELECT
          id, title, description, status, priority,
          CASE
            WHEN task_type IN ('new_tool', 'feature', 'build') THEN 'feature'
            WHEN task_type IN ('tool_fix', 'bug', 'fix') THEN 'bug_fix'
            WHEN task_type IN ('qa', 'compliance_batch') THEN 'compliance_batch'
            WHEN task_type IN ('research', 'maintenance', 'documentation', 'ops', 'bug_fix') THEN task_type
            ELSE NULL
          END AS task_type,
          CASE
            WHEN qc_status = 'pass' THEN 'passed'
            WHEN qc_status = 'fail' THEN 'failed'
            WHEN qc_status = 'not_covered' THEN 'skipped'
            WHEN qc_status IN ('pending', 'passed', 'failed', 'skipped') THEN qc_status
            ELSE 'pending'
          END AS qc_status,
          qc_last_run, qc_failures, tags,
          assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date,
          planning_session_key, planning_messages, planning_complete, planning_spec, planning_agents, planning_dispatch_error,
          execution_state, result, result_captured_at, verification_output, verified_at, output_url, brief_content,
          created_at, updated_at
        FROM tasks_old;

        DROP TABLE tasks_old;

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_qc_status ON tasks(qc_status);
        CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);

        PRAGMA foreign_keys = ON;
      `);

      console.log('[Migration 012] task_type categories normalized successfully');
    }
  }
];

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Get already applied migrations
  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map(m => m.id)
  );
  
  // Run pending migrations in order
  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    
    console.log(`[DB] Running migration ${migration.id}: ${migration.name}`);
    
    try {
      if (migration.transactional === false) {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
      } else {
        // Run migration in a transaction
        db.transaction(() => {
          migration.up(db);
          db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
        })();
      }
      
      console.log(`[DB] Migration ${migration.id} completed`);
    } catch (error) {
      console.error(`[DB] Migration ${migration.id} failed:`, error);
      throw error;
    }
  }
}

/**
 * Get migration status
 */
export function getMigrationStatus(db: Database.Database): { applied: string[]; pending: string[] } {
  const applied = (db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map(m => m.id);
  const pending = migrations.filter(m => !applied.includes(m.id)).map(m => m.id);
  return { applied, pending };
}
