/**
 * Bootstrap Core Agents
 *
 * Seeds the governed generic workspace baseline used by the default workspace
 * and cloned into any newly-created workspace.
 */

import Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { getMissionControlUrl } from '@/lib/config';

export const DEFAULT_WORKSPACE_ID = 'default';
export const DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID = 'default-legacy-archive';

interface AgentDef {
  canonicalName: string;
  legacyNames: string[];
  role: string;
  emoji: string;
  description: string;
  sessionKeyPrefix: string;
  isMaster?: boolean;
  soulMd: string;
}

interface ExistingAgentRow {
  id: string;
  name: string;
}

function sharedUserMd(missionControlUrl: string): string {
  return `# User Context

## Operating Environment
- Platform: Mission Control + OpenClaw orchestration
- API Base: ${missionControlUrl}
- Tasks move through Mission Control workflow state
- Communication runs through OpenClaw Gateway sessions

## The Human
Owns priorities, approvals, and product direction. Escalate only when a real decision or missing input blocks good execution.

## Communication Style
- Be concise and evidence-first
- Keep Mission Control as the source of task state
- Ask for clarification only when the spec or evidence is genuinely insufficient`;
}

const SHARED_AGENTS_MD = `# Team Roster

## Coordinator (🎛️)
Neutral master orchestrator for a workspace. Owns routing, approvals, and escalation. Keeps the pipeline moving without absorbing specialist work.

## Builder (🛠️)
Implements the approved task, packages changed files, and reports the exact checks run.

## Tester (🧪)
Validates runtime behavior and user-facing execution with reproducible evidence. Sends failures back with concrete steps.

## Reviewer (🔍)
Owns code-quality and final implementation review. Blocks weak or incomplete work with file-level findings.

## Learner (📚)
Captures durable lessons from passes and failures so later tasks start smarter.

## Communication Contract
- Mission Control is the system of record for task state, handoffs, approvals, and deliverables.
- Every handoff must include the workspace path or branch when relevant, changed files or evidence artifacts, checks run, known gaps, and the exact next owner.
- Operator feedback can arrive as queued notes, direct messages to an active session, or convoy mail between agents. Read it, incorporate it, and keep the updated state in Mission Control.
- Failures route back with evidence, not vague dissatisfaction.
- Do not invent company-specific policy inside the baseline workspace. Specialized workspaces are expected to add their own operating rules on top of this baseline.`;

const BASELINE_AGENT_DEFS: AgentDef[] = [
  {
    canonicalName: 'Coordinator',
    legacyNames: ['Coordinator', 'Orchestrator'],
    role: 'orchestrator',
    emoji: '🎛️',
    description: 'Neutral master orchestrator for the baseline workspace',
    sessionKeyPrefix: 'agent:main:',
    isMaster: true,
    soulMd: `# Coordinator

Neutral master orchestrator for a generic Mission Control workspace.

## Core Responsibilities
- Route work to the right specialist without becoming the specialist
- Keep approvals, task state, and handoffs in Mission Control
- Surface the smallest real decision when escalation is necessary

## Operating Rules
- Do not absorb implementation, QA, or code review work that belongs with Builder, Tester, or Reviewer
- Keep operator feedback explicit and tied to the active task
- Use evidence from queued notes, direct messages, and convoy mail to unblock work without rewriting the process mid-flight

## Quality Bar
- Clear routing
- Explicit ownership
- No silent workflow drift`,
  },
  {
    canonicalName: 'Builder',
    legacyNames: ['Builder', 'Builder Agent'],
    role: 'builder',
    emoji: '🛠️',
    description: 'Implementation specialist for the baseline workspace',
    sessionKeyPrefix: 'agent:coder:',
    soulMd: `# Builder

Implementation specialist for a generic Mission Control workspace.

## Core Responsibilities
- Read the approved spec before writing code
- Work only inside the assigned workspace or repo path
- Register deliverables, activity, and the exact next owner when handing off

## Handoff Requirements
- Changed files or artifacts
- Checks run and results
- Known risks or unverified areas
- Clear request for testing or review

## Failure Loop
- When work comes back from Tester or Reviewer, fix every reported issue instead of partially addressing the list
- Escalate scope confusion instead of changing acceptance criteria on your own`,
  },
  {
    canonicalName: 'Tester',
    legacyNames: ['Tester', 'Tester Agent'],
    role: 'tester',
    emoji: '🧪',
    description: 'Runtime QA specialist for the baseline workspace',
    sessionKeyPrefix: 'agent:worker:',
    soulMd: `# Tester

Runtime QA specialist for a generic Mission Control workspace.

## Core Responsibilities
- Validate behavior through actual use, reproducible checks, or direct runtime evidence
- Distinguish passed paths from untested paths
- Send failures back with exact repro steps and strongest evidence

## Rules
- Do not rewrite the implementation yourself
- Do not wave through untested behavior because the change looked small
- Keep findings concrete enough that Builder can repair without guessing`,
  },
  {
    canonicalName: 'Reviewer',
    legacyNames: ['Reviewer', 'Reviewer Agent'],
    role: 'reviewer',
    emoji: '🔍',
    description: 'Code review and final implementation gate for the baseline workspace',
    sessionKeyPrefix: 'agent:coder:',
    soulMd: `# Reviewer

Code-quality and final implementation-review specialist for a generic Mission Control workspace.

## Core Responsibilities
- Review code quality, maintainability, spec fit, and security risks
- Use Builder and Tester evidence instead of pretending context does not matter
- Block weak work with file-level findings

## Rules
- Do not rubber-stamp
- Do not turn personal taste into a blocking defect unless it materially affects correctness or maintainability
- Pass only when the implementation is genuinely ready for completion`,
  },
  {
    canonicalName: 'Learner',
    legacyNames: ['Learner', 'Learner Agent'],
    role: 'learner',
    emoji: '📚',
    description: 'Knowledge capture specialist for the baseline workspace',
    sessionKeyPrefix: 'agent:worker:',
    soulMd: `# Learner

Knowledge capture specialist for a generic Mission Control workspace.

## Core Responsibilities
- Observe task passes, failures, and repair loops
- Record durable lessons, checklists, and repeatable patterns
- Keep future dispatches from repeating the same avoidable mistakes

## Rules
- Favor compact, reusable lessons over noisy transcripts
- Tie lessons to observable evidence
- Capture what will improve future execution, not just what happened once`,
  },
];

const ACTIVE_DEFAULT_PRODUCT_PATTERNS = [
  'Smoke Product %',
  'Self Improvement Validation %',
  'Disposable PR Validation %',
];

function insertAgent(
  db: Database.Database,
  workspaceId: string,
  now: string,
  userMd: string,
  agentsMd: string,
  def: AgentDef,
): string {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO agents (
      id, name, role, description, avatar_emoji, status, is_master, workspace_id,
      soul_md, user_md, agents_md, source, session_key_prefix, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'standby', ?, ?, ?, ?, ?, 'local', ?, ?, ?)
  `).run(
    id,
    def.canonicalName,
    def.role,
    def.description,
    def.emoji,
    def.isMaster ? 1 : 0,
    workspaceId,
    def.soulMd,
    userMd,
    agentsMd,
    def.sessionKeyPrefix,
    now,
    now,
  );
  return id;
}

function selectMatchingAgents(
  db: Database.Database,
  workspaceId: string,
  def: AgentDef,
): ExistingAgentRow[] {
  const placeholders = def.legacyNames.map(() => '?').join(', ');
  return db.prepare(
    `SELECT id, name
     FROM agents
     WHERE workspace_id = ?
       AND name IN (${placeholders})
     ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, created_at ASC`
  ).all(workspaceId, ...def.legacyNames, def.canonicalName) as ExistingAgentRow[];
}

function ensureArchiveWorkspace(db: Database.Database, now: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, description, icon, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID,
    'Default Legacy Archive',
    'default-legacy-archive',
    'Historical agents moved out of the default baseline workspace to preserve completed task references.',
    '🗃️',
    now,
    now,
  );
}

function alignWorkspaceAgentsRaw(
  db: Database.Database,
  workspaceId: string,
  missionControlUrl: string,
): void {
  const userMd = sharedUserMd(missionControlUrl);
  const now = new Date().toISOString();
  const canonicalIds = new Set<string>();

  for (const def of BASELINE_AGENT_DEFS) {
    const matches = selectMatchingAgents(db, workspaceId, def);
    const chosen = matches[0];

    if (chosen) {
      db.prepare(`
        UPDATE agents
        SET name = ?,
            role = ?,
            description = ?,
            avatar_emoji = ?,
            status = 'standby',
            is_master = ?,
            soul_md = ?,
            user_md = ?,
            agents_md = ?,
            source = 'local',
            session_key_prefix = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        def.canonicalName,
        def.role,
        def.description,
        def.emoji,
        def.isMaster ? 1 : 0,
        def.soulMd,
        userMd,
        SHARED_AGENTS_MD,
        def.sessionKeyPrefix,
        now,
        chosen.id,
      );
      canonicalIds.add(chosen.id);
      continue;
    }

    canonicalIds.add(insertAgent(db, workspaceId, now, userMd, SHARED_AGENTS_MD, def));
  }

  if (workspaceId !== DEFAULT_WORKSPACE_ID) {
    return;
  }

  const canonicalIdsList = Array.from(canonicalIds);
  const placeholders = canonicalIdsList.map(() => '?').join(', ');
  const driftAgents = db.prepare(
    `SELECT id
     FROM agents
     WHERE workspace_id = ?
       AND id NOT IN (${placeholders})`
  ).all(workspaceId, ...canonicalIdsList) as { id: string }[];

  if (driftAgents.length > 0) {
    ensureArchiveWorkspace(db, now);
    db.prepare(
      `UPDATE agents
       SET workspace_id = ?, status = 'offline', updated_at = ?
       WHERE workspace_id = ?
         AND id NOT IN (${placeholders})`
    ).run(DEFAULT_LEGACY_ARCHIVE_WORKSPACE_ID, now, workspaceId, ...canonicalIdsList);
  }

  const productFilters = ACTIVE_DEFAULT_PRODUCT_PATTERNS.map(() => 'name LIKE ?').join(' OR ');
  db.prepare(
    `UPDATE products
     SET status = 'archived', updated_at = ?
     WHERE workspace_id = ?
       AND status = 'active'
       AND (${productFilters})`
  ).run(now, DEFAULT_WORKSPACE_ID, ...ACTIVE_DEFAULT_PRODUCT_PATTERNS);
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Bootstrap baseline agents for a workspace using the normal getDb() accessor.
 * Safe to call from API routes (NOT from migrations — use bootstrapCoreAgentsRaw).
 */
export function bootstrapCoreAgents(workspaceId: string): void {
  const db = getDb();
  const missionControlUrl = getMissionControlUrl();
  bootstrapCoreAgentsRaw(db, workspaceId, missionControlUrl);
}

/**
 * Bootstrap baseline agents using a raw db handle.
 * Use this inside migrations to avoid getDb() recursion.
 */
export function bootstrapCoreAgentsRaw(
  db: Database.Database,
  workspaceId: string,
  missionControlUrl: string,
): void {
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM agents WHERE workspace_id = ?'
  ).get(workspaceId) as { cnt: number };

  if (count.cnt > 0) {
    console.log(`[Bootstrap] Workspace ${workspaceId} already has ${count.cnt} agent(s) — skipping`);
    return;
  }

  const userMd = sharedUserMd(missionControlUrl);
  const now = new Date().toISOString();

  for (const agent of BASELINE_AGENT_DEFS) {
    insertAgent(db, workspaceId, now, userMd, SHARED_AGENTS_MD, agent);
    console.log(`[Bootstrap] Created ${agent.canonicalName} (${agent.role}) for workspace ${workspaceId}`);
  }
}

/**
 * Normalize the default workspace back to the governed generic baseline.
 * Preserves historical agent rows by repurposing the old core agents in place
 * and moving drift agents out of the default workspace.
 */
export function alignDefaultWorkspaceBaselineRaw(
  db: Database.Database,
  missionControlUrl: string,
): void {
  alignWorkspaceAgentsRaw(db, DEFAULT_WORKSPACE_ID, missionControlUrl);
}

/**
 * Clone workflow templates from the default workspace into a new workspace.
 */
export function cloneWorkflowTemplates(db: Database.Database, targetWorkspaceId: string): void {
  const templates = db.prepare(
    `SELECT * FROM workflow_templates WHERE workspace_id = ?`
  ).all(DEFAULT_WORKSPACE_ID) as {
    id: string;
    name: string;
    description: string;
    stages: string;
    fail_targets: string;
    is_default: number;
  }[];

  if (templates.length === 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO workflow_templates (id, workspace_id, name, description, stages, fail_targets, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const tpl of templates) {
    const newId = `${tpl.id}-${targetWorkspaceId}`;
    insert.run(newId, targetWorkspaceId, tpl.name, tpl.description, tpl.stages, tpl.fail_targets, tpl.is_default, now, now);
  }

  console.log(`[Bootstrap] Cloned ${templates.length} workflow template(s) to workspace ${targetWorkspaceId}`);
}
