/**
 * Database Migrations System
 * 
 * Handles schema changes in a production-safe way:
 * 1. Tracks which migrations have been applied
 * 2. Runs new migrations automatically on startup
 * 3. Never runs the same migration twice
 * 4. Creates a timestamped backup before any migration runs
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { bootstrapCoreAgentsRaw } from '@/lib/bootstrap-agents';

interface Migration {
  id: string;
  name: string;
  up: (db: Database.Database) => void;
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
    name: 'add_status_reason_column',
    up: (db) => {
      console.log('[Migration 008] Adding status_reason column to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      if (!tasksInfo.some(col => col.name === 'status_reason')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN status_reason TEXT`);
        console.log('[Migration 008] Added status_reason to tasks');
      }
    }
  },
  {
    id: '009',
    name: 'add_agent_session_key_prefix',
    up: (db) => {
      console.log('[Migration 009] Adding session_key_prefix to agents...');

      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];

      if (!agentsInfo.some(col => col.name === 'session_key_prefix')) {
        db.exec(`ALTER TABLE agents ADD COLUMN session_key_prefix TEXT`);
        console.log('[Migration 009] Added session_key_prefix to agents');
      }
    }
  },
  {
    id: '010',
    name: 'add_workflow_templates_roles_knowledge',
    up: (db) => {
      console.log('[Migration 010] Adding workflow templates, task roles, and knowledge tables...');

      // Create workflow_templates table
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_templates (
          id TEXT PRIMARY KEY,
          workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
          name TEXT NOT NULL,
          description TEXT,
          stages TEXT NOT NULL,
          fail_targets TEXT,
          is_default INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace ON workflow_templates(workspace_id)`);

      // Create task_roles table
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_roles (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          agent_id TEXT NOT NULL REFERENCES agents(id),
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(task_id, role)
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_roles_task ON task_roles(task_id)`);

      // Create knowledge_entries table
      db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_entries (
          id TEXT PRIMARY KEY,
          workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
          task_id TEXT REFERENCES tasks(id),
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT,
          confidence REAL DEFAULT 0.5,
          created_by_agent_id TEXT REFERENCES agents(id),
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_entries_workspace ON knowledge_entries(workspace_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_entries_task ON knowledge_entries(task_id)`);

      // Add workflow_template_id to tasks
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'workflow_template_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN workflow_template_id TEXT REFERENCES workflow_templates(id)`);
        console.log('[Migration 010] Added workflow_template_id to tasks');
      }

      // Recreate tasks table to add 'verification' + 'pending_dispatch' to status CHECK constraint
      // SQLite doesn't support ALTER CONSTRAINT, so we need table recreation
      const taskSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
      if (taskSchema && !taskSchema.sql.includes("'verification'")) {
        console.log('[Migration 010] Recreating tasks table to add verification status...');

        // Get current column names from the old table
        const oldCols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(c => c.name);
        const hasWorkflowCol = oldCols.includes('workflow_template_id');

        db.exec(`ALTER TABLE tasks RENAME TO _tasks_old_010`);
        db.exec(`
          CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'inbox' CHECK (status IN ('pending_dispatch', 'planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'verification', 'done')),
            priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
            assigned_agent_id TEXT REFERENCES agents(id),
            created_by_agent_id TEXT REFERENCES agents(id),
            workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
            business_id TEXT DEFAULT 'default',
            due_date TEXT,
            workflow_template_id TEXT REFERENCES workflow_templates(id),
            planning_session_key TEXT,
            planning_messages TEXT,
            planning_complete INTEGER DEFAULT 0,
            planning_spec TEXT,
            planning_agents TEXT,
            planning_dispatch_error TEXT,
            status_reason TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `);

        // Copy data with explicit column mapping
        const sharedCols = 'id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, planning_session_key, planning_messages, planning_complete, planning_spec, planning_agents, planning_dispatch_error, status_reason, created_at, updated_at';

        if (hasWorkflowCol) {
          db.exec(`
            INSERT INTO tasks (${sharedCols}, workflow_template_id)
            SELECT ${sharedCols}, workflow_template_id FROM _tasks_old_010
          `);
        } else {
          db.exec(`
            INSERT INTO tasks (${sharedCols})
            SELECT ${sharedCols} FROM _tasks_old_010
          `);
        }

        db.exec(`DROP TABLE _tasks_old_010`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)`);
        console.log('[Migration 010] Tasks table recreated with verification status');
      }

      // Seed default workflow templates for the 'default' workspace
      const existingTemplates = db.prepare('SELECT COUNT(*) as count FROM workflow_templates').get() as { count: number };
      if (existingTemplates.count === 0) {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO workflow_templates (id, workspace_id, name, description, stages, fail_targets, is_default, created_at, updated_at)
          VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'tpl-simple',
          'Simple',
          'Builder only — for quick, straightforward tasks',
          JSON.stringify([
            { id: 'build', label: 'Build', role: 'builder', status: 'in_progress' },
            { id: 'done', label: 'Done', role: null, status: 'done' }
          ]),
          JSON.stringify({}),
          0, now, now
        );

        db.prepare(`
          INSERT INTO workflow_templates (id, workspace_id, name, description, stages, fail_targets, is_default, created_at, updated_at)
          VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'tpl-standard',
          'Standard',
          'Builder → Tester → Reviewer — for most projects',
          JSON.stringify([
            { id: 'build', label: 'Build', role: 'builder', status: 'in_progress' },
            { id: 'test', label: 'Test', role: 'tester', status: 'testing' },
            { id: 'review', label: 'Review', role: 'reviewer', status: 'review' },
            { id: 'done', label: 'Done', role: null, status: 'done' }
          ]),
          JSON.stringify({ testing: 'in_progress', review: 'in_progress' }),
          1, now, now
        );

        db.prepare(`
          INSERT INTO workflow_templates (id, workspace_id, name, description, stages, fail_targets, is_default, created_at, updated_at)
          VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'tpl-strict',
          'Strict',
          'Builder → Tester → Verifier + Learner — for critical projects',
          JSON.stringify([
            { id: 'build', label: 'Build', role: 'builder', status: 'in_progress' },
            { id: 'test', label: 'Test', role: 'tester', status: 'testing' },
            { id: 'review', label: 'Review', role: null, status: 'review' },
            { id: 'verify', label: 'Verify', role: 'verifier', status: 'verification' },
            { id: 'done', label: 'Done', role: null, status: 'done' }
          ]),
          JSON.stringify({ testing: 'in_progress', review: 'in_progress', verification: 'in_progress' }),
          0, now, now
        );

        console.log('[Migration 010] Seeded default workflow templates');
      }
    }
  },
  {
    id: '011',
    name: 'fix_broken_fk_references',
    up: (db) => {
      // Migration 010 renamed tasks → _tasks_old_010, which caused SQLite to
      // rewrite FK references in ALL child tables to point to "_tasks_old_010".
      // After dropping _tasks_old_010, those FK references became dangling.
      // Fix: recreate affected tables with correct FK references.
      console.log('[Migration 011] Fixing broken FK references from migration 010...');

      const broken = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%_tasks_old_010%'`
      ).all() as { name: string }[];

      if (broken.length === 0) {
        console.log('[Migration 011] No broken FK references found — skipping');
        return;
      }

      // Table definitions with correct FK references to tasks(id)
      const tableDefinitions: Record<string, string> = {
        planning_questions: `CREATE TABLE planning_questions (
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
        )`,
        planning_specs: `CREATE TABLE planning_specs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
          spec_markdown TEXT NOT NULL,
          locked_at TEXT NOT NULL,
          locked_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        conversations: `CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          title TEXT,
          type TEXT DEFAULT 'direct' CHECK (type IN ('direct', 'group', 'task')),
          task_id TEXT REFERENCES tasks(id),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`,
        events: `CREATE TABLE events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          agent_id TEXT REFERENCES agents(id),
          task_id TEXT REFERENCES tasks(id),
          message TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        openclaw_sessions: `CREATE TABLE openclaw_sessions (
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
        )`,
        task_activities: `CREATE TABLE task_activities (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          agent_id TEXT REFERENCES agents(id),
          activity_type TEXT NOT NULL,
          message TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        task_deliverables: `CREATE TABLE task_deliverables (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          deliverable_type TEXT NOT NULL,
          title TEXT NOT NULL,
          path TEXT,
          description TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        task_roles: `CREATE TABLE task_roles (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          agent_id TEXT NOT NULL REFERENCES agents(id),
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(task_id, role)
        )`,
      };

      for (const { name } of broken) {
        const newSql = tableDefinitions[name];
        if (!newSql) {
          console.warn(`[Migration 011] No definition for table ${name} — skipping`);
          continue;
        }

        // Get column names from old table
        const cols = (db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[])
          .map(c => c.name).join(', ');

        const tmpName = `_${name}_fix_011`;
        db.exec(`ALTER TABLE ${name} RENAME TO ${tmpName}`);
        db.exec(newSql);
        db.exec(`INSERT INTO ${name} (${cols}) SELECT ${cols} FROM ${tmpName}`);
        db.exec(`DROP TABLE ${tmpName}`);
        console.log(`[Migration 011] Recreated table: ${name}`);
      }

      // Recreate indexes for affected tables
      db.exec(`CREATE INDEX IF NOT EXISTS idx_planning_questions_task ON planning_questions(task_id, sort_order)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_roles_task ON task_roles(task_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_task ON task_activities(task_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_deliverables_task ON task_deliverables(task_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_openclaw_sessions_task ON openclaw_sessions(task_id)`);

      console.log('[Migration 011] All broken FK references fixed');
    }
  },
  {
    id: '012',
    name: 'fix_strict_template_review_queue',
    up: (db) => {
      // Update Strict template: review is a queue (no role), verification is the active QC step.
      // Also fix the seed data in migration 010 for new databases.
      console.log('[Migration 012] Updating Strict workflow template...');

      const strictStages = JSON.stringify([
        { id: 'build', label: 'Build', role: 'builder', status: 'in_progress' },
        { id: 'test', label: 'Test', role: 'tester', status: 'testing' },
        { id: 'review', label: 'Review', role: null, status: 'review' },
        { id: 'verify', label: 'Verify', role: 'verifier', status: 'verification' },
        { id: 'done', label: 'Done', role: null, status: 'done' }
      ]);

      const updated = db.prepare(
        `UPDATE workflow_templates
         SET stages = ?, description = ?, updated_at = datetime('now')
         WHERE id = 'tpl-strict'`
      ).run(strictStages, 'Builder → Tester → Verifier + Learner — for critical projects');

      if (updated.changes > 0) {
        console.log('[Migration 012] Strict template updated (review is now a queue)');
      } else {
        console.log('[Migration 012] No tpl-strict found — will be correct on fresh seed');
      }
    }
  },
  {
    id: '013',
    name: 'reset_fresh_start',
    up: (db) => {
      // Safety guard: this migration was originally a one-time developer reset tool.
      // If the database already contains real data (existing tasks, agents, etc.), we
      // skip the destructive DELETE operations entirely to prevent accidental data loss
      // on existing deployments. The non-destructive parts (template configuration)
      // still run safely regardless.
      //
      // Background: migration 013 was committed as a dev convenience "fresh start".
      // It should never silently wipe a production database that has accumulated real
      // work. A database with tasks in it is NOT a "fresh start" candidate.
      const taskCount = (db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count;
      const agentCount = (db.prepare("SELECT COUNT(*) as count FROM agents WHERE source = 'local'").get() as { count: number }).count;
      // Check BOTH tables: a database with configured local agents but no tasks yet
      // (e.g. fresh install where agents were bootstrapped but no work has been submitted)
      // should NOT be wiped — the user's agent configuration is real data worth preserving.
      const hasRealData = taskCount > 0 || agentCount > 0;

      if (hasRealData) {
        console.warn(`[Migration 013] WARNING: Skipping data wipe — database has ${taskCount} task(s) and ${agentCount} local agent(s).`);
        console.warn('[Migration 013] This migration is a dev-only reset tool and will not destroy real data.');
      } else {
        console.log('[Migration 013] Fresh database detected — wiping seed data and bootstrapping...');

        // 1. Delete all row data (keep workspaces + workflow_templates infrastructure)
        const tablesToWipe = [
          'task_roles',
          'task_activities',
          'task_deliverables',
          'planning_questions',
          'planning_specs',
          'knowledge_entries',
          'messages',
          'conversation_participants',
          'conversations',
          'events',
          'openclaw_sessions',
          'agents',
          'tasks',
        ];
        for (const table of tablesToWipe) {
          try {
            db.exec(`DELETE FROM ${table}`);
            console.log(`[Migration 013] Wiped ${table}`);
          } catch (err) {
            // Table might not exist on fresh DBs — skip silently
            console.log(`[Migration 013] Table ${table} not found — skipping`);
          }
        }
      }

      // 2. Make Strict the default template, Standard non-default
      // (non-destructive config change — safe to apply regardless of data presence)
      db.exec(`UPDATE workflow_templates SET is_default = 0 WHERE id = 'tpl-standard'`);
      db.exec(`UPDATE workflow_templates SET is_default = 1 WHERE id = 'tpl-strict'`);

      // 3. Fix Strict template: verification role → 'reviewer' (was 'verifier')
      // (non-destructive update — safe to apply regardless of data presence)
      const fixedStages = JSON.stringify([
        { id: 'build',  label: 'Build',  role: 'builder',  status: 'in_progress' },
        { id: 'test',   label: 'Test',   role: 'tester',   status: 'testing' },
        { id: 'review', label: 'Review', role: null,        status: 'review' },
        { id: 'verify', label: 'Verify', role: 'reviewer',  status: 'verification' },
        { id: 'done',   label: 'Done',   role: null,        status: 'done' },
      ]);
      db.prepare(
        `UPDATE workflow_templates SET stages = ?, description = ?, updated_at = datetime('now') WHERE id = 'tpl-strict'`
      ).run(fixedStages, 'Builder → Tester → Reviewer + Learner — for critical projects');

      console.log('[Migration 013] Strict template is now default with reviewer role');

      // 4. Bootstrap 4 core agents for the default workspace
      // (bootstrapCoreAgentsRaw already guards against duplicate inserts — it checks
      // agent count and skips if the workspace already has agents)
      const missionControlUrl = process.env.MISSION_CONTROL_URL || 'http://localhost:4000';
      bootstrapCoreAgentsRaw(db, 'default', missionControlUrl);

      if (hasRealData) {
        console.log(`[Migration 013] Complete (data wipe skipped — ${taskCount} task(s) and ${agentCount} local agent(s) preserved)`);
      } else {
        console.log('[Migration 013] Fresh start complete');
      }
    }
  },
  {
    id: '014',
    name: 'add_task_images_column',
    up: (db) => {
      console.log('[Migration 014] Adding images column to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      if (!tasksInfo.some(col => col.name === 'images')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN images TEXT`);
        console.log('[Migration 014] Added images column to tasks');
      }
    }
  },
  {
    id: '015',
    name: 'add_convoy_mode',
    up: (db) => {
      console.log('[Migration 015] Adding convoy mode tables and columns...');

      // 1. Create new tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS convoys (
          id TEXT PRIMARY KEY,
          parent_task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completing', 'done', 'failed')),
          decomposition_strategy TEXT DEFAULT 'manual' CHECK (decomposition_strategy IN ('manual', 'ai', 'planning')),
          decomposition_spec TEXT,
          total_subtasks INTEGER DEFAULT 0,
          completed_subtasks INTEGER DEFAULT 0,
          failed_subtasks INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS convoy_subtasks (
          id TEXT PRIMARY KEY,
          convoy_id TEXT NOT NULL REFERENCES convoys(id) ON DELETE CASCADE,
          task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
          sort_order INTEGER DEFAULT 0,
          depends_on TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_health (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          task_id TEXT REFERENCES tasks(id),
          health_state TEXT DEFAULT 'idle' CHECK (health_state IN ('idle', 'working', 'stalled', 'stuck', 'zombie', 'offline')),
          last_activity_at TEXT,
          last_checkpoint_at TEXT,
          progress_score REAL DEFAULT 0,
          consecutive_stall_checks INTEGER DEFAULT 0,
          metadata TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS work_checkpoints (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          agent_id TEXT NOT NULL REFERENCES agents(id),
          checkpoint_type TEXT DEFAULT 'auto' CHECK (checkpoint_type IN ('auto', 'manual', 'crash_recovery')),
          state_summary TEXT NOT NULL,
          files_snapshot TEXT,
          context_data TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_mailbox (
          id TEXT PRIMARY KEY,
          convoy_id TEXT NOT NULL REFERENCES convoys(id) ON DELETE CASCADE,
          from_agent_id TEXT NOT NULL REFERENCES agents(id),
          to_agent_id TEXT NOT NULL REFERENCES agents(id),
          subject TEXT,
          body TEXT NOT NULL,
          read_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // 2. Add convoy columns to tasks
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'convoy_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN convoy_id TEXT`);
        console.log('[Migration 015] Added convoy_id to tasks');
      }
      if (!tasksInfo.some(col => col.name === 'is_subtask')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN is_subtask INTEGER DEFAULT 0`);
        console.log('[Migration 015] Added is_subtask to tasks');
      }

      // 3. Recreate tasks table to add 'convoy_active' to status CHECK constraint
      const taskSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
      if (taskSchema && !taskSchema.sql.includes("'convoy_active'")) {
        console.log('[Migration 015] Recreating tasks table to add convoy_active status...');

        const oldCols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(c => c.name);

        db.exec(`ALTER TABLE tasks RENAME TO _tasks_old_015`);
        db.exec(`
          CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'inbox' CHECK (status IN ('pending_dispatch', 'planning', 'inbox', 'assigned', 'in_progress', 'convoy_active', 'testing', 'review', 'verification', 'done')),
            priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
            assigned_agent_id TEXT REFERENCES agents(id),
            created_by_agent_id TEXT REFERENCES agents(id),
            workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
            business_id TEXT DEFAULT 'default',
            due_date TEXT,
            workflow_template_id TEXT REFERENCES workflow_templates(id),
            planning_session_key TEXT,
            planning_messages TEXT,
            planning_complete INTEGER DEFAULT 0,
            planning_spec TEXT,
            planning_agents TEXT,
            planning_dispatch_error TEXT,
            status_reason TEXT,
            images TEXT,
            convoy_id TEXT,
            is_subtask INTEGER DEFAULT 0,
            retry_count INTEGER DEFAULT 0,
            next_retry_at TEXT,
            dispatch_lock TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `);

        // Copy data — only columns that exist in BOTH old and new tables
        const newCols = new Set(
          (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(c => c.name)
        );
        const safeCols = oldCols.filter(c => newCols.has(c)).join(', ');
        db.exec(`INSERT INTO tasks (${safeCols}) SELECT ${safeCols} FROM _tasks_old_015`);
        db.exec(`DROP TABLE _tasks_old_015`);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)`);
        console.log('[Migration 015] Tasks table recreated with convoy_active status');
      }

      // 4. Create indexes for new tables
      db.exec(`CREATE INDEX IF NOT EXISTS idx_convoys_parent ON convoys(parent_task_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_convoys_status ON convoys(status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_convoy_subtasks_convoy ON convoy_subtasks(convoy_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_convoy_subtasks_task ON convoy_subtasks(task_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_health_agent ON agent_health(agent_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_health_state ON agent_health(health_state)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_work_checkpoints_task ON work_checkpoints(task_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_mailbox_to ON agent_mailbox(to_agent_id, read_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_mailbox_convoy ON agent_mailbox(convoy_id)`);

      console.log('[Migration 015] Convoy mode tables and indexes created');
    }
  },
  {
    id: '016',
    name: 'add_product_autopilot',
    up: (db) => {
      console.log('[Migration 016] Adding Product Autopilot tables...');

      // 1. Create new tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id),
          name TEXT NOT NULL,
          description TEXT,
          repo_url TEXT,
          live_url TEXT,
          product_program TEXT,
          icon TEXT DEFAULT '🚀',
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
          settings TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS research_cycles (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
          report TEXT,
          ideas_generated INTEGER DEFAULT 0,
          cost_usd REAL DEFAULT 0,
          tokens_used INTEGER DEFAULT 0,
          agent_id TEXT REFERENCES agents(id),
          started_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT,
          error_message TEXT
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS ideas (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          cycle_id TEXT REFERENCES research_cycles(id),
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN (
            'feature', 'improvement', 'ux', 'performance', 'integration',
            'infrastructure', 'content', 'growth', 'monetization', 'operations', 'security'
          )),
          research_backing TEXT,
          impact_score REAL,
          feasibility_score REAL,
          complexity TEXT CHECK (complexity IN ('S', 'M', 'L', 'XL')),
          estimated_effort_hours REAL,
          competitive_analysis TEXT,
          target_user_segment TEXT,
          revenue_potential TEXT,
          technical_approach TEXT,
          risks TEXT,
          tags TEXT,
          source TEXT DEFAULT 'research' CHECK (source IN ('research', 'manual', 'resurfaced', 'feedback')),
          source_research TEXT,
          status TEXT DEFAULT 'pending' CHECK (status IN (
            'pending', 'approved', 'rejected', 'maybe', 'building', 'built', 'shipped'
          )),
          swiped_at TEXT,
          task_id TEXT REFERENCES tasks(id),
          user_notes TEXT,
          resurfaced_from TEXT REFERENCES ideas(id),
          resurfaced_reason TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS swipe_history (
          id TEXT PRIMARY KEY,
          idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'maybe', 'fire')),
          category TEXT NOT NULL,
          tags TEXT,
          impact_score REAL,
          feasibility_score REAL,
          complexity TEXT,
          user_notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS preference_models (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          model_type TEXT DEFAULT 'simple' CHECK (model_type IN ('simple', 'advanced')),
          category_weights TEXT,
          tag_weights TEXT,
          complexity_weights TEXT,
          patterns TEXT,
          learned_preferences_md TEXT,
          total_swipes INTEGER DEFAULT 0,
          approval_rate REAL DEFAULT 0,
          last_updated TEXT DEFAULT (datetime('now')),
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS maybe_pool (
          id TEXT PRIMARY KEY,
          idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          last_evaluated_at TEXT,
          next_evaluate_at TEXT,
          evaluation_count INTEGER DEFAULT 0,
          evaluation_notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS product_feedback (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          source TEXT NOT NULL,
          content TEXT NOT NULL,
          customer_id TEXT,
          category TEXT,
          sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
          processed INTEGER DEFAULT 0,
          idea_id TEXT REFERENCES ideas(id),
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS cost_events (
          id TEXT PRIMARY KEY,
          product_id TEXT REFERENCES products(id),
          workspace_id TEXT NOT NULL REFERENCES workspaces(id),
          task_id TEXT REFERENCES tasks(id),
          cycle_id TEXT REFERENCES research_cycles(id),
          agent_id TEXT REFERENCES agents(id),
          event_type TEXT NOT NULL CHECK (event_type IN (
            'agent_dispatch', 'research_cycle', 'ideation_cycle', 'build_task',
            'content_generation', 'seo_analysis', 'web_search', 'external_api'
          )),
          provider TEXT,
          model TEXT,
          tokens_input INTEGER DEFAULT 0,
          tokens_output INTEGER DEFAULT 0,
          cost_usd REAL DEFAULT 0,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS cost_caps (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id),
          product_id TEXT REFERENCES products(id),
          cap_type TEXT NOT NULL CHECK (cap_type IN ('per_cycle', 'per_task', 'daily', 'monthly', 'per_product_monthly')),
          limit_usd REAL NOT NULL,
          current_spend_usd REAL DEFAULT 0,
          period_start TEXT,
          period_end TEXT,
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'exceeded')),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS product_schedules (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          schedule_type TEXT NOT NULL CHECK (schedule_type IN (
            'research', 'ideation', 'maybe_reevaluation', 'seo_audit',
            'content_refresh', 'analytics_report', 'social_batch', 'growth_experiment'
          )),
          cron_expression TEXT NOT NULL,
          timezone TEXT DEFAULT 'America/Denver',
          enabled INTEGER DEFAULT 1,
          last_run_at TEXT,
          next_run_at TEXT,
          config TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS operations_log (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          operation_type TEXT NOT NULL CHECK (operation_type IN (
            'seo_audit', 'content_publish', 'content_refresh', 'social_post',
            'keyword_research', 'analytics_report', 'growth_experiment',
            'feedback_processing', 'preference_update'
          )),
          status TEXT DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
          summary TEXT,
          details TEXT,
          cost_usd REAL DEFAULT 0,
          agent_id TEXT REFERENCES agents(id),
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS content_inventory (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          content_type TEXT NOT NULL CHECK (content_type IN (
            'blog_post', 'documentation', 'tutorial', 'landing_page', 'changelog',
            'newsletter', 'faq', 'social_post', 'guide', 'case_study'
          )),
          title TEXT NOT NULL,
          url TEXT,
          status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
          target_keywords TEXT,
          performance TEXT,
          last_refreshed_at TEXT,
          idea_id TEXT REFERENCES ideas(id),
          task_id TEXT REFERENCES tasks(id),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS social_queue (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          platform TEXT NOT NULL CHECK (platform IN ('twitter', 'linkedin', 'facebook', 'instagram', 'reddit', 'other')),
          content TEXT NOT NULL,
          media_url TEXT,
          suggested_post_time TEXT,
          status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'posted', 'failed')),
          posted_at TEXT,
          performance TEXT,
          idea_id TEXT REFERENCES ideas(id),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS seo_keywords (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          keyword TEXT NOT NULL,
          current_position REAL,
          previous_position REAL,
          impressions INTEGER DEFAULT 0,
          clicks INTEGER DEFAULT 0,
          ctr REAL DEFAULT 0,
          target_position REAL,
          status TEXT DEFAULT 'tracking' CHECK (status IN ('tracking', 'optimizing', 'achieved', 'abandoned')),
          content_ids TEXT,
          last_checked_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // 2. Add columns to existing tables
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'product_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN product_id TEXT REFERENCES products(id)`);
        console.log('[Migration 016] Added product_id to tasks');
      }
      if (!tasksInfo.some(col => col.name === 'idea_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN idea_id TEXT REFERENCES ideas(id)`);
        console.log('[Migration 016] Added idea_id to tasks');
      }
      if (!tasksInfo.some(col => col.name === 'estimated_cost_usd')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN estimated_cost_usd REAL`);
        console.log('[Migration 016] Added estimated_cost_usd to tasks');
      }
      if (!tasksInfo.some(col => col.name === 'actual_cost_usd')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN actual_cost_usd REAL DEFAULT 0`);
        console.log('[Migration 016] Added actual_cost_usd to tasks');
      }

      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      if (!agentsInfo.some(col => col.name === 'total_cost_usd')) {
        db.exec(`ALTER TABLE agents ADD COLUMN total_cost_usd REAL DEFAULT 0`);
        console.log('[Migration 016] Added total_cost_usd to agents');
      }
      if (!agentsInfo.some(col => col.name === 'total_tokens_used')) {
        db.exec(`ALTER TABLE agents ADD COLUMN total_tokens_used INTEGER DEFAULT 0`);
        console.log('[Migration 016] Added total_tokens_used to agents');
      }

      // 3. Create indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_research_cycles_product ON research_cycles(product_id, started_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ideas_product ON ideas(product_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ideas_product_pending ON ideas(product_id, status) WHERE status = 'pending'`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_swipe_history_product ON swipe_history(product_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_swipe_history_category ON swipe_history(product_id, category)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_maybe_pool_next ON maybe_pool(product_id, next_evaluate_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_events_product ON cost_events(product_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_events_workspace ON cost_events(workspace_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_events_task ON cost_events(task_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_caps_workspace ON cost_caps(workspace_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_product_schedules_product ON product_schedules(product_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_operations_log_product ON operations_log(product_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_content_inventory_product ON content_inventory(product_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_social_queue_product ON social_queue(product_id, status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_seo_keywords_product ON seo_keywords(product_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_product_feedback_product ON product_feedback(product_id, processed)`);

      console.log('[Migration 016] Product Autopilot tables and indexes created');
    }
  },
  {
    id: '017',
    name: 'add_task_notes',
    up: (db) => {
      console.log('[Migration 017] Adding task_notes table...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS task_notes (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('note', 'direct')),
          status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read')),
          delivered_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_notes_task ON task_notes(task_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_notes_pending ON task_notes(task_id, status) WHERE status = 'pending'`);

      console.log('[Migration 017] task_notes table created');
    }
  },
  {
    id: '018',
    name: 'autopilot_resilience_activity',
    up: (db) => {
      console.log('[Migration 018] Adding autopilot resilience and activity log...');

      // Add phase tracking columns to research_cycles
      const rcInfo = db.prepare("PRAGMA table_info(research_cycles)").all() as { name: string }[];
      if (!rcInfo.some(col => col.name === 'current_phase')) {
        db.exec(`ALTER TABLE research_cycles ADD COLUMN current_phase TEXT DEFAULT 'init'`);
      }
      if (!rcInfo.some(col => col.name === 'phase_data')) {
        db.exec(`ALTER TABLE research_cycles ADD COLUMN phase_data TEXT`);
      }
      if (!rcInfo.some(col => col.name === 'session_key')) {
        db.exec(`ALTER TABLE research_cycles ADD COLUMN session_key TEXT`);
      }
      if (!rcInfo.some(col => col.name === 'last_heartbeat')) {
        db.exec(`ALTER TABLE research_cycles ADD COLUMN last_heartbeat TEXT`);
      }
      if (!rcInfo.some(col => col.name === 'retry_count')) {
        db.exec(`ALTER TABLE research_cycles ADD COLUMN retry_count INTEGER DEFAULT 0`);
      }

      // Create ideation_cycles table
      db.exec(`
        CREATE TABLE IF NOT EXISTS ideation_cycles (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id),
          research_cycle_id TEXT REFERENCES research_cycles(id),
          status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'interrupted')),
          current_phase TEXT DEFAULT 'init',
          phase_data TEXT,
          session_key TEXT,
          last_heartbeat TEXT,
          retry_count INTEGER DEFAULT 0,
          ideas_generated INTEGER DEFAULT 0,
          error_message TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ideation_cycles_product ON ideation_cycles(product_id, started_at DESC)`);

      // Create autopilot_activity_log table
      db.exec(`
        CREATE TABLE IF NOT EXISTS autopilot_activity_log (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id),
          cycle_id TEXT NOT NULL,
          cycle_type TEXT NOT NULL CHECK(cycle_type IN ('research', 'ideation')),
          event_type TEXT NOT NULL,
          message TEXT NOT NULL,
          detail TEXT,
          cost_usd REAL,
          tokens_used INTEGER,
          created_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_autopilot_activity_product ON autopilot_activity_log(product_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_autopilot_activity_cycle ON autopilot_activity_log(cycle_id, created_at)`);

      console.log('[Migration 018] Autopilot resilience tables and columns created');
    }
  },
  {
    id: '019',
    name: 'add_build_pipeline_columns',
    up: (db) => {
      console.log('[Migration 019] Adding build pipeline columns to products and tasks...');

      // Add columns to products
      const productsInfo = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
      if (!productsInfo.some(col => col.name === 'build_mode')) {
        db.exec(`ALTER TABLE products ADD COLUMN build_mode TEXT DEFAULT 'plan_first' CHECK (build_mode IN ('auto_build', 'plan_first'))`);
        console.log('[Migration 019] Added build_mode to products');
      }
      if (!productsInfo.some(col => col.name === 'default_branch')) {
        db.exec(`ALTER TABLE products ADD COLUMN default_branch TEXT DEFAULT 'main'`);
        console.log('[Migration 019] Added default_branch to products');
      }
      if (!productsInfo.some(col => col.name === 'cost_cap_per_task')) {
        db.exec(`ALTER TABLE products ADD COLUMN cost_cap_per_task REAL`);
        console.log('[Migration 019] Added cost_cap_per_task to products');
      }
      if (!productsInfo.some(col => col.name === 'cost_cap_monthly')) {
        db.exec(`ALTER TABLE products ADD COLUMN cost_cap_monthly REAL`);
        console.log('[Migration 019] Added cost_cap_monthly to products');
      }

      // Add columns to tasks
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'repo_url')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN repo_url TEXT`);
        console.log('[Migration 019] Added repo_url to tasks');
      }
      if (!tasksInfo.some(col => col.name === 'repo_branch')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN repo_branch TEXT`);
        console.log('[Migration 019] Added repo_branch to tasks');
      }
      if (!tasksInfo.some(col => col.name === 'pr_url')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN pr_url TEXT`);
        console.log('[Migration 019] Added pr_url to tasks');
      }
      if (!tasksInfo.some(col => col.name === 'pr_status')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN pr_status TEXT CHECK (pr_status IN ('pending', 'open', 'merged', 'closed'))`);
        console.log('[Migration 019] Added pr_status to tasks');
      }

      console.log('[Migration 019] Build pipeline columns added');
    }
  },
  {
    id: '020',
    name: 'add_chat_role_column',
    up: (db) => {
      console.log('[Migration 020] Adding role column to task_notes for agent responses...');

      const notesInfo = db.prepare("PRAGMA table_info(task_notes)").all() as { name: string }[];
      if (!notesInfo.some(col => col.name === 'role')) {
        db.exec(`ALTER TABLE task_notes ADD COLUMN role TEXT DEFAULT 'user'`);
        console.log('[Migration 020] Added role column to task_notes');
      }
    }
  },
  {
    id: '021',
    name: 'add_parallel_build_isolation',
    up: (db) => {
      console.log('[Migration 021] Adding parallel build isolation columns and tables...');

      // Add workspace columns to tasks
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'workspace_path')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN workspace_path TEXT`);
      }
      if (!tasksInfo.some(col => col.name === 'workspace_strategy')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN workspace_strategy TEXT`);
      }
      if (!tasksInfo.some(col => col.name === 'workspace_port')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN workspace_port INTEGER`);
      }
      if (!tasksInfo.some(col => col.name === 'workspace_base_commit')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN workspace_base_commit TEXT`);
      }
      if (!tasksInfo.some(col => col.name === 'merge_status')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN merge_status TEXT`);
      }
      if (!tasksInfo.some(col => col.name === 'merge_pr_url')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN merge_pr_url TEXT`);
      }

      // Create workspace_ports table
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_ports (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id),
          port INTEGER NOT NULL UNIQUE,
          product_id TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          released_at TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_ports_active ON workspace_ports(status, port)`);

      // Create workspace_merges table
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_merges (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id),
          workspace_path TEXT NOT NULL,
          strategy TEXT NOT NULL,
          base_commit TEXT,
          merge_commit TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          conflict_files TEXT,
          merge_log TEXT,
          merged_by TEXT,
          created_at TEXT NOT NULL,
          merged_at TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_merges_task ON workspace_merges(task_id)`);

      console.log('[Migration 021] Parallel build isolation tables and columns created');
    }
  },
  {
    id: '022',
    name: 'add_product_health_scores',
    up: (db) => {
      console.log('[Migration 022] Adding product health scores table and weight config...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS product_health_scores (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          overall_score REAL NOT NULL DEFAULT 0,
          research_freshness_score REAL DEFAULT 0,
          pipeline_depth_score REAL DEFAULT 0,
          swipe_velocity_score REAL DEFAULT 0,
          build_success_score REAL DEFAULT 0,
          cost_efficiency_score REAL DEFAULT 0,
          component_data TEXT,
          snapshot_date TEXT,
          calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_health_scores_product ON product_health_scores(product_id, calculated_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_health_scores_snapshot ON product_health_scores(product_id, snapshot_date)`);

      const productsInfo = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
      if (!productsInfo.some(col => col.name === 'health_weight_config')) {
        db.exec(`ALTER TABLE products ADD COLUMN health_weight_config TEXT`);
        console.log('[Migration 022] Added health_weight_config to products');
      }

      console.log('[Migration 022] Product health scores table and indexes created');
    }
  },
  {
    id: '023',
    name: 'add_idea_similarity_detection',
    up: (db) => {
      console.log('[Migration 023] Adding idea similarity detection tables and columns...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS idea_embeddings (
          id TEXT PRIMARY KEY,
          idea_id TEXT NOT NULL UNIQUE REFERENCES ideas(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          embedding TEXT NOT NULL,
          text_hash TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_idea_embeddings_product ON idea_embeddings(product_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_idea_embeddings_idea ON idea_embeddings(idea_id)`);

      const ideasInfo = db.prepare("PRAGMA table_info(ideas)").all() as { name: string }[];
      if (!ideasInfo.some(col => col.name === 'similarity_flag')) {
        db.exec(`ALTER TABLE ideas ADD COLUMN similarity_flag TEXT`);
      }
      if (!ideasInfo.some(col => col.name === 'auto_suppressed')) {
        db.exec(`ALTER TABLE ideas ADD COLUMN auto_suppressed INTEGER DEFAULT 0`);
      }
      if (!ideasInfo.some(col => col.name === 'suppress_reason')) {
        db.exec(`ALTER TABLE ideas ADD COLUMN suppress_reason TEXT`);
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS idea_suppressions (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          suppressed_title TEXT NOT NULL,
          suppressed_description TEXT NOT NULL,
          similar_to_idea_id TEXT NOT NULL REFERENCES ideas(id),
          similarity_score REAL NOT NULL,
          reason TEXT NOT NULL,
          ideation_cycle_id TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_idea_suppressions_product ON idea_suppressions(product_id, created_at DESC)`);

      console.log('[Migration 023] Idea similarity detection tables and columns created');
    }
  },
  {
    id: '024',
    name: 'add_user_task_reads',
    up: (db) => {
      console.log('[Migration 024] Adding user_task_reads table for unread tracking...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS user_task_reads (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'operator',
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          last_read_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(user_id, task_id)
        )
      `);

      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_task_reads_user_task ON user_task_reads(user_id, task_id)`);

      console.log('[Migration 024] user_task_reads table created');
    }
  },
  {
    id: '025',
    name: 'add_batch_review_threshold',
    up: (db) => {
      console.log('[Migration 025] Adding batch_review_threshold column to products...');

      const productsInfo = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
      if (!productsInfo.some(col => col.name === 'batch_review_threshold')) {
        db.exec(`ALTER TABLE products ADD COLUMN batch_review_threshold INTEGER DEFAULT 10`);
        console.log('[Migration 025] Added batch_review_threshold to products');
      }
    }
  },
  {
    id: '026',
    name: 'add_rollback_history',
    up: (db) => {
      console.log('[Migration 026] Adding rollback history table...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS rollback_history (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          task_id TEXT REFERENCES tasks(id),
          trigger_type TEXT NOT NULL CHECK (trigger_type IN ('health_check', 'ci_failure', 'manual')),
          trigger_details TEXT NOT NULL,
          merged_pr_url TEXT NOT NULL,
          merged_commit_sha TEXT NOT NULL,
          revert_pr_url TEXT,
          revert_pr_status TEXT NOT NULL DEFAULT 'pending' CHECK (revert_pr_status IN ('pending', 'created', 'merged', 'failed')),
          previous_automation_tier TEXT,
          acknowledged INTEGER NOT NULL DEFAULT 0,
          acknowledged_at TEXT,
          acknowledged_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      db.exec('CREATE INDEX IF NOT EXISTS idx_rollback_history_product ON rollback_history(product_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_rollback_history_unack ON rollback_history(acknowledged, product_id)');

      console.log('[Migration 026] Rollback history table created');
    }
  },
  {
    id: '027',
    name: 'add_product_program_ab_testing',
    up: (db) => {
      console.log('[Migration 027] Adding Product Program A/B testing tables and columns...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS product_program_variants (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          is_control INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ppv_product ON product_program_variants(product_id)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS product_ab_tests (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          variant_a_id TEXT NOT NULL REFERENCES product_program_variants(id),
          variant_b_id TEXT NOT NULL REFERENCES product_program_variants(id),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'concluded', 'cancelled')),
          split_mode TEXT NOT NULL DEFAULT 'concurrent' CHECK (split_mode IN ('concurrent', 'alternating')),
          min_swipes INTEGER NOT NULL DEFAULT 50,
          last_variant_used TEXT,
          winner_variant_id TEXT REFERENCES product_program_variants(id),
          created_at TEXT DEFAULT (datetime('now')),
          concluded_at TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ab_tests_product ON product_ab_tests(product_id, status)`);

      const ideasInfo = db.prepare("PRAGMA table_info(ideas)").all() as { name: string }[];
      if (!ideasInfo.some(col => col.name === 'variant_id')) {
        db.exec(`ALTER TABLE ideas ADD COLUMN variant_id TEXT REFERENCES product_program_variants(id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_ideas_variant ON ideas(variant_id)`);
        console.log('[Migration 027] Added variant_id to ideas');
      }

      console.log('[Migration 027] Product Program A/B testing tables created');
    }
  },
  {
    id: '028',
    name: 'add_product_skills',
    up: (db) => {
      console.log('[Migration 028] Adding product_skills table...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS product_skills (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          skill_type TEXT NOT NULL CHECK (skill_type IN ('build', 'deploy', 'test', 'fix', 'config', 'pattern')),
          title TEXT NOT NULL,
          trigger_keywords TEXT,
          prerequisites TEXT,
          steps TEXT NOT NULL,
          verification TEXT,
          confidence REAL DEFAULT 0.5,
          times_used INTEGER DEFAULT 0,
          times_succeeded INTEGER DEFAULT 0,
          last_used_at TEXT,
          created_by_task_id TEXT REFERENCES tasks(id),
          created_by_agent_id TEXT REFERENCES agents(id),
          supersedes_skill_id TEXT REFERENCES product_skills(id),
          status TEXT DEFAULT 'draft' CHECK (status IN ('active', 'deprecated', 'draft')),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_product_skills_product ON product_skills(product_id, skill_type, status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_product_skills_confidence ON product_skills(confidence DESC)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS skill_reports (
          id TEXT PRIMARY KEY,
          skill_id TEXT NOT NULL REFERENCES product_skills(id) ON DELETE CASCADE,
          task_id TEXT NOT NULL REFERENCES tasks(id),
          used INTEGER NOT NULL DEFAULT 1,
          succeeded INTEGER NOT NULL DEFAULT 0,
          deviation TEXT,
          suggested_update TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_skill_reports_skill ON skill_reports(skill_id)`);

      console.log('[Migration 028] product_skills and skill_reports tables created');
    }
  },
  {
    id: '031',
    name: 'add_browser_qa_columns',
    up: (db) => {
      console.log('[Migration 031] Adding browser QA columns...');

      // Per-product toggle for browser testing
      db.exec(`ALTER TABLE products ADD COLUMN browser_test_enabled INTEGER DEFAULT 1`);

      // Dev server URL used during testing (set at dispatch time)
      db.exec(`ALTER TABLE tasks ADD COLUMN browser_test_url TEXT`);

      console.log('[Migration 031] browser_test_enabled (products) and browser_test_url (tasks) added');
    }
  }
];

/**
 * Creates a timestamped backup of the database file before running migrations.
 *
 * Uses SQLite's VACUUM INTO command, which produces a consistent, compacted copy
 * that is safe to create while the database is open in WAL mode. A plain
 * fs.copyFile() is NOT safe in WAL mode — the .db and .wal files are updated
 * separately and may not represent a coherent snapshot when copied together.
 *
 * The backup is written to a `db-backups/` subdirectory next to the source
 * database, named: <original-filename>.backup.<ISO-8601-timestamp>
 * e.g.: db-backups/mission-control.db.backup.2026-03-14T16-32-00
 *
 * Keeps the last MAX_BACKUPS backups and removes older ones automatically.
 * Backup failure is fatal: if the backup cannot be created, this function
 * throws and the caller must abort the migration run.
 */
const MAX_BACKUPS = 5;

function createPreMigrationBackup(db: Database.Database): void {
  const dbPath = db.name;

  // Skip backup for in-memory or temp-file databases (used in tests)
  if (!dbPath || dbPath === ':memory:' || dbPath === '') {
    console.log('[DB] Skipping pre-migration backup for non-file database');
    return;
  }

  const dbDir = path.dirname(dbPath);
  const backupDir = path.join(dbDir, 'db-backups');
  fs.mkdirSync(backupDir, { recursive: true });

  // Build a timestamp string that is valid in filenames on all platforms.
  // ISO 8601 with colons replaced — colons are illegal in Windows filenames.
  // Milliseconds are stripped for a cleaner, more readable filename.
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')   // colons → hyphens (Windows compatibility)
    .replace(/\..+$/, ''); // strip fractional seconds: "2026-03-14T16-32-00"

  // Full original filename (e.g. "mission-control.db") becomes the prefix so
  // the backup is clearly associated with its source database.
  const dbBasename = path.basename(dbPath);                  // "mission-control.db"
  const backupFilename = `${dbBasename}.backup.${timestamp}`; // "mission-control.db.backup.2026-03-14T16-32-00"
  const backupPath = path.join(backupDir, backupFilename);

  // VACUUM INTO creates a consistent, compacted snapshot of the open database.
  // It flushes all WAL frames and writes a clean .db file — no need to also
  // copy the -shm or -wal sidecar files.
  // Single-quote escaping prevents SQL injection via filesystem paths.
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

  console.log(`[DB] Pre-migration backup created: ${backupFilename}`);

  // Prune old backups — keep only the most recent MAX_BACKUPS to limit disk usage.
  // ISO timestamps sort lexicographically, so a simple .sort() gives correct order.
  const backupFiles = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(`${dbBasename}.backup.`))
    .sort();

  if (backupFiles.length > MAX_BACKUPS) {
    // Wrap cleanup in its own try/catch so a failure here (e.g. file locked on
    // Windows, permissions issue) is reported clearly as a cleanup problem —
    // not as "backup failed". The backup itself already succeeded at this point.
    try {
      const toDelete = backupFiles.slice(0, backupFiles.length - MAX_BACKUPS);
      for (const filename of toDelete) {
        fs.unlinkSync(path.join(backupDir, filename));
        console.log(`[DB] Removed old backup: ${filename}`);
      }
    } catch (cleanupError) {
      console.warn('[DB] Warning: could not remove old backup file(s) — cleanup failed, but the backup itself is intact:', cleanupError);
    }
  }
}

/**
 * Run all pending migrations.
 *
 * Before applying any pending migration, a timestamped backup of the database
 * file is created in a `db-backups/` subdirectory. If backup creation fails,
 * the migration run is aborted entirely — protecting data takes priority over
 * applying schema changes. Migration failure IS fatal and throws, preventing
 * the application from starting in a partially-migrated state.
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

  // Identify which migrations still need to run
  const pending = migrations.filter(m => !applied.has(m.id));

  // Create a timestamped backup BEFORE touching the database.
  // Backup failure is FATAL — if we cannot create a recovery point, we do not
  // apply migrations. Data safety takes priority over schema updates. Operators
  // must resolve the underlying cause (e.g. disk space, permissions) first.
  // The error is allowed to propagate and will abort the migration run.
  if (pending.length > 0) {
    createPreMigrationBackup(db);
  }

  // Run pending migrations in order
  for (const migration of pending) {
    console.log(`[DB] Running migration ${migration.id}: ${migration.name}`);

    try {
      // Disable FK checks during migrations (required for table recreation).
      // PRAGMA foreign_keys must be set outside a transaction in SQLite.
      db.pragma('foreign_keys = OFF');
      // Prevent ALTER TABLE RENAME from rewriting FK references in other tables.
      db.pragma('legacy_alter_table = ON');

      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
      })();

      // Re-enable FK checks and legacy alter table
      db.pragma('legacy_alter_table = OFF');
      db.pragma('foreign_keys = ON');

      console.log(`[DB] Migration ${migration.id} completed`);
    } catch (error) {
      // Re-enable FK checks even on failure
      db.pragma('foreign_keys = ON');
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
