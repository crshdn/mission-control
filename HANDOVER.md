# Mission Control v1.3.2+ Handover — Session 2026-03-03

## Current State

**Build:** Passes clean (`npm run build`)
**PM2:** Running from `/Users/nomames/projects/mission-control` on port 4000 (process name: `mission-control`)
**Database:** Migrations 010-012 applied. Full workflow tables + Strict template fixed.
**Git:** All changes are **uncommitted**. User is actively testing.

---

## What Was Done This Session

### Session 2 Fixes (on top of v1.3.2 from Session 1)

#### Bug: Dangling FK References (Migration 011)
- **Problem:** Migration 010 renamed `tasks` → `_tasks_old_010`, SQLite rewrote FK refs in 8 child tables to point to `"_tasks_old_010"`. After dropping temp table, all task operations returned 500 "no such table: main._tasks_old_010".
- **Affected tables:** planning_questions, planning_specs, conversations, events, openclaw_sessions, task_activities, task_deliverables, task_roles
- **Fix:** Migration 011 recreates all affected tables with correct FK references. Live DB patched via `writable_schema`. Migration runner now sets `legacy_alter_table = ON` to prevent this class of bug.

#### Feature: Full Multi-Agent Pipeline Wired End-to-End

**1. Workflow-aware dispatch** (`src/app/api/tasks/[id]/dispatch/route.ts`)
- No longer hardcodes `status = 'in_progress'` for every dispatch — only for builder (assigned→in_progress)
- Builds role-specific instructions per agent type:
  - **Builder:** "When done, update status to `testing`" (derived from workflow template)
  - **Tester:** "Pass → update to `review`. Fail → `POST /api/tasks/{id}/fail`"
  - **Verifier:** "Pass → update to `done`. Fail → `POST /api/tasks/{id}/fail`"
- Imports `getTaskWorkflow` to look up stages and derive next status

**2. Workflow engine on all stage transitions** (`src/app/api/tasks/[id]/route.ts`)
- PATCH route now calls `handleStageTransition()` when status changes to testing, review, or verification
- Finds role agent from `task_roles`, assigns them, dispatches
- If no agent for role → sets `planning_dispatch_error` → banner shows on card
- Separate from the `shouldDispatch` block (which handles assigned status)

**3. Stage-aware banners** (`src/components/MissionQueue.tsx`)
- Testing/Verification + dispatch error → red banner with error message
- Review + no error → cyan "In queue — waiting for verification" banner
- Inbox + no agent → amber "Needs agent — assign to start" banner

**4. Smart task creation** (`src/components/TaskModal.tsx`)
- New task + agent → status auto-set to `assigned` → modal closes → dispatch fires
- New task + no agent → status auto-set to `inbox` → modal closes → amber banner
- Planning mode → stays open, switches to planning tab
- "Save & New" button: saves task, clears form, keeps modal open
- Error feedback: red banner shows on API failure instead of silent fail
- Fixed double dispatch: client-side dispatch removed for existing tasks (PATCH handles it)
- `resolveStatus()` helper determines correct status automatically

**5. Strict template fix** (Migration 012)
- Review stage: `role: null` (queue — no agent dispatched)
- Verification stage: `role: verifier` (active QC)
- Updated both seed data in migration 010 and live DB

---

## Full Task Lifecycle (how it works now)

```
1. User creates task + assigns builder → status: assigned → modal closes
2. PATCH route dispatches to builder → status: in_progress
3. Builder works, finishes → PATCHes to 'testing'
4. PATCH route → handleStageTransition('testing')
   → Finds tester agent from task_roles → assigns → dispatches
   → If no tester: sets dispatch error → red banner on card
5. Tester passes → PATCHes to 'review'
   → review is queue (role=null) → cyan "waiting for verification" banner
6. Tester fails → POST /api/tasks/{id}/fail → back to in_progress → builder re-dispatched
7. Task moves from review → verification
   → handleStageTransition finds verifier → assigns → dispatches
8. Verifier passes → PATCHes to 'done' → learner notified
9. Verifier fails → POST /fail → back to in_progress → builder picks up
```

**Review column = waiting queue (no agent dispatch)**
**Verification column = active QC by verifier agent**

---

## All Files Changed (this session + previous)

### New Files
| File | Purpose |
|------|---------|
| `src/lib/workflow-engine.ts` | Core auto-handoff engine — stage transitions, fail-loopback, role→agent lookup |
| `src/lib/learner.ts` | Learner module — notifies learner agent, queries/injects knowledge |
| `src/app/api/workspaces/[id]/workflows/route.ts` | GET/POST workflow templates per workspace |
| `src/app/api/tasks/[id]/roles/route.ts` | GET/PUT role→agent assignments per task |
| `src/app/api/workspaces/[id]/knowledge/route.ts` | GET/POST learner knowledge entries |
| `src/app/api/tasks/[id]/fail/route.ts` | POST stage failure — triggers fail-loopback |
| `src/components/TeamTab.tsx` | UI for team management (workflow selector, role assignments) |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/db/migrations.ts` | Migrations 010 (tables), 011 (FK fix), 012 (Strict template). `legacy_alter_table = ON` in runner. |
| `src/lib/db/schema.ts` | New table definitions + `verification` in status CHECK |
| `src/lib/types.ts` | `verification` in TaskStatus, workflow/role/knowledge interfaces |
| `src/lib/validation.ts` | `pending_dispatch` + `verification` in Zod, `workflow_template_id` in UpdateTaskSchema |
| `src/app/api/tasks/[id]/route.ts` | Workflow engine on ALL stage transitions, learner notifications |
| `src/app/api/tasks/[id]/dispatch/route.ts` | Role-specific instructions, conditional status update |
| `src/app/api/workspaces/route.ts` | `verification: 0` in WorkspaceStats |
| `src/components/MissionQueue.tsx` | Stage-aware banners (inbox, testing, review, verification) |
| `src/components/TaskModal.tsx` | Smart status routing, Save & New, error feedback, double dispatch fix |
| `src/components/PlanningTab.tsx` | Updated for workflow-aware dispatch |

---

## Database State
- SQLite at `./mission-control.db` (DATABASE_PATH in .env.local)
- Migrations 001-012 all applied
- 3 workflow templates: Simple, Standard, Strict (Strict updated by migration 012)
- `_migrations` table tracks all applied migrations

## What's Left
- [ ] User testing full workflow end-to-end
- [ ] Version bump to v1.3.2 in package.json
- [ ] Commit all changes after approval
- [ ] Any bugs found during testing

## Key Architecture Notes
- **Tech stack:** Next.js 14, React 18, TypeScript 5, SQLite (better-sqlite3), Zustand, Tailwind CSS
- **Agent orchestration:** OpenClaw gateway via WebSocket (sessions, chat.send RPC)
- **Config:** `getMissionControlUrl()` from `@/lib/config`
- **Auth:** `MC_API_TOKEN` in `.env.local`
- **PM2:** Process `mission-control`, port 4000
- **Plan reference:** `~/.claude/plans/effervescent-finding-mochi.md`
