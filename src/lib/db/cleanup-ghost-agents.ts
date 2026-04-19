/**
 * One-shot cleanup for "ghost" agents left over from pre-fix convoy runs.
 *
 * A ghost is an agent row with no gateway_agent_id AND no session_key_prefix.
 * Before the convoy duplication fix, every planning run inserted a fresh set
 * of these for Builder/Tester/Reviewer/Learner even when real gateway agents
 * already covered those roles. This script merges each ghost into the live
 * agent sharing its role (preferring gateway-linked) and re-points any task
 * assignments so no work is lost.
 *
 * Usage:
 *   cp mission-control.db mission-control.db.bak
 *   npx tsx src/lib/db/cleanup-ghost-agents.ts           # dry-run
 *   npx tsx src/lib/db/cleanup-ghost-agents.ts --apply   # execute
 *
 * Safe to run repeatedly; it's a no-op once no ghosts remain.
 */
import { getDb, closeDb } from './index';

interface AgentRow {
  id: string;
  name: string;
  role: string | null;
  workspace_id: string;
  gateway_agent_id: string | null;
  session_key_prefix: string | null;
}

interface MergePlan {
  ghost: AgentRow;
  keeper: AgentRow;
  taskReassignments: number;
}

function findKeeperForGhost(
  db: ReturnType<typeof getDb>,
  ghost: AgentRow,
): AgentRow | null {
  if (!ghost.role) return null;

  const exact = db.prepare(
    `SELECT id, name, role, workspace_id, gateway_agent_id, session_key_prefix
     FROM agents
     WHERE id != ?
       AND workspace_id = ?
       AND LOWER(role) = LOWER(?)
       AND (gateway_agent_id IS NOT NULL OR session_key_prefix IS NOT NULL)
     ORDER BY gateway_agent_id IS NOT NULL DESC, updated_at DESC
     LIMIT 1`,
  ).get(ghost.id, ghost.workspace_id, ghost.role) as AgentRow | undefined;

  if (exact) return exact;

  const fuzzy = db.prepare(
    `SELECT id, name, role, workspace_id, gateway_agent_id, session_key_prefix
     FROM agents
     WHERE id != ?
       AND workspace_id = ?
       AND (LOWER(role) LIKE '%' || LOWER(?) || '%' OR LOWER(?) LIKE '%' || LOWER(role) || '%')
       AND (gateway_agent_id IS NOT NULL OR session_key_prefix IS NOT NULL)
     ORDER BY gateway_agent_id IS NOT NULL DESC, updated_at DESC
     LIMIT 1`,
  ).get(ghost.id, ghost.workspace_id, ghost.role, ghost.role) as AgentRow | undefined;

  return fuzzy ?? null;
}

function main() {
  const apply = process.argv.includes('--apply');
  const db = getDb();

  const ghosts = db.prepare(
    `SELECT id, name, role, workspace_id, gateway_agent_id, session_key_prefix
     FROM agents
     WHERE gateway_agent_id IS NULL AND session_key_prefix IS NULL AND is_master = 0`,
  ).all() as AgentRow[];

  if (ghosts.length === 0) {
    console.log('✅ No ghost agents found. Nothing to do.');
    closeDb();
    return;
  }

  console.log(`Found ${ghosts.length} ghost agent(s):`);
  for (const g of ghosts) {
    console.log(`  - ${g.name} (${g.id}) role=${g.role ?? '<none>'} workspace=${g.workspace_id}`);
  }
  console.log('');

  const plans: MergePlan[] = [];
  const orphans: AgentRow[] = [];

  const countTasks = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE assigned_agent_id = ?');

  for (const ghost of ghosts) {
    const keeper = findKeeperForGhost(db, ghost);
    if (!keeper) {
      orphans.push(ghost);
      continue;
    }
    const taskReassignments = (countTasks.get(ghost.id) as { n: number }).n;
    plans.push({ ghost, keeper, taskReassignments });
  }

  console.log(`Planned merges: ${plans.length}`);
  for (const { ghost, keeper, taskReassignments } of plans) {
    console.log(
      `  ${ghost.name} (${ghost.id}) → ${keeper.name} (${keeper.id})  [${taskReassignments} task(s) to re-point]`,
    );
  }
  if (orphans.length > 0) {
    console.log('');
    console.log(`Orphans (no matching gateway-linked agent for role — left in place):`);
    for (const o of orphans) {
      console.log(`  - ${o.name} (${o.id}) role=${o.role ?? '<none>'}`);
    }
  }

  if (!apply) {
    console.log('');
    console.log('Dry run complete. Re-run with --apply to execute.');
    closeDb();
    return;
  }

  const tx = db.transaction((ps: MergePlan[]) => {
    const reassign = db.prepare(
      `UPDATE tasks SET assigned_agent_id = ?, updated_at = datetime('now') WHERE assigned_agent_id = ?`,
    );
    const reassignRoles = db.prepare(
      `UPDATE task_roles SET agent_id = ? WHERE agent_id = ?`,
    );
    const del = db.prepare(`DELETE FROM agents WHERE id = ?`);
    for (const { ghost, keeper } of ps) {
      reassign.run(keeper.id, ghost.id);
      try { reassignRoles.run(keeper.id, ghost.id); } catch { /* table may not exist in older DBs */ }
      del.run(ghost.id);
    }
  });

  tx(plans);
  console.log('');
  console.log(`✅ Merged ${plans.length} ghost agent(s). ${orphans.length} orphan(s) left in place.`);
  closeDb();
}

main();
