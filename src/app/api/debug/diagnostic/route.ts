import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import {
  isDebugCollectionEnabled,
  setDebugCollectionEnabled,
  logDebugEvent,
} from '@/lib/debug-log';
import { syncGatewayAgentsToCatalog } from '@/lib/agent-catalog-sync';
import { getMissionControlUrl } from '@/lib/config';
import type { Agent, Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface DiagnosticStep {
  name: string;
  ok: boolean;
  detail?: string;
  duration_ms?: number;
  data?: Record<string, unknown>;
}

/**
 * POST /api/debug/diagnostic
 *
 * Preset end-to-end test to surface where the MC ↔ agent pipeline is
 * failing. Runs the real dispatch flow against the gateway-synced
 * "coordinator" agent so every instrumented surface (gateway.list_agents,
 * session.create, chat.send) fires — the resulting events appear on
 * `/debug` for inspection. Also emits `diagnostic.step` events so the
 * progress of the test itself is visible alongside the traffic it triggers.
 *
 * Each step is attempted even if the previous one returned a soft warning;
 * the endpoint only short-circuits on hard blockers (e.g. no coordinator
 * found, task create failed).
 */
export async function POST() {
  const runId = uuidv4();
  const steps: DiagnosticStep[] = [];

  const record = (step: DiagnosticStep) => {
    steps.push(step);
    logDebugEvent({
      type: 'diagnostic.step',
      direction: 'internal',
      metadata: {
        run_id: runId,
        step: step.name,
        ok: step.ok,
        detail: step.detail,
        ...step.data,
      },
      durationMs: step.duration_ms,
      error: step.ok ? null : step.detail ?? null,
    });
  };

  try {
    // Step 1: Ensure debug collection is enabled. Everything downstream
    // depends on this — without it, logDebugEvent() becomes a no-op and
    // the operator sees an empty /debug feed.
    const wasEnabled = isDebugCollectionEnabled();
    if (!wasEnabled) {
      setDebugCollectionEnabled(true);
      broadcast({
        type: 'debug_collection_toggled',
        payload: { collection_enabled: true },
      });
    }
    record({
      name: 'enable_collection',
      ok: true,
      detail: wasEnabled ? 'already_enabled' : 'enabled_now',
    });

    // Step 2: Force-sync the gateway catalog. This also exercises the
    // gateway WebSocket and logs `gateway.list_agents` — a common failure
    // point (gateway down, auth misconfigured).
    const syncStart = Date.now();
    try {
      const changed = await syncGatewayAgentsToCatalog({
        force: true,
        reason: 'diagnostic',
      });
      record({
        name: 'gateway_sync',
        ok: true,
        duration_ms: Date.now() - syncStart,
        detail: `synced ${changed} agent(s)`,
        data: { changed },
      });
    } catch (err) {
      record({
        name: 'gateway_sync',
        ok: false,
        duration_ms: Date.now() - syncStart,
        detail: (err as Error).message,
      });
      return NextResponse.json(
        {
          run_id: runId,
          ok: false,
          steps,
          error: 'Gateway sync failed — OpenClaw unreachable or auth misconfigured',
        },
        { status: 502 }
      );
    }

    // Step 3: Locate the coordinator agent. Prefer a gateway-synced one so
    // we're actually talking to OpenClaw, not a local stub.
    const coordinator = queryOne<Agent>(
      `SELECT * FROM agents
       WHERE role = 'coordinator'
       ORDER BY (gateway_agent_id IS NOT NULL) DESC, updated_at DESC
       LIMIT 1`
    );
    if (!coordinator) {
      record({
        name: 'find_coordinator',
        ok: false,
        detail: 'No agent with role=coordinator found',
      });
      return NextResponse.json(
        {
          run_id: runId,
          ok: false,
          steps,
          error: 'No coordinator agent available. Import one from the Gateway first.',
        },
        { status: 404 }
      );
    }
    record({
      name: 'find_coordinator',
      ok: true,
      detail: coordinator.name,
      data: {
        agent_id: coordinator.id,
        source: (coordinator as Agent & { source?: string }).source ?? null,
        gateway_agent_id: (coordinator as Agent & { gateway_agent_id?: string }).gateway_agent_id ?? null,
      },
    });

    // Step 4: Create a trivial test task assigned to coordinator. Keep the
    // title stable-but-unique so the dispatch workspace dir doesn't collide
    // across runs, and the task is easy to spot in the queue.
    const taskId = uuidv4();
    const now = new Date().toISOString();
    const shortRun = runId.slice(0, 8);
    const title = `Diagnostic ping ${shortRun}`;
    const description =
      'End-to-end debug test. Please reply with a single line: "pong from <your-name>". No files, no git, just a chat reply.';

    run(
      `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at)
       VALUES (?, ?, ?, 'assigned', 'normal', ?, 'default', 'default', ?, ?)`,
      [taskId, title, description, coordinator.id, now, now]
    );
    record({
      name: 'create_task',
      ok: true,
      detail: title,
      data: { task_id: taskId },
    });

    const createdTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (createdTask) {
      broadcast({ type: 'task_created', payload: createdTask });
    }

    // Step 5: Dispatch via HTTP so the task goes through the real pipeline
    // (workspace isolation, catalog sync, chat.send logging). The dispatch
    // route emits its own debug events — we just report the HTTP result.
    const dispatchStart = Date.now();
    const dispatchUrl = `${getMissionControlUrl()}/api/tasks/${taskId}/dispatch`;
    let dispatchOk = false;
    let dispatchDetail = '';
    let dispatchData: Record<string, unknown> = {};
    try {
      // Same-origin server-side fetch has no Origin/Referer, so the
      // middleware rejects it when MC_API_TOKEN is set. Pass the token
      // explicitly; in dev (no token) this header is ignored.
      const headers: Record<string, string> = {};
      if (process.env.MC_API_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.MC_API_TOKEN}`;
      }
      const res = await fetch(dispatchUrl, { method: 'POST', headers });
      const body = await res.json().catch(() => ({}));
      dispatchOk = res.ok;
      dispatchDetail = res.ok
        ? 'Task delivered to coordinator — watch the event stream for chat.send and the agent response'
        : body?.error || `HTTP ${res.status}`;
      dispatchData = { http_status: res.status, response: body };
    } catch (err) {
      dispatchDetail = (err as Error).message;
      dispatchData = { fetch_error: dispatchDetail };
    }
    record({
      name: 'dispatch',
      ok: dispatchOk,
      duration_ms: Date.now() - dispatchStart,
      detail: dispatchDetail,
      data: dispatchData,
    });

    return NextResponse.json({
      run_id: runId,
      ok: dispatchOk,
      task_id: taskId,
      agent_id: coordinator.id,
      agent_name: coordinator.name,
      steps,
      hint: dispatchOk
        ? 'Test task dispatched. If no chat.response appears within ~30s, the agent is reachable but not replying — check session logs.'
        : 'Dispatch failed. See the step above for details.',
    });
  } catch (error) {
    record({
      name: 'unhandled',
      ok: false,
      detail: (error as Error).message,
    });
    console.error('[POST /api/debug/diagnostic] failed:', error);
    return NextResponse.json(
      { run_id: runId, ok: false, steps, error: (error as Error).message },
      { status: 500 }
    );
  }
}
