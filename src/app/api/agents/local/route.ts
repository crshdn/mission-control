import { NextResponse } from 'next/server';
import { queryAll, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/agents/local — wipe every agent that was NOT synced from the
 * OpenClaw Gateway (i.e. gateway_agent_id IS NULL). Used as a reset step
 * when the local catalog drifts or accumulates manual test agents. Only
 * affects rows in the Mission Control DB — the Gateway itself is untouched.
 *
 * Cleans up FK-referencing rows in the same transaction so the FK pragma
 * doesn't block the delete.
 */
export async function DELETE() {
  try {
    const targets = queryAll<{ id: string; name: string }>(
      `SELECT id, name FROM agents WHERE gateway_agent_id IS NULL`
    );

    if (targets.length === 0) {
      return NextResponse.json({ deleted: 0, agents: [] });
    }

    const ids = targets.map((t) => t.id);
    const placeholders = ids.map(() => '?').join(',');

    transaction(() => {
      // Required (NOT NULL) FK refs — delete dependent rows outright.
      run(`DELETE FROM task_roles WHERE agent_id IN (${placeholders})`, ids);
      run(`DELETE FROM work_checkpoints WHERE agent_id IN (${placeholders})`, ids);
      run(
        `DELETE FROM convoy_messages WHERE from_agent_id IN (${placeholders}) OR to_agent_id IN (${placeholders})`,
        [...ids, ...ids]
      );

      // Nullable FK refs — set to NULL so history is retained but no longer
      // points at a ghost agent.
      run(`UPDATE tasks SET assigned_agent_id = NULL WHERE assigned_agent_id IN (${placeholders})`, ids);
      run(`UPDATE tasks SET created_by_agent_id = NULL WHERE created_by_agent_id IN (${placeholders})`, ids);
      run(`UPDATE events SET agent_id = NULL WHERE agent_id IN (${placeholders})`, ids);
      run(`UPDATE openclaw_sessions SET agent_id = NULL WHERE agent_id IN (${placeholders})`, ids);
      run(`UPDATE task_activities SET agent_id = NULL WHERE agent_id IN (${placeholders})`, ids);
      run(`UPDATE knowledge_entries SET created_by_agent_id = NULL WHERE created_by_agent_id IN (${placeholders})`, ids);
      run(`UPDATE cost_events SET agent_id = NULL WHERE agent_id IN (${placeholders})`, ids);
      run(`UPDATE conversation_messages SET sender_agent_id = NULL WHERE sender_agent_id IN (${placeholders})`, ids);

      // Some columns are declared in the schema but may not exist in every
      // running DB (migrations are additive). Guard with try/catch so a
      // missing table doesn't abort the whole clear.
      try { run(`UPDATE content_pieces SET agent_id = NULL WHERE agent_id IN (${placeholders})`, ids); } catch {}
      try { run(`UPDATE audit_log SET agent_id = NULL WHERE agent_id IN (${placeholders})`, ids); } catch {}
      try { run(`UPDATE product_skills SET created_by_agent_id = NULL WHERE created_by_agent_id IN (${placeholders})`, ids); } catch {}

      // agent_health has ON DELETE CASCADE — handled automatically below.
      run(`DELETE FROM agents WHERE id IN (${placeholders})`, ids);
    });

    broadcast({
      type: 'agents_cleared',
      payload: { count: targets.length, scope: 'local' },
    });

    return NextResponse.json({ deleted: targets.length, agents: targets });
  } catch (error) {
    console.error('[DELETE /api/agents/local] failed:', error);
    return NextResponse.json(
      { error: `Failed to clear local agents: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
