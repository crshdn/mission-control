# Issue #1: Stalled Tasks Deadlock — Local Worker Guide

**Source:** <https://github.com/smb209/mission-control/issues/1>
**Status:** FIXED (pending release)
**Summary:** Tasks used to become permanently deadlocked when they had no
properly-typed activities and no deliverables — the evidence gate blocked
every forward transition AND `POST /fail` returned 500, so operators had no
supported path to release, cancel, or delete the task.

Resolved by migration `029` + the endpoints documented under **Operator
escape hatch** below. The original write-up is preserved in
*Historical context* for provenance.

---

## Operator escape hatch

### 1. Cancel a stalled task (primary tool)

```bash
MC="http://localhost:4000"; AUTH="Authorization: Bearer $TOK"

curl -s -X POST "$MC/api/tasks/$TASK_ID/admin/release-stall" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"reason":"agent_stalled_no_activity","terminal_state":"cancelled"}'
```

- Bypasses the evidence gate.
- Terminates `openclaw_sessions` for the task AND every convoy sub-task.
- Unassigns the agent, sets `status = 'cancelled'`, writes
  `status_reason = 'released_by_admin: <reason>'`.
- Dissolves the convoy (sets `convoys.status = 'failed'`) if the task is
  a convoy parent.
- Audit trail in both `task_activities` (`activity_type: admin_release`)
  and `events`.
- Terminal: cancelled tasks cannot transition back to active. Use `DELETE
  /api/tasks/:id` to remove, or create a fresh task.

Accepts `terminal_state: 'done'` if the operator considers the work
effectively complete; default is `'cancelled'`.

### 2. Fail a task with a real error (now 400, not 500)

`POST /api/tasks/:id/fail` used to return a bare 500 when
`handleStageFailure` couldn't resolve a `fail_target`. It now returns a
400 with a structured error and a hint pointing to `release-stall` when
recovery isn't possible. Use this when a testing/review/verification
stage should bounce back for rework; use `release-stall` when nothing
can bring the task back.

### 3. Scan for stalled tasks on demand

```bash
curl -s -X POST "$MC/api/tasks/scan-stalls" -H "$AUTH"
```

Returns `{ scanned, flagged: [...] }`. The scanner also runs automatically
every 2 minutes as part of `runHealthCheckCycle` (piggybacks on the SSE
stream). Flagged convoy sub-tasks message the coordinator agent via
`agent_mailbox`; non-convoy tasks fall through to
`MC_STALL_WEBHOOK_URL` if that env var is set. Threshold defaults to
30 min idle — override via `STALL_DETECTION_MINUTES`.

---

## What was broken (historical context)

---

## What Happens

1. Task is created and dispatched to an agent
2. Agent runs heartbeat pings (~every 2 min) but logs them as `type: null` instead of real activity types ("progress", "deliverable", etc.)
3. Agent stalls without producing a deliverable
4. Task stuck in `in_progress`, `verification`, or `convoy_active`
5. All API operations fail:
   - `POST /api/tasks/{id}/fail` → Internal server error
   - `PATCH /api/tasks/{id}` with `status: completed` → "Evidence gate failed"
   - `DELETE /api/tasks/{id}` → "Failed to delete task"

### Root Causes

- **No automatic activity logging** — agents must manually POST activities with proper types; heartbeat timestamps alone don't satisfy the evidence gate
- **No admin bypass for the evidence gate** — no endpoint to override quality gates for stalled tasks
- **No stall detection** — tasks can remain idle indefinitely with no alerting
- **Checkpoints not working** — `checkpoint/restore` returns "No checkpoint to restore from" even after hours of activity

---

## Proposed Fixes

### Priority 1 — Admin escape hatch

Add an admin-only endpoint to bypass the evidence gate:

```
POST /api/tasks/{id}/admin/release-stall
{
  "reason": "agent_stalled_no_activity",
  "released_by": "admin-token-or-api-key"
}
```

This allows transitioning any task to a terminal state regardless of evidence requirements.

### Priority 2 — Server-side activity logging

The server should automatically record meaningful interactions as activities with proper types:
- Agent health check responses → `type: "heartbeat"`
- Deliverable registration attempts → `type: "deliverable_attempt"`
- Dispatch events → `type: "dispatched"`
- Planning events → `type: "planning_*"`

### Priority 3 — Stall detection + alerting

Periodic health checks flagging tasks that:
- Same status for > X minutes (configurable, default 30 min)
- No deliverables registered
- No activities with non-null `type`

When flagged: set `status_reason`, send notification via Discord/webhook, optionally auto-create a cleanup task.

### Priority 4 — Fix checkpoint system

Ensure checkpoints are created during normal task lifecycle so `checkpoint/restore` is viable recovery. Currently returns empty even for long-running tasks.

---

## Current Workaround

```bash
MC="http://localhost:4001"
TOK="<token>"
AUTH="Authorization: Bearer $TOK"

# 1. Force-complete planning (moves to inbox)
curl -X POST "$MC/api/tasks/{id}/planning/force-complete" \
  -H "$AUTH" -H "Content-Type: application/json" -d '{}'

# 2. Unassign agent (bypasses evidence gate)
curl -X PATCH "$MC/api/tasks/{id}" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assigned_agent_id":null}'

# 3. Delete
curl -X DELETE "$MC/api/tasks/{id}" -H "$AUTH"
```

---

## Local Machine Resources

### Repo & Checkout
| Resource | Path / URL |
|----------|-----------|
| Fork (active source) | <https://github.com/smb209/mission-control> |
| Local checkout | `/Users/snappytwo/snappytwo-sandbox/mission-control` |
| GitHub access | `research-sc` has **owner** access |
| Upstream remote | Removed — only work with our fork |

### Running Container
| Resource | Detail |
|----------|--------|
| Container name | `mission-control` |
| Image | `mission-control:latest` |
| Host port | `4000` → container `4000` |
| Internal API base | `http://localhost:4001` (proxied) |
| DB path (in container) | `/app/data/mission-control.db` |
| Workspace volume | `/app/workspace/` |

### Docker Compose
- **Compose file:** `/Users/snappytwo/snappytwo-sandbox/mission-control/docker-compose.yml`
- **Dockerfile:** `/Users/snappytwo/snappytwo-sandbox/mission-control/Dockerfile`
- **Volumes:** Named volumes `mission-control-data` (DB) + `mission-control-workspace` (deliverables)
- **Host data bind:** `/Users/snappytwo/docker/mission-control/` maps to container paths

### OpenClaw Gateway Connection
- **Gateway URL:** `ws://host.docker.internal:18789` (set in container environment)
- **Gateway Token:** Stored in container env (`OPENCLAW_GATEWAY_TOKEN`)
- **Gateway local:** `http://localhost:18789`

### Build & Run
```bash
# Build the Docker image from fork
cd /Users/snappytwo/snappytwo-sandbox/mission-control
docker compose build

# Start (volumes persist DB + workspace)
docker compose up -d

# Rebuild after code changes
docker compose up -d --build

# View logs
docker logs mission-control -f

# Exec into running container
docker exec -it mission-control sh

# Stop
docker compose down
```

### Local Dev (non-Docker)
```bash
cd /Users/snappytwo/snappytwo-sandbox/mission-control
npm install
npm run build          # Next.js production build
npm run db:seed         # Seed database (creates default agents like "Charlie")
npm start               # Start on port 4000
```

### Database
- **SQLite DB location (host):** `/Users/snappytwo/docker/mission-control/mission-control.db`
- **Backups:** `/Users/snappytwo/docker/mission-control/data/db-backups/`
- **NEVER mutate SQLite directly.** Use the REST API or `docker exec` to run seed scripts.

### Workspace / Deliverables
- **Host path:** `/Users/snappytwo/docker/mission-control/workspace/`
- Files saved here are readable by agents at `/app/workspace/<filename>` inside container

---

## Key Files to Modify for This Fix

| File | Purpose |
|------|---------|
| `src/app/api/tasks/[id]/fail/route.ts` | Where `POST /api/tasks/{id}/fail` fails with internal error |
| `src/app/api/tasks/[id]/route.ts` (PATCH) | Evidence gate validation logic |
| `src/app/api/tasks/[id]/delete/route.ts` | Deletion blocking |
| `src/models/task.ts` or similar | Evidence gate model/validation |
| `src/lib/checkpoints.ts` | Checkpoint creation logic (currently broken) |
| New file: `src/app/api/tasks/[id]/admin/release-stall/route.ts` | Admin escape hatch endpoint |

## Notes for Future Workers

- This fork (`smb209/mission-control`) is our source of truth. Do NOT push to or file issues against upstream.
- The running Docker image is built from this fork. Any fixes should be made here first.
- If agents don't show up in the UI after a rebuild: check gateway connectivity, run `/api/agents/discover`, verify `openclaw_session_id` linkage via `/api/agents/{id}`.
- Database resets (`db:seed`) will wipe custom agents. Always back up before reseeding.
