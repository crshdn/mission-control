# Mission Control FK cleanup and log rotation plan - 2026-05-04

## Current evidence

Commands run from `/Users/lilly/clawd` against `/Users/lilly/clawd/projects/mission-control/mission-control.db`:

```sql
SELECT 'task_activities_orphan_task' AS check_name, COUNT(*) AS count
FROM task_activities a LEFT JOIN tasks t ON t.id = a.task_id
WHERE t.id IS NULL;
-- 87

SELECT 'task_activities_orphan_agent' AS check_name, COUNT(*) AS count
FROM task_activities a LEFT JOIN agents ag ON ag.id = a.agent_id
WHERE a.agent_id IS NOT NULL AND ag.id IS NULL;
-- 0

SELECT 'task_deliverables_orphan_task' AS check_name, COUNT(*) AS count
FROM task_deliverables d LEFT JOIN tasks t ON t.id = d.task_id
WHERE t.id IS NULL;
-- 32

PRAGMA foreign_key_check;
-- reports the same historical task_activities/task_deliverables rows against missing tasks
```

Log sizes at check time:

```text
/Users/lilly/clawd/logs/mc-error.log  249M
/Users/lilly/clawd/logs/mc.log         79M
```

A request-time stale assignee was observed in `mc.log` for `Research: Customer/player note for monster-battler microgame pilot`:

```text
assigned_agent_id = 157ff0f3-c11e-46ec-b31a-1ff31c0e75bf
```

That id is not present in the current `agents` table. The canonical Vale id in the current DB is:

```text
a9903576-ee55-480a-acda-f12577f49494 | Vale
```

## Recommended cleanup sequence

Do not delete or rotate silently. Run this as a separate maintenance task with a DB backup and before/after evidence.

1. Stop or quiesce Mission Control writes.
2. Backup the database and WAL files:
   ```bash
   cd /Users/lilly/clawd/projects/mission-control
   sqlite3 mission-control.db 'PRAGMA wal_checkpoint(TRUNCATE);'
   cp mission-control.db "mission-control.db.backup-fk-cleanup-$(date +%Y%m%d-%H%M%S)"
   ```
3. Export orphan rows for audit before deletion:
   ```bash
   sqlite3 -header -csv mission-control.db \
     "SELECT a.* FROM task_activities a LEFT JOIN tasks t ON t.id=a.task_id WHERE t.id IS NULL" \
     > /Users/lilly/clawd/logs/mc-orphan-task-activities-$(date +%Y%m%d-%H%M%S).csv

   sqlite3 -header -csv mission-control.db \
     "SELECT d.* FROM task_deliverables d LEFT JOIN tasks t ON t.id=d.task_id WHERE t.id IS NULL" \
     > /Users/lilly/clawd/logs/mc-orphan-task-deliverables-$(date +%Y%m%d-%H%M%S).csv
   ```
4. Delete only rows whose parent task is missing:
   ```sql
   DELETE FROM task_activities
   WHERE task_id NOT IN (SELECT id FROM tasks);

   DELETE FROM task_deliverables
   WHERE task_id NOT IN (SELECT id FROM tasks);
   ```
5. Verify cleanup:
   ```sql
   PRAGMA foreign_key_check;
   SELECT COUNT(*) FROM task_activities a LEFT JOIN tasks t ON t.id=a.task_id WHERE t.id IS NULL;
   SELECT COUNT(*) FROM task_deliverables d LEFT JOIN tasks t ON t.id=d.task_id WHERE t.id IS NULL;
   ```
6. Rotate logs only after the write-route fix has been deployed and the stale-FK requests return structured 400s:
   ```bash
   ts=$(date +%Y%m%d-%H%M%S)
   mv /Users/lilly/clawd/logs/mc-error.log /Users/lilly/clawd/logs/mc-error.log.$ts
   mv /Users/lilly/clawd/logs/mc.log /Users/lilly/clawd/logs/mc.log.$ts
   touch /Users/lilly/clawd/logs/mc-error.log /Users/lilly/clawd/logs/mc.log
   ```
7. Restart Mission Control and verify no new `SQLITE_CONSTRAINT_FOREIGNKEY` bursts appear after valid and invalid write smoke tests.

## Source-path follow-up

Workspace search found no live source file containing `157ff0f3-c11e-46ec-b31a-1ff31c0e75bf`; it appears only in logs and Archie's memory note. Current helper mappings in `/Users/lilly/clawd/tools/mc-dispatch.sh` and `/Users/lilly/clawd/tools/polly-dispatch.sh` already use the current Vale id. The likely root cause is a stale manual/caller cache used during the monster-battler planning flow. The route-level FK validation now turns any repeat into a structured 400 instead of log-spamming SQLite failures.
