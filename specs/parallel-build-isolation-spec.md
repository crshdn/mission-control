# Parallel Build Isolation — Same-App Concurrent Task Execution

**Version:** 1.0  
**Date:** 2026-03-19  
**Status:** Draft  
**Author:** Charlie (AI assistant)  

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Architecture](#3-architecture)
4. [Workspace Isolation Strategy](#4-workspace-isolation-strategy)
5. [Database Schema Changes](#5-database-schema-changes)
6. [API Changes](#6-api-changes)
7. [Dispatch Flow Changes](#7-dispatch-flow-changes)
8. [Merge Coordination](#8-merge-coordination)
9. [Conflict Detection](#9-conflict-detection)
10. [UI Changes](#10-ui-changes)
11. [Integration with Existing Systems](#11-integration-with-existing-systems)
12. [Build Order](#12-build-order)
13. [Testing Plan](#13-testing-plan)
14. [Future Considerations](#14-future-considerations)

---

## 1. Problem Statement

Mission Control sessions are already compartmentalized at the OpenClaw level — planning uses `agent:main:planning:{taskId}` and dispatch uses `agent:main:mission-control-{agent-name}`. Two tasks hitting different session keys won't interfere conversationally.

**But the filesystem is shared.** When dispatch builds a task, it targets:

```
${PROJECTS_PATH}/{project-dir-slug}/
```

Where `project-dir-slug` is derived from `task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')`. Two tasks for the same app both write to the same directory. This means:

1. **File collisions** — Agent A writes `src/components/Header.tsx`, Agent B overwrites it
2. **Build conflicts** — Both agents run `npm install` or `npm run build` simultaneously
3. **Git state corruption** — Both agents committing/pushing from the same working copy
4. **Dev server port conflicts** — Both try to start a dev server on the same port

**Result:** Users cannot safely dispatch multiple features for the same product in parallel, even though the session layer fully supports it.

---

## 2. Solution Overview

Introduce **workspace isolation per task** using one of two strategies depending on whether the project uses git:

### Strategy A: Git Worktrees (for repo-backed projects)
Each dispatched task gets its own **git worktree** — a separate checkout of the same repo at a different filesystem path. Worktrees share the git object store (no full clone per task), branches are independent, and merging happens via PRs.

### Strategy B: Task Sandboxes (for non-repo / local-only projects)
Each dispatched task gets a **copy-on-dispatch sandbox directory**. The project directory is copied to a task-specific path at dispatch time. When done, changes are merged back via a diff/patch flow.

Both strategies ensure:
- Each agent works in its own filesystem namespace
- No file collisions between concurrent tasks
- Merge is explicit and controlled (not accidental overwrites)
- The original project directory stays untouched during builds

---

## 3. Architecture

### Current Flow (No Isolation)

```
Task A dispatched → writes to ~/projects/my-app/
Task B dispatched → writes to ~/projects/my-app/  ← COLLISION
```

### New Flow (With Isolation)

```
Task A dispatched → writes to ~/projects/my-app/.workspaces/task-{A-id}/
Task B dispatched → writes to ~/projects/my-app/.workspaces/task-{B-id}/
                                     ↓ (on completion)
                              Merge back to ~/projects/my-app/
```

For git worktrees:
```
Task A dispatched → git worktree at ~/projects/my-app/.workspaces/task-{A-id}/ (branch: autopilot/feature-a)
Task B dispatched → git worktree at ~/projects/my-app/.workspaces/task-{B-id}/ (branch: autopilot/feature-b)
                                     ↓ (on completion)
                              PR created per branch → merge via GitHub
```

---

## 4. Workspace Isolation Strategy

### 4.1 Directory Structure

```
~/projects/my-app/                          # Main project directory (untouched during builds)
├── .workspaces/                            # Isolation root (gitignored)
│   ├── task-{uuid-a}/                      # Task A's isolated workspace
│   │   ├── ... (full working copy)
│   │   └── .mc-workspace.json              # Workspace metadata
│   ├── task-{uuid-b}/                      # Task B's isolated workspace
│   │   ├── ...
│   │   └── .mc-workspace.json
│   └── .lock                               # Optional: merge serialization lock
├── src/
├── package.json
└── ...
```

### 4.2 `.mc-workspace.json` Metadata

```json
{
  "taskId": "uuid-of-task",
  "productId": "uuid-of-product",
  "createdAt": "2026-03-19T17:00:00Z",
  "strategy": "worktree" | "sandbox",
  "branch": "autopilot/feature-name",
  "baseBranch": "main",
  "baseCommit": "abc123",
  "status": "active" | "merged" | "abandoned",
  "agentId": "uuid-of-agent",
  "isolatedPort": 4201
}
```

### 4.3 Git Worktree Strategy (repo-backed projects)

When a task has `repo_url` set:

1. **On dispatch:** Create a git worktree from the repo's base branch
   ```bash
   cd ~/projects/my-app
   git fetch origin
   git worktree add .workspaces/task-{id} -b autopilot/{feature-slug} origin/{base-branch}
   ```

2. **Agent works** entirely within `.workspaces/task-{id}/`

3. **On completion:** Agent pushes branch, creates PR. Worktree stays until PR is merged or task is archived.

4. **Cleanup:** After merge/close, remove worktree:
   ```bash
   git worktree remove .workspaces/task-{id}
   git branch -d autopilot/{feature-slug}
   ```

**Advantages:**
- Native git — no custom merge logic
- Shared object store — worktrees are lightweight (~just the working files)
- Branch isolation is well-understood by every developer
- PRs provide natural review/merge flow
- GitHub Actions can run on each branch

### 4.4 Sandbox Strategy (non-repo projects)

When a task has no `repo_url`:

1. **On dispatch:** Copy the project directory
   ```bash
   rsync -a --exclude='.workspaces' --exclude='node_modules' --exclude='.next' \
     ~/projects/my-app/ ~/projects/my-app/.workspaces/task-{id}/
   ```

2. **Agent works** in the sandbox. Runs `npm install` there (isolated `node_modules`).

3. **On completion:** Generate a diff of the sandbox vs the base snapshot:
   ```bash
   diff -rq ~/projects/my-app/ ~/projects/my-app/.workspaces/task-{id}/ \
     --exclude='.workspaces' --exclude='node_modules' --exclude='.next'
   ```

4. **Merge:** Apply changes back to the main directory. If conflicts exist, flag for manual review.

5. **Cleanup:** Remove the sandbox directory after merge.

**Advantages:**
- Works without git
- Simple conceptually
- Good for prototypes and quick builds

**Disadvantages:**
- Copy can be slow for large projects
- Merge is less robust than git
- No built-in conflict resolution

### 4.5 Port Isolation

Each workspace gets an isolated dev server port to prevent port conflicts:

```
Base project port: 3000 (from package.json or env)
Task A workspace:  PORT=4201  (base 4200 + sequential assignment)
Task B workspace:  PORT=4202
```

Port assignment is stored in `.mc-workspace.json` and passed to the agent in the dispatch message. The port range `4200-4299` is reserved for isolated workspaces (add to Port Registry).

---

## 5. Database Schema Changes

### 5.1 New Columns on `tasks` Table

```sql
ALTER TABLE tasks ADD COLUMN workspace_path TEXT;        -- Isolated workspace path for this task
ALTER TABLE tasks ADD COLUMN workspace_strategy TEXT;     -- 'worktree' | 'sandbox' | null
ALTER TABLE tasks ADD COLUMN workspace_port INTEGER;      -- Isolated dev server port
ALTER TABLE tasks ADD COLUMN workspace_base_commit TEXT;  -- Git commit SHA at workspace creation
ALTER TABLE tasks ADD COLUMN merge_status TEXT;            -- 'pending' | 'merged' | 'conflict' | 'abandoned' | null
ALTER TABLE tasks ADD COLUMN merge_pr_url TEXT;            -- PR URL if merged via git
```

### 5.2 New Table: `workspace_ports`

Track port allocations to prevent collisions:

```sql
CREATE TABLE IF NOT EXISTS workspace_ports (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  port INTEGER NOT NULL UNIQUE,
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'released'
  created_at TEXT NOT NULL,
  released_at TEXT,
  UNIQUE(port)
);

CREATE INDEX idx_workspace_ports_active ON workspace_ports(status, port);
```

### 5.3 New Table: `workspace_merges`

Track merge history and conflicts:

```sql
CREATE TABLE IF NOT EXISTS workspace_merges (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  workspace_path TEXT NOT NULL,
  strategy TEXT NOT NULL,               -- 'worktree' | 'sandbox'
  base_commit TEXT,                     -- Starting point
  merge_commit TEXT,                    -- Result commit (for worktree)
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'merged' | 'conflict' | 'failed'
  conflict_files TEXT,                  -- JSON array of conflicting file paths
  merge_log TEXT,                       -- Full merge output
  merged_by TEXT,                       -- 'auto' | 'manual' | agent_id
  created_at TEXT NOT NULL,
  merged_at TEXT
);
```

---

## 6. API Changes

### 6.1 New Endpoints

#### `POST /api/tasks/[id]/workspace/create`
Create an isolated workspace for a task. Called automatically by dispatch when isolation is enabled.

**Request:**
```json
{
  "strategy": "worktree" | "sandbox",  // Optional: auto-detected from repo_url
  "baseBranch": "main"                  // Optional: defaults to repo_branch or "main"
}
```

**Response:**
```json
{
  "success": true,
  "workspacePath": "~/projects/my-app/.workspaces/task-{id}",
  "strategy": "worktree",
  "branch": "autopilot/feature-name",
  "port": 4201,
  "baseCommit": "abc123"
}
```

#### `POST /api/tasks/[id]/workspace/merge`
Trigger merge of task workspace back to main project. Called when task reaches `done` status.

**Request:**
```json
{
  "force": false,           // Skip conflict checks (manual override)
  "createPR": true          // For worktree: push branch and create PR
}
```

**Response:**
```json
{
  "success": true,
  "mergeStatus": "merged" | "conflict" | "pr_created",
  "prUrl": "https://github.com/...",        // If PR created
  "conflictFiles": [],                       // If conflicts
  "mergeCommit": "def456"                    // If direct merge
}
```

#### `GET /api/tasks/[id]/workspace/status`
Get workspace status and file diff summary.

**Response:**
```json
{
  "exists": true,
  "strategy": "worktree",
  "path": "~/projects/my-app/.workspaces/task-{id}",
  "port": 4201,
  "branch": "autopilot/feature-name",
  "filesChanged": 12,
  "insertions": 340,
  "deletions": 45,
  "mergeStatus": "pending",
  "conflicts": []
}
```

#### `POST /api/tasks/[id]/workspace/cleanup`
Remove workspace after merge or abandonment.

#### `GET /api/products/[id]/workspaces`
List all active workspaces for a product — shows what's being worked on in parallel.

**Response:**
```json
{
  "productId": "uuid",
  "projectPath": "~/projects/my-app",
  "activeWorkspaces": [
    {
      "taskId": "uuid-a",
      "taskTitle": "Add user auth",
      "branch": "autopilot/add-user-auth",
      "port": 4201,
      "agentName": "Builder",
      "filesChanged": 8,
      "createdAt": "2026-03-19T17:00:00Z"
    },
    {
      "taskId": "uuid-b",
      "taskTitle": "Add payment integration",
      "branch": "autopilot/add-payment-integration",
      "port": 4202,
      "agentName": "Builder 2",
      "filesChanged": 3,
      "createdAt": "2026-03-19T17:05:00Z"
    }
  ]
}
```

---

## 7. Dispatch Flow Changes

The dispatch route (`POST /api/tasks/[id]/dispatch`) needs these modifications:

### 7.1 Before Sending Task to Agent

Insert workspace creation between agent resolution and message construction:

```typescript
// === NEW: Create isolated workspace if parallel builds possible ===
let workspacePath = taskProjectDir;  // Default: original path
let workspacePort: number | undefined;
let workspaceBranch: string | undefined;

const parallelTaskCount = queryOne<{ count: number }>(
  `SELECT COUNT(*) as count FROM tasks 
   WHERE product_id = ? AND status IN ('assigned', 'in_progress', 'convoy_active')
   AND id != ?`,
  [task.product_id, task.id]
);

const needsIsolation = (parallelTaskCount?.count || 0) > 0 || task.repo_url;

if (needsIsolation) {
  const workspace = await createTaskWorkspace(task);
  workspacePath = workspace.path;
  workspacePort = workspace.port;
  workspaceBranch = workspace.branch;
}
```

### 7.2 Dispatch Message Additions

Add workspace context to the agent's dispatch message:

```
**🔒 ISOLATED WORKSPACE:**
- **Working directory:** ${workspacePath}
- **Port:** ${workspacePort} (use this for dev server, NOT the default)
- **Branch:** ${workspaceBranch}
- **IMPORTANT:** Do NOT modify files outside this workspace directory.
  Other agents may be working on the same project in parallel.
  All your work must stay within: ${workspacePath}
```

### 7.3 Auto-Detection Logic

```typescript
function determineIsolationStrategy(task: Task): 'worktree' | 'sandbox' | null {
  // If task has a repo URL, always use worktree
  if (task.repo_url) return 'worktree';
  
  // If other tasks are actively building the same product, use sandbox
  const activeSiblings = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks
     WHERE product_id = ? AND id != ?
     AND status IN ('in_progress', 'assigned', 'convoy_active', 'testing')`,
    [task.product_id, task.id]
  );
  
  if ((activeSiblings?.count || 0) > 0) return 'sandbox';
  
  // Single task, no repo — no isolation needed
  return null;
}
```

---

## 8. Merge Coordination

### 8.1 Git Worktree Merge (Preferred)

For repo-backed projects, the merge flow is:

1. **Task completes** → Agent pushes branch to remote
2. **PR auto-created** via `gh pr create` with task metadata in body
3. **MC updates** `merge_status = 'pr_created'` and stores `merge_pr_url`
4. **On PR merge** (webhook or poll), MC:
   - Updates `merge_status = 'merged'`
   - Runs `git worktree remove .workspaces/task-{id}`
   - Releases the workspace port

### 8.2 Sandbox Merge

For non-repo projects:

1. **Task completes** → MC diffs the sandbox against the original project
2. **No conflicts:** Auto-apply patch to main project dir, mark `merged`
3. **Conflicts detected:** Mark `merge_status = 'conflict'`, list files in UI
4. **Manual resolution:** User resolves in UI or CLI, then marks merged

### 8.3 Merge Queue

When multiple tasks complete around the same time, merges are serialized:

```typescript
// Acquire merge lock (file-based or DB row lock)
// This prevents two merges from stomping each other
const lockAcquired = await acquireMergeLock(task.product_id);
if (!lockAcquired) {
  // Queue for retry — another merge is in progress
  run('UPDATE tasks SET merge_status = ? WHERE id = ?', ['queued', task.id]);
  return;
}

try {
  await performMerge(task);
} finally {
  releaseMergeLock(task.product_id);
  // Check for queued merges and trigger next
  await processNextQueuedMerge(task.product_id);
}
```

---

## 9. Conflict Detection

### 9.1 Pre-Dispatch Warning

Before dispatching a second task to the same product, check if there's overlap risk:

```typescript
// Get files likely to be touched (from planning spec or description keywords)
const existingTasks = queryAll<{ id: string; title: string; workspace_path: string }>(
  `SELECT id, title, workspace_path FROM tasks
   WHERE product_id = ? AND status = 'in_progress' AND workspace_path IS NOT NULL`,
  [task.product_id]
);

if (existingTasks.length > 0) {
  // Warn in dispatch response (not blocking)
  warnings.push({
    type: 'parallel_build',
    message: `${existingTasks.length} other task(s) are actively building this product`,
    tasks: existingTasks.map(t => ({ id: t.id, title: t.title }))
  });
}
```

### 9.2 Runtime Conflict Detection

Optionally, periodically scan active workspaces for overlapping file modifications:

```typescript
// For sandbox strategy: compare modified file lists
function detectFileConflicts(workspaceA: string, workspaceB: string, baseDir: string): string[] {
  // Files modified in workspace A
  const modifiedA = getModifiedFiles(workspaceA, baseDir);
  // Files modified in workspace B
  const modifiedB = getModifiedFiles(workspaceB, baseDir);
  
  // Intersection = potential conflicts
  return modifiedA.filter(f => modifiedB.includes(f));
}
```

For git worktrees, this is handled natively by git merge conflict detection.

---

## 10. UI Changes

### 10.1 Product Workspace Dashboard

New panel on the Product detail view showing active parallel workspaces:

```
┌─────────────────────────────────────────────────────┐
│ 🔧 Active Workspaces — My App (2 parallel builds)   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🟢 Task: "Add user auth"                          │
│     Agent: Builder · Branch: autopilot/add-user-auth│
│     Port: 4201 · Files: 8 changed · 2h ago         │
│     [View Diff] [Open Workspace]                    │
│                                                     │
│  🟢 Task: "Add payment flow"                        │
│     Agent: Builder 2 · Branch: autopilot/add-pay... │
│     Port: 4202 · Files: 3 changed · 45m ago         │
│     [View Diff] [Open Workspace]                    │
│                                                     │
│  ⚠️ Potential overlap: src/lib/auth.ts modified by  │
│     both tasks                                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 10.2 Task Modal — Workspace Tab

Add a "Workspace" tab to the task modal showing:
- Isolated directory path
- Dev server port
- Branch name and base commit
- File diff summary (insertions/deletions)
- Merge status indicator
- Merge button (when task is done)

### 10.3 Merge Resolution UI

When conflicts exist:
- List conflicting files with side-by-side diff
- Accept left / accept right / manual edit options
- Or: "Open in VS Code" button to resolve externally

### 10.4 Kanban Board Indicator

Tasks with active isolated workspaces show a small icon (🔒 or 🔀) indicating parallel build isolation is active. Multiple tasks for the same product show a visual grouping or badge count.

---

## 11. Integration with Existing Systems

### 11.1 Convoy Mode

Convoys already decompose a parent task into parallel sub-tasks. Parallel Build Isolation is the **filesystem complement** to Convoy's session isolation:

- Convoy handles: session isolation, health monitoring, progress aggregation
- Parallel Build Isolation handles: filesystem isolation, port isolation, merge coordination

When a convoy dispatches sub-tasks, each sub-task automatically gets its own workspace. The convoy's merge phase triggers workspace merges in dependency order.

### 11.2 Checkpoint System

Checkpoints (`buildCheckpointContext`) already save agent progress. With workspace isolation:
- Checkpoint paths are workspace-relative (not absolute)
- Checkpoints include the workspace metadata (branch, base commit)
- Crash recovery resumes in the same workspace (files are preserved)

### 11.3 Cost Tracking

No changes needed — cost events are already scoped to `task_id`, not filesystem paths.

### 11.4 Learner / Knowledge Base

The learner should track:
- Merge conflict frequency per product (to learn about high-contention files)
- Which task combinations tend to conflict (to warn at planning time)
- Average workspace lifetime (for cleanup scheduling)

### 11.5 Task Governance

`pickDynamicAgent` doesn't need changes — agent assignment is independent of workspace isolation. But the dispatch route should prefer assigning parallel tasks for the same product to **different agents** when available, to reduce cognitive load per agent.

---

## 12. Build Order

### Phase 1: Core Isolation (MVP)
1. Database migration — add workspace columns to tasks, create workspace_ports table
2. `createTaskWorkspace()` utility — implements both worktree and sandbox strategies
3. Port allocator — assigns and tracks isolated ports
4. Dispatch route changes — create workspace before dispatch, include workspace info in agent message
5. Workspace status endpoint — `GET /api/tasks/[id]/workspace/status`

### Phase 2: Merge System
6. Workspace merge endpoint — `POST /api/tasks/[id]/workspace/merge`
7. Git worktree merge flow — push branch, create PR, track status
8. Sandbox merge flow — diff, patch, conflict detection
9. Merge queue with serialization lock
10. Auto-merge trigger on task completion (configurable)

### Phase 3: UI
11. Product workspace dashboard component
12. Task modal workspace tab
13. Kanban parallel build indicators
14. Merge resolution UI (conflict viewer)

### Phase 4: Intelligence
15. Pre-dispatch overlap warnings
16. Runtime conflict detection (file overlap scanner)
17. Learner integration — track conflict patterns
18. Smart agent assignment — spread parallel tasks across agents
19. Workspace cleanup cron (remove stale/abandoned workspaces)

---

## 13. Testing Plan

### Unit Tests
- `createTaskWorkspace()` — creates correct directory structure for both strategies
- Port allocator — assigns unique ports, handles releases, prevents collisions
- Strategy detection — worktree for repo tasks, sandbox for local tasks, null for single tasks
- Merge serialization — queue works, lock prevents concurrent merges

### Integration Tests
- Dispatch two tasks for same product → both get isolated workspaces
- Agent completes task → merge back works (worktree + sandbox)
- Two agents modify same file → conflict detected and surfaced
- Port released after workspace cleanup
- Crash recovery — workspace survives agent restart

### Manual Tests
- Dispatch 3 features for one product simultaneously
- Verify each agent works in its own directory
- Complete all 3, merge sequentially
- Verify final project state is correct
- Test with real git repo (worktree flow end-to-end)

---

## 14. Future Considerations

### Container-Level Isolation
For maximum safety, each workspace could run in its own Docker container or VM. This prevents any filesystem cross-contamination and allows different Node/Python versions per task. Heavy but bulletproof.

### Workspace Templates
Pre-configured workspace templates per project type (Next.js, Python, etc.) that include correct `.env`, port configs, and build scripts. Reduces agent setup time.

### Live Preview per Workspace
Each isolated workspace gets its own preview URL (e.g., `task-{id}.preview.missioncontrol.dev`) for the user to see progress without port-forwarding. Could use Cloudflare Tunnels or similar.

### Workspace Sharing
Allow one agent to "peek" at another workspace's changes without merging — useful for agents that need to coordinate (e.g., backend agent needs to see what API shape the frontend agent is building).

### Automatic Rebase
When Task A merges first, automatically rebase Task B's workspace onto the new main. Prevents merge conflicts from growing stale. Only for worktree strategy.
