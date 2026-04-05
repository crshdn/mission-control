import { logger } from '@/lib/logger';
import { queryAll, run } from '@/lib/db';
import { emitAutopilotActivity } from './activity';
import type { ResearchCycle, IdeationCycle } from '@/lib/types';

const MAX_RETRIES = 2;
const HEARTBEAT_STALE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Recover orphaned autopilot cycles on startup.
 * Called after migrations run in db/index.ts.
 */
export async function recoverOrphanedCycles(): Promise<void> {
  await recoverResearchCycles();
  await recoverIdeationCycles();
}

async function recoverResearchCycles(): Promise<void> {
  const orphaned = queryAll<ResearchCycle>(
    `SELECT * FROM research_cycles WHERE status = 'running'`
  );

  if (orphaned.length === 0) return;
  logger.info(`[Recovery] Found ${orphaned.length} orphaned research cycle(s)`);

  for (const cycle of orphaned) {
    const retryCount = cycle.retry_count || 0;

    // Check if exceeded max retries
    if (retryCount >= MAX_RETRIES) {
      markInterrupted('research_cycles', cycle.id, cycle.product_id, 'research', 'Max retries exceeded');
      continue;
    }

    // Check if heartbeat is stale
    if (cycle.last_heartbeat) {
      const heartbeatAge = Date.now() - new Date(cycle.last_heartbeat).getTime();
      if (heartbeatAge > HEARTBEAT_STALE_MS) {
        markInterrupted('research_cycles', cycle.id, cycle.product_id, 'research', 'Heartbeat stale (>10min)');
        continue;
      }
    }

    const phase = cycle.current_phase || 'init';

    if (phase === 'report_received') {
      // Final DB writes — try to complete from phase_data
      try {
        const phaseData = cycle.phase_data ? JSON.parse(cycle.phase_data) : null;
        if (phaseData?.report) {
          run(
            `UPDATE research_cycles SET status = 'completed', report = ?, completed_at = ?, current_phase = 'completed' WHERE id = ?`,
            [JSON.stringify(phaseData.report), new Date().toISOString(), cycle.id]
          );
          emitAutopilotActivity({
            productId: cycle.product_id,
            cycleId: cycle.id,
            cycleType: 'research',
            eventType: 'recovery_completed',
            message: 'Research cycle recovered and completed from saved report',
          });
          logger.info(`[Recovery] Completed research cycle ${cycle.id} from phase_data`);
          continue;
        }
      } catch {
        // Fall through to re-queue
      }
    }

    // Re-queue from scratch for init, llm_submitted, llm_polling
    run(
      `UPDATE research_cycles SET retry_count = ?, current_phase = 'init', phase_data = NULL, session_key = NULL WHERE id = ?`,
      [retryCount + 1, cycle.id]
    );
    emitAutopilotActivity({
      productId: cycle.product_id,
      cycleId: cycle.id,
      cycleType: 'research',
      eventType: 'recovery_requeued',
      message: `Research cycle re-queued (retry ${retryCount + 1}/${MAX_RETRIES})`,
    });
    logger.info(`[Recovery] Re-queuing research cycle ${cycle.id} (retry ${retryCount + 1})`);

    // Dynamically import to avoid circular deps and actually re-run
    const { runResearchCycle } = await import('./research');
    runResearchCycle(cycle.product_id, cycle.id).catch(err =>
      logger.error(`[Recovery] Failed to re-run research cycle ${cycle.id}:`, err)
    );
  }
}

async function recoverIdeationCycles(): Promise<void> {
  const orphaned = queryAll<IdeationCycle>(
    `SELECT * FROM ideation_cycles WHERE status = 'running'`
  );

  if (orphaned.length === 0) return;
  logger.info(`[Recovery] Found ${orphaned.length} orphaned ideation cycle(s)`);

  for (const cycle of orphaned) {
    const retryCount = cycle.retry_count || 0;

    if (retryCount >= MAX_RETRIES) {
      markInterrupted('ideation_cycles', cycle.id, cycle.product_id, 'ideation', 'Max retries exceeded');
      continue;
    }

    if (cycle.last_heartbeat) {
      const heartbeatAge = Date.now() - new Date(cycle.last_heartbeat).getTime();
      if (heartbeatAge > HEARTBEAT_STALE_MS) {
        markInterrupted('ideation_cycles', cycle.id, cycle.product_id, 'ideation', 'Heartbeat stale (>10min)');
        continue;
      }
    }

    const phase = cycle.current_phase || 'init';

    if (phase === 'ideas_stored') {
      // Final step — just mark completed
      run(
        `UPDATE ideation_cycles SET status = 'completed', completed_at = ?, current_phase = 'completed' WHERE id = ?`,
        [new Date().toISOString(), cycle.id]
      );
      emitAutopilotActivity({
        productId: cycle.product_id,
        cycleId: cycle.id,
        cycleType: 'ideation',
        eventType: 'recovery_completed',
        message: 'Ideation cycle recovered and completed from stored ideas',
      });
      logger.info(`[Recovery] Completed ideation cycle ${cycle.id} from ideas_stored phase`);
      continue;
    }

    if (phase === 'ideas_parsed') {
      // Try to store ideas from phase_data
      try {
        const phaseData = cycle.phase_data ? JSON.parse(cycle.phase_data) : null;
        if (phaseData?.ideas && Array.isArray(phaseData.ideas)) {
          const { storeIdeasFromPhaseData } = await import('./ideation');
          await storeIdeasFromPhaseData(cycle.id, cycle.product_id, cycle.research_cycle_id || null, phaseData.ideas);
          logger.info(`[Recovery] Stored ideas for ideation cycle ${cycle.id} from phase_data`);
          continue;
        }
      } catch {
        // Fall through to re-queue
      }
    }

    // Re-queue
    run(
      `UPDATE ideation_cycles SET retry_count = ?, current_phase = 'init', phase_data = NULL, session_key = NULL WHERE id = ?`,
      [retryCount + 1, cycle.id]
    );
    emitAutopilotActivity({
      productId: cycle.product_id,
      cycleId: cycle.id,
      cycleType: 'ideation',
      eventType: 'recovery_requeued',
      message: `Ideation cycle re-queued (retry ${retryCount + 1}/${MAX_RETRIES})`,
    });
    logger.info(`[Recovery] Re-queuing ideation cycle ${cycle.id} (retry ${retryCount + 1})`);

    const { runIdeationCycle } = await import('./ideation');
    runIdeationCycle(cycle.product_id, cycle.research_cycle_id || undefined, cycle.id).catch(err =>
      logger.error(`[Recovery] Failed to re-run ideation cycle ${cycle.id}:`, err)
    );
  }
}

function markInterrupted(
  table: string,
  cycleId: string,
  productId: string,
  cycleType: 'research' | 'ideation',
  reason: string
): void {
  run(
    `UPDATE ${table} SET status = 'interrupted', error_message = ?, completed_at = ? WHERE id = ?`,
    [reason, new Date().toISOString(), cycleId]
  );
  emitAutopilotActivity({
    productId,
    cycleId,
    cycleType,
    eventType: 'recovery_interrupted',
    message: `Cycle marked interrupted: ${reason}`,
  });
  logger.info(`[Recovery] Marked ${cycleType} cycle ${cycleId} as interrupted: ${reason}`);
}
