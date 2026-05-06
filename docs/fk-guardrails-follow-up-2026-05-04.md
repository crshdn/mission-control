# Mission Control FK Guardrails Follow-up Plan

Task: `b8b6a9f7-490d-48c8-9506-a37aab633f37`
Date: 2026-05-04

## What changed now

- Request-time FK guardrails now reject stale references before SQLite insert/update work:
  - task create: `assigned_agent_id`, `created_by_agent_id`, `workspace_id`
  - task update: `assigned_agent_id`, `updated_by_agent_id`
  - task activity create: route `task_id`, optional `agent_id`
  - task deliverable create: route `task_id`
- Invalid references return structured HTTP 400 JSON instead of SQLite stack traces.
- Legacy OpenClaw `marketing` routing is translated to current `scout` routing at dispatch/session-completion boundaries without mutating existing DB rows.

## Root cause notes

- The repeated task-create failure came from a stale request payload using `assigned_agent_id = 157ff0f3-c11e-46ec-b31a-1ff31c0e75bf` for the Vale research gate task. That UUID does not exist in current Mission Control `agents`.
- The stale marketing failure comes from persisted Scout rows and old scripts still treating the OpenClaw target as `marketing`, while the active target is `scout`.
- Existing DB rows also include historical orphan `task_activities` / `task_deliverables`; this task deliberately did not mutate them.

## Cleanup plan for a follow-up task

1. Snapshot first:
   - stop Mission Control or use a safe SQLite backup window
   - copy `mission-control.db`, `mission-control.db-wal`, and `mission-control.db-shm` to a timestamped backup folder
2. Produce an orphan report before deleting anything:
   - `task_activities` with missing `tasks.id`
   - `task_activities.agent_id` with missing `agents.id`
   - `task_deliverables` with missing `tasks.id`
   - `tasks.assigned_agent_id` / `tasks.created_by_agent_id` with missing `agents.id`
3. Decide cleanup policy per row class:
   - delete orphan activities/deliverables whose parent task is gone
   - null optional orphan agent references where the parent task still exists
   - preserve a CSV/JSON audit export before any deletion/nulling
4. Normalize stale agent routing data only after approval:
   - update Scout's persisted `gateway_agent_id` from `marketing` to `scout`, or add a migration that performs the same mapping once
   - retire legacy scripts if they are no longer used by cron
5. Log rotation after the FK guardrail deployment is confirmed:
   - archive `logs/mc-error.log` and `logs/mc.log` with timestamped names
   - start fresh logs
   - keep the archive until after one clean heartbeat window verifies no recurring FK stack traces
6. Post-cleanup verification:
   - rerun FK guard tests and `npm run build`
   - run live invalid-reference probes and confirm HTTP 400 structured JSON
   - confirm new logs do not contain `SQLITE_CONSTRAINT_FOREIGNKEY` for task create/activity/deliverable writes

## Guardrail verification from this task

- Unit route tests cover invalid task create/update, activity task/agent references, and deliverable task references.
- Live probes against `127.0.0.1:4000` confirmed structured 400 JSON for the same classes.
