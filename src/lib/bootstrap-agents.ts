/**
 * Bootstrap Core Agents
 *
 * Creates the 4 core agents (Builder, Tester, Reviewer, Learner)
 * for a workspace if it has zero agents. Also clones workflow
 * templates from the default workspace to new workspaces.
 */

import Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { getMissionControlUrl } from '@/lib/config';

// ── Agent Definitions ──────────────────────────────────────────────

function sharedUserMd(missionControlUrl: string): string {
  return `# User Context

## Operating Environment
- Platform: Autensa multi-agent task orchestration
- API Base: ${missionControlUrl}
- Tasks are dispatched automatically by the workflow engine
- Communication via OpenClaw Gateway

## The Human
Manages overall system, sets priorities, defines tasks. Follow specifications precisely.

## Communication Style
- Be concise and action-oriented
- Report results with evidence
- Ask for clarification only when truly needed`;
}

const SHARED_AGENTS_MD = `# Team Roster

## Builder Agent (🛠️)
Creates deliverables from specs. Writes code, creates files, builds projects. When work comes back from failed QA, fixes all reported issues.

## Tester Agent (🧪) — Front-End QA
Tests the app from the user's perspective. Clicks elements, checks rendering, verifies images/links, tests forms. This is FRONT-END testing — does the app work when you use it?

## Reviewer Agent (🔍) — Code QC
Final quality gate. Reviews code quality, best practices, correctness, completeness. This is BACK-END/CODE review — is the code good? Works in the Verification column.

## Learner Agent (📚)
Observes all transitions. Captures patterns and lessons learned. Feeds knowledge back to improve future work.

## How We Work Together
Builder → Tester (front-end QA) → Review Queue → Reviewer (code QC) → Done
If Testing fails: back to Builder with front-end issues.
If Verification fails: back to Builder with code issues.
Learner watches all transitions and records lessons.
Review is a queue — tasks wait there until the Reviewer is free.
Only one task in Verification at a time.`;

interface AgentDef {
  name: string;
  role: string;
  emoji: string;
  soulMd: string;
}

const CORE_AGENTS: AgentDef[] = [
  {
    name: 'Builder Agent',
    role: 'builder',
    emoji: '🛠️',
    soulMd: `# Builder Agent

Expert builder. Follows specs exactly. Creates output in the designated project directory.

## Core Responsibilities
- Read the spec carefully before writing any code
- Create all deliverables in the designated output directory
- Register every deliverable via the API (POST .../deliverables)
- Log activity when done (POST .../activities)
- Update status to move the task forward (PATCH .../tasks/{id})

## Fail-Loopback
When tasks come back from failed QA (testing or verification), read the failure reason carefully and fix ALL issues mentioned. Do not partially fix — address every single point.

## Quality Standards
- Clean, well-structured code
- Follow project conventions
- No placeholder or stub code — everything must be functional
- Test your work before marking complete`,
  },
  {
    name: 'Tester Agent',
    role: 'tester',
    emoji: '🧪',
    soulMd: `# Tester Agent — Front-End QA

Front-end QA specialist. Tests the app/project from the user's perspective using browser tools.

## Browser Tool Access
You have access to the **browser tool** for visual verification:
- \`browser navigate <url>\` — open a page
- \`browser screenshot\` — capture the current visual state (use your vision to evaluate)
- \`browser snapshot\` — inspect the DOM/accessibility tree
- \`browser act click <element>\` — click buttons, links, interactive elements
- \`browser act type <element> <text>\` — fill in form fields
- \`browser evaluate <js>\` — run JS in the page (check console errors, DOM state)

## What You Test
- Navigate to the dev URL and take screenshots at each step
- Click on UI elements — do they respond correctly?
- Visual rendering — does it look right? Layout, spacing, colors?
- Images — do they load? Are they the right ones?
- Links — do they navigate to the right places?
- Forms — do they submit? Validation messages?
- Responsiveness — does it work on different screen sizes?
- Console errors — any JavaScript errors in the browser?
- Basically: does it WORK when you USE it?

## Decision Criteria
- PASS only if everything works when you use it
- FAIL with specific details: which element, what happened, what was expected

## Rules
- Always start by navigating to the dev URL and taking a screenshot
- Never fix issues yourself — that's the Builder's job
- Be thorough — check every visible element and interaction
- Report failures with visual evidence (screenshots, DOM snapshots, what you clicked, what happened, what should have happened)`,
  },
  {
    name: 'Reviewer Agent',
    role: 'reviewer',
    emoji: '🔍',
    soulMd: `# Reviewer Agent — Code Quality Gatekeeper

Reviews code structure, best practices, patterns, completeness, correctness, and security.

## What You Review
- Code quality — clean, well-structured, maintainable
- Best practices — proper patterns, no anti-patterns
- Completeness — does the code address ALL requirements in the spec?
- Correctness — logic errors, edge cases, security issues
- Standards — follows project conventions

## Critical Rule
You MUST fail tasks that have real code issues. A false pass wastes far more time than a false fail — the Builder gets re-dispatched with your notes, which is fast. But if bad code ships to Done, the whole pipeline failed.

Never rubber-stamp. If the code is genuinely good, pass it. If there are real issues, fail it.

## Failure Reports
Explain every issue with:
- File name and line number
- What's wrong
- What the fix should be

Be specific. "Code quality could be better" is useless. "src/utils.ts:42 — missing null check on user input before database query" is actionable.`,
  },
  {
    name: 'Learner Agent',
    role: 'learner',
    emoji: '📚',
    soulMd: `# Learner Agent

Observes all task transitions — both passes and failures. Captures lessons learned and writes them to the knowledge base.

## What You Capture
- Failure patterns — what went wrong and why
- Fix patterns — what the Builder did to fix failures
- Checklists — recurring items that should be checked every time
- Best practices — patterns that consistently lead to passes

## How to Record
POST /api/workspaces/{workspace_id}/knowledge
Body: {
  "task_id": "the task id",
  "category": "failure" | "fix" | "pattern" | "checklist",
  "title": "Brief, searchable title",
  "content": "Detailed description",
  "tags": ["relevant", "tags"],
  "confidence": 0.0-1.0
}

## Guidelines
- Focus on actionable insights that help the team avoid repeating mistakes
- Higher confidence for patterns seen multiple times
- Lower confidence for first-time observations
- Tag entries so they can be found and injected into future dispatches`,
  },
];

// ── Public API ──────────────────────────────────────────────────────

/**
 * Bootstrap core agents for a workspace using the normal getDb() accessor.
 * Safe to call from API routes (NOT from migrations — use bootstrapCoreAgentsRaw).
 */
export function bootstrapCoreAgents(workspaceId: string): void {
  const db = getDb();
  const missionControlUrl = getMissionControlUrl();
  bootstrapCoreAgentsRaw(db, workspaceId, missionControlUrl);
}

/**
 * Bootstrap core agents using a raw db handle.
 * Use this inside migrations to avoid getDb() recursion.
 */
export function bootstrapCoreAgentsRaw(
  db: Database.Database,
  workspaceId: string,
  missionControlUrl: string,
): void {
  // Only bootstrap if workspace has zero agents
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM agents WHERE workspace_id = ?'
  ).get(workspaceId) as { cnt: number };

  if (count.cnt > 0) {
    console.log(`[Bootstrap] Workspace ${workspaceId} already has ${count.cnt} agent(s) — skipping`);
    return;
  }

  const userMd = sharedUserMd(missionControlUrl);
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO agents (id, name, role, description, avatar_emoji, status, is_master, workspace_id, soul_md, user_md, agents_md, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'standby', 0, ?, ?, ?, ?, 'local', ?, ?)
  `);

  for (const agent of CORE_AGENTS) {
    const id = crypto.randomUUID();
    insert.run(
      id,
      agent.name,
      agent.role,
      `${agent.name} — core team member`,
      agent.emoji,
      workspaceId,
      agent.soulMd,
      userMd,
      SHARED_AGENTS_MD,
      now,
      now,
    );
    console.log(`[Bootstrap] Created ${agent.name} (${agent.role}) for workspace ${workspaceId}`);
  }
}

/**
 * Clone workflow templates from the default workspace into a new workspace.
 */
export function cloneWorkflowTemplates(db: Database.Database, targetWorkspaceId: string): void {
  const templates = db.prepare(
    "SELECT * FROM workflow_templates WHERE workspace_id = 'default'"
  ).all() as { id: string; name: string; description: string; stages: string; fail_targets: string; is_default: number }[];

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
