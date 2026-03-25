# Devin Parity Features — Spec

**Status:** APPROVED  
**Date:** 2026-03-25  
**Repo:** crshdn/mission-control  
**Build order:** 5 independent PRs, each deployable on its own

---

## Overview

Five features that close the gap between Autensa and Devin.ai while preserving Autensa's unique product-discovery pipeline advantage. Each feature is a standalone PR with no cross-dependencies.

---

## Feature 1: PR Review Auto-Fix

**PR branch:** `feature/pr-review-autofix`  
**Estimated effort:** ~400 lines  
**Priority:** Highest — immediate ROI, closes biggest workflow gap

### Problem
When a reviewer leaves comments on an Autensa-generated PR or CI fails post-push, nothing happens. The task sits in "done" and the PR rots. Devin automatically picks up review comments, fixes the code, and pushes again.

### Solution
Extend the existing GitHub webhook handler to listen for `pull_request_review`, `pull_request_review_comment`, and `issue_comment` events. When comments arrive on an Autensa-created PR:

1. **Webhook receives event** → match PR URL to task via `tasks.pr_url`
2. **Collect review context** — diff hunks, reviewer comments, CI status
3. **Re-dispatch to original agent** with a new message:
   ```
   PR REVIEW FEEDBACK on "{task.title}"
   
   Reviewer comments:
   {formatted comments with file paths and line numbers}
   
   CI Status: {pass/fail with logs if failed}
   
   Fix the issues raised, commit, and push to the same branch.
   Do NOT open a new PR.
   ```
4. **Task status** transitions: `done` → `review_fix` → `in_progress` (new status)
5. **Activity log** records each review-fix cycle with reviewer name and comment count
6. **Max cycles:** configurable per-product (default 3), after which task goes to `review` for human intervention
7. **Auto-Fix toggle:** per-product setting `auto_fix_pr_reviews` (default: true for semi_auto/full_auto tiers, false for supervised)

### Schema changes
```sql
-- Migration: add_pr_review_autofix
ALTER TABLE tasks ADD COLUMN review_fix_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN review_fix_max INTEGER DEFAULT 3;
ALTER TABLE products ADD COLUMN auto_fix_pr_reviews INTEGER DEFAULT 1;
-- Add 'review_fix' to tasks status CHECK constraint
```

### Files to create/modify
- `src/app/api/webhooks/github/route.ts` — add `pull_request_review`, `issue_comment` handlers
- `src/lib/pr-review-handler.ts` — NEW: collect comments, format context, trigger re-dispatch
- `src/lib/types.ts` — add `review_fix` to TaskStatus union
- `src/lib/db/migrations.ts` — new migration
- `src/components/TaskModal.tsx` — show review-fix cycle count and reviewer comments
- `src/components/MissionQueue.tsx` — show "Fixing PR" badge for review_fix status

### Webhook events to handle
| Event | Action | Behavior |
|---|---|---|
| `pull_request_review` | `submitted` (changes_requested) | Trigger auto-fix |
| `pull_request_review` | `submitted` (approved) | Mark PR approved, skip |
| `issue_comment` | `created` (on PR, not by bot) | Trigger auto-fix |
| `check_suite` | `completed` (failure, on open Autensa PR) | Trigger auto-fix with CI logs |

---

## Feature 2: Browser QA (Visual Verification)

**PR branch:** `feature/browser-qa`  
**Estimated effort:** ~600 lines  
**Priority:** High — agents can't currently verify UI work

### Problem
Autensa agents can run `npm test` and `tsc` but can't see what the app actually looks like. Devin spins up the app, clicks through it, takes screenshots, and verifies visually before opening a PR.

### Solution
Add a browser verification step between "build complete" and "PR created" using Browserbase (already available in our stack, API key in `.env`).

1. **Post-build verification trigger** — after agent reports build success, before PR:
   - Agent includes `%%QA_READY%%` marker with dev server URL and test scenarios
   - MC detects marker, launches browser QA
2. **Browser QA worker** (`src/lib/browser-qa.ts`):
   - Creates Browserbase session
   - Navigates to dev server URL (agent provides port from workspace isolation)
   - Executes test scenarios (click flows, form fills, visual checks)
   - Takes screenshots at each step
   - Returns pass/fail with screenshot evidence
3. **Screenshot storage** — save to `task_images` (existing table) with type `qa_screenshot`
4. **QA report** — structured JSON attached to task activities
5. **Failure handling** — if QA fails, send feedback to agent with screenshots showing what's broken
6. **QA scenarios** — defined in product settings or inferred from task type:
   - Default: navigate to /, check for console errors, take screenshot
   - Custom: product-level `qa_scenarios` JSON field

### Schema changes
```sql
-- Migration: add_browser_qa
ALTER TABLE products ADD COLUMN qa_scenarios TEXT; -- JSON array of test scenarios
ALTER TABLE products ADD COLUMN qa_enabled INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN qa_status TEXT CHECK (qa_status IN ('pending', 'running', 'passed', 'failed', 'skipped'));
ALTER TABLE tasks ADD COLUMN qa_report TEXT; -- JSON report with screenshot refs
```

### Files to create/modify
- `src/lib/browser-qa.ts` — NEW: Browserbase integration, scenario runner, screenshot capture
- `src/lib/browser-qa-scenarios.ts` — NEW: default and custom scenario definitions
- `src/app/api/tasks/[id]/qa/route.ts` — NEW: trigger QA manually, get QA report
- `src/app/api/webhooks/agent-completion/route.ts` — hook QA into completion flow
- `src/components/TaskModal.tsx` — QA tab showing screenshots and pass/fail
- `src/components/QATab.tsx` — NEW: screenshot gallery, scenario results, re-run button

### QA Scenario Schema
```typescript
interface QAScenario {
  name: string;
  steps: QAStep[];
}
interface QAStep {
  action: 'navigate' | 'click' | 'type' | 'screenshot' | 'assert_text' | 'assert_no_errors';
  selector?: string;
  value?: string;
  url?: string;
  description: string;
}
```

### Environment
- `BROWSERBASE_API_KEY` — already in .env
- `BROWSERBASE_PROJECT_ID` — already in .env
- Dev server URL comes from workspace isolation (port 4200-4299 range)

---

## Feature 3: Codebase Explorer (Pre-Task Context Builder)

**PR branch:** `feature/codebase-explorer`  
**Estimated effort:** ~500 lines  
**Priority:** Medium-High — improves task success rate

### Problem
Autensa's planning phase asks LLM-generated questions about the task, but doesn't crawl the actual codebase to build context. Devin's "Ask Devin" does structured code search and auto-generates context-rich prompts.

### Solution
Add a codebase exploration step between planning completion and dispatch. The explorer clones/pulls the repo, analyzes structure, and builds a context document that gets injected into the dispatch message.

1. **Trigger:** after `planning_complete = 1`, before dispatch
2. **Explorer worker** (`src/lib/codebase-explorer.ts`):
   - Clone or pull repo to temp workspace
   - Generate file tree (filtered: no node_modules, .git, dist)
   - Identify key files: package.json, tsconfig, main entry points, test config
   - Find files relevant to the task (keyword search from planning spec)
   - Extract function signatures, type definitions, and imports from relevant files
   - Count LOC, detect framework/language
3. **Context document** — structured markdown injected into dispatch message:
   ```
   ## Codebase Context
   
   **Framework:** Next.js 14 | **Language:** TypeScript | **LOC:** 12,400
   **Test runner:** vitest | **DB:** PostgreSQL (Prisma)
   
   ### Relevant Files (from planning spec keywords)
   - src/lib/auth.ts (142 lines) — authentication utilities
   - src/app/api/users/route.ts (89 lines) — user CRUD endpoints
   
   ### Key Type Definitions
   ```typescript
   interface User { id: string; email: string; ... }
   ```
   
   ### Project Structure
   src/
     app/ (14 routes)
     lib/ (23 modules)
     components/ (31 components)
   ```
4. **Cache** — store exploration results per product+commit, reuse for subsequent tasks
5. **Depth control** — `exploration_depth` product setting: `shallow` (tree only) | `standard` (tree + relevant files) | `deep` (tree + all exports + dependency graph)

### Schema changes
```sql
-- Migration: add_codebase_explorer
CREATE TABLE IF NOT EXISTS codebase_snapshots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  file_tree TEXT NOT NULL,
  framework TEXT,
  language TEXT,
  loc INTEGER,
  key_files TEXT, -- JSON
  type_definitions TEXT, -- JSON
  explored_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id, commit_sha)
);
ALTER TABLE products ADD COLUMN exploration_depth TEXT DEFAULT 'standard' 
  CHECK (exploration_depth IN ('shallow', 'standard', 'deep'));
```

### Files to create/modify
- `src/lib/codebase-explorer.ts` — NEW: clone, analyze, generate context document
- `src/lib/file-analyzer.ts` — NEW: extract exports, types, signatures from TS/JS/Python files
- `src/app/api/products/[id]/explore/route.ts` — NEW: trigger manual exploration
- `src/app/api/tasks/[id]/dispatch/route.ts` — inject codebase context into dispatch message
- `src/components/autopilot/ProductSettings.tsx` — add exploration_depth setting

---

## Feature 4: MCP Integration Framework

**PR branch:** `feature/mcp-integrations`  
**Estimated effort:** ~700 lines  
**Priority:** Medium — extensibility play, compound value over time

### Problem
Autensa agents can only access what OpenClaw skills provide. Devin plugs into Datadog, Sentry, Figma, Notion, Stripe, etc. via MCP. Agents can't investigate production issues, read designs, or query external data during tasks.

### Solution
Add MCP (Model Context Protocol) server connections to Autensa. Product owners configure MCP servers per product, and agents get those tools injected into their dispatch context.

1. **MCP server registry** — products can have N MCP server connections
2. **Connection types:**
   - `stdio` — local command (e.g., `npx @modelcontextprotocol/server-postgres`)
   - `sse` — remote SSE endpoint (e.g., hosted MCP server URL)
3. **Tool discovery** — on product setup, MC connects to each MCP server, lists available tools, stores the tool schemas
4. **Dispatch injection** — when dispatching a task, include MCP tool descriptions in agent instructions:
   ```
   ## Available External Tools (MCP)
   
   You have access to these external tools via the MCP protocol:
   - sentry.get_issues(project_slug) — fetch recent Sentry errors
   - db.query(sql) — run read-only SQL against production DB
   
   To use them, call: %%MCP_CALL%%{"server":"sentry","tool":"get_issues","args":{...}}%%END%%
   ```
5. **MCP proxy** — MC receives `%%MCP_CALL%%` markers from agent output, executes against the configured MCP server, returns results to agent
6. **Security** — MCP servers run in product context only, read-only by default, write operations require explicit product-level approval

### Schema changes
```sql
-- Migration: add_mcp_integrations
CREATE TABLE IF NOT EXISTS product_mcp_servers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('stdio', 'sse')),
  command TEXT, -- for stdio: e.g. "npx @mcp/server-postgres"
  url TEXT, -- for sse: endpoint URL
  env_vars TEXT, -- JSON: {"DATABASE_URL": "..."} 
  available_tools TEXT, -- JSON: discovered tool schemas
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Files to create/modify
- `src/lib/mcp/client.ts` — NEW: MCP client (stdio + SSE transport), tool discovery, tool execution
- `src/lib/mcp/proxy.ts` — NEW: parse %%MCP_CALL%% markers from agent output, execute, return results
- `src/lib/mcp/types.ts` — NEW: MCP tool schema types
- `src/app/api/products/[id]/mcp/route.ts` — NEW: CRUD MCP servers, test connections, discover tools
- `src/app/api/tasks/[id]/dispatch/route.ts` — inject MCP tool descriptions
- `src/components/MCPTab.tsx` — NEW: manage MCP connections, test tools, view available tools
- `src/components/autopilot/ProductSettings.tsx` — link to MCP configuration

### MCP Server Presets (built-in)
| Preset | Package | Use Case |
|---|---|---|
| PostgreSQL | `@modelcontextprotocol/server-postgres` | Query production DB |
| GitHub | `@modelcontextprotocol/server-github` | Issues, PRs, code search |
| Sentry | `@mcp/sentry-server` | Error monitoring |
| Filesystem | `@modelcontextprotocol/server-filesystem` | Read project files |

---

## Feature 5: Session Insights (Post-Task Analytics)

**PR branch:** `feature/session-insights`  
**Estimated effort:** ~500 lines  
**Priority:** Medium — improves future task success through feedback loop

### Problem
After a task completes (or fails), there's no analysis of what happened, where the agent got stuck, or how to write better prompts next time. Devin provides a timeline visualization, identifies bottlenecks, and auto-suggests improved prompts.

### Solution
Add a post-task analysis system that generates insights from task activities, agent session logs, and outcomes.

1. **Insight generation** — after task → done (or after max retries):
   - Analyze task_activities timeline (dispatch → first file → build → test → PR)
   - Identify bottlenecks: long gaps, repeated errors, stall events
   - Calculate metrics: time-to-first-commit, build attempts, test pass rate
   - Compare to product baseline (avg task duration, success rate)
   - Generate improved prompt suggestion via LLM
2. **Timeline visualization** — horizontal timeline showing:
   - Activity types color-coded (dispatch=blue, file_created=green, error=red, stalled=yellow)
   - Duration bars between events
   - Annotations for key moments (first error, recovery, completion)
3. **Prompt improvement** — LLM analyzes the original dispatch prompt + what went wrong + what succeeded, suggests a better prompt template for similar future tasks
4. **Product-level dashboard** — aggregate insights across all tasks:
   - Success rate trend
   - Average time-to-completion by task type
   - Most common failure patterns
   - Agent performance comparison

### Schema changes
```sql
-- Migration: add_session_insights
CREATE TABLE IF NOT EXISTS task_insights (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  duration_seconds INTEGER,
  time_to_first_commit INTEGER, -- seconds
  build_attempts INTEGER,
  test_pass_rate REAL,
  stall_count INTEGER,
  error_count INTEGER,
  bottleneck_summary TEXT, -- short text
  improved_prompt TEXT, -- LLM-generated
  timeline_data TEXT, -- JSON: [{type, timestamp, duration, annotation}]
  insights_json TEXT, -- JSON: full analysis
  generated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(task_id)
);
```

### Files to create/modify
- `src/lib/session-insights.ts` — NEW: analyze task activities, generate timeline, identify bottlenecks
- `src/lib/prompt-improver.ts` — NEW: LLM-powered prompt improvement from task outcomes
- `src/app/api/tasks/[id]/insights/route.ts` — NEW: get/generate insights for a task
- `src/app/api/products/[id]/insights/route.ts` — NEW: aggregate product-level analytics
- `src/components/InsightsTab.tsx` — NEW: timeline visualization, metrics, improved prompt
- `src/components/ProductInsights.tsx` — NEW: product-level analytics dashboard
- `src/components/TaskModal.tsx` — add Insights tab
- `src/lib/task-governance.ts` — trigger insight generation on task completion

### Timeline Event Schema
```typescript
interface TimelineEvent {
  type: 'dispatch' | 'file_created' | 'file_modified' | 'build' | 'test' | 'error' | 'stall' | 'recovery' | 'pr_created' | 'completed';
  timestamp: string;
  duration_ms?: number;
  annotation?: string;
  severity?: 'info' | 'warning' | 'error';
}
```

---

## Build Order

All 5 features are independent — no cross-dependencies. Recommended parallel assignment:

| PR | Branch | Agent Type | Est. Lines |
|---|---|---|---|
| 1. PR Review Auto-Fix | `feature/pr-review-autofix` | Backend-heavy | ~400 |
| 2. Browser QA | `feature/browser-qa` | Full-stack | ~600 |
| 3. Codebase Explorer | `feature/codebase-explorer` | Backend | ~500 |
| 4. MCP Integration | `feature/mcp-integrations` | Full-stack | ~700 |
| 5. Session Insights | `feature/session-insights` | Full-stack + LLM | ~500 |

**Total:** ~2,700 lines across 5 PRs

## Shared Conventions

- All new tables use TEXT PRIMARY KEY with UUID v4
- All timestamps are ISO 8601 via `datetime('now')`
- All API routes require Bearer token auth (existing middleware)
- All UI components use existing MC design system (mc-* CSS classes, lucide-react icons)
- LLM calls use existing `complete()` helper from `src/lib/autopilot/llm.ts`
- SSE broadcasts use existing `broadcastTaskUpdate()` from `src/lib/events.ts`
