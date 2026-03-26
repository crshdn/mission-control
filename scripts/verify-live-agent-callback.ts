import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { assert, loadLocalEnv, request, waitFor } from './_shared';
import { getOpenClawClient } from '../src/lib/openclaw/client';
import { buildAgentSessionKey } from '../src/lib/openclaw/routing';

type DbAgent = {
  id: string;
  name: string;
  role: string;
  is_master: number;
  session_key_prefix?: string | null;
  has_active_session: number;
};

type DbSession = {
  id: string;
  agent_id: string;
  openclaw_session_id: string;
  status: string;
};

type DbActivity = {
  id: string;
  agent_id: string | null;
  activity_type: string;
  message: string;
  metadata: string | null;
  created_at: string;
};

type DbDeliverable = {
  id: string;
  path: string;
  title: string;
  created_at: string;
};

type DbTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  status_reason: string | null;
  assigned_agent_id: string | null;
  workspace_path: string | null;
  updated_at: string;
};

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const { missionControlUrl } = loadLocalEnv(repoRoot);
  const baseUrl = missionControlUrl;
  const dbPath = path.join(repoRoot, process.env.DATABASE_PATH || 'mission-control.db');
  const db = new Database(dbPath, { readonly: false });
  let client: ReturnType<typeof getOpenClawClient> | null = null;

  assert(process.env.MC_API_TOKEN, 'MC_API_TOKEN is required to prove authenticated live callbacks');

  try {
    const existingTaskId = process.env.LIVE_CALLBACK_TASK_ID?.trim() || '';
    let builder: DbAgent | undefined;
    let nonce = `live-callback-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    let taskId = existingTaskId;
    let taskTitle = '';
    let dispatchedTask: { status?: string; workspace_path?: string | null } = {};

    if (existingTaskId) {
      const existingTask = db.prepare(
        `SELECT id, title, description, status, status_reason, assigned_agent_id, workspace_path, updated_at
         FROM tasks
         WHERE id = ?`
      ).get(existingTaskId) as DbTask | undefined;
      assert(existingTask?.id, `Existing callback proof task not found: ${existingTaskId}`);
      assert(existingTask.assigned_agent_id, `Existing callback proof task has no assigned agent: ${existingTaskId}`);

      builder = db.prepare(
        `SELECT
           a.id,
           a.name,
           a.role,
           a.is_master,
           a.session_key_prefix,
           EXISTS(
             SELECT 1
             FROM openclaw_sessions os
             WHERE os.agent_id = a.id
               AND os.status = 'active'
               AND os.ended_at IS NULL
           ) AS has_active_session
         FROM agents a
         WHERE a.id = ?`
      ).get(existingTask.assigned_agent_id) as DbAgent | undefined;
      assert(builder?.id, `Assigned agent not found for existing callback proof task: ${existingTask.assigned_agent_id}`);

      const inferredNonce = existingTask.status_reason
        || existingTask.title.match(/(?:callback-proof|live-callback)-[a-z0-9-]+/i)?.[0]
        || existingTask.description?.match(/(?:callback-proof|live-callback)-[a-z0-9-]+/i)?.[0];
      assert(inferredNonce, `Could not infer callback nonce from existing task ${existingTaskId}`);

      nonce = inferredNonce;
      taskTitle = existingTask.title;
      dispatchedTask = {
        status: existingTask.status,
        workspace_path: existingTask.workspace_path,
      };
    } else {
      builder = db.prepare(
        `SELECT
           a.id,
           a.name,
           a.role,
           a.is_master,
           a.session_key_prefix,
           EXISTS(
             SELECT 1
             FROM openclaw_sessions os
             LEFT JOIN tasks t ON t.id = os.task_id
             WHERE os.agent_id = a.id
               AND os.status = 'active'
               AND os.ended_at IS NULL
               AND (os.task_id IS NULL OR COALESCE(t.status, '') != 'done')
           ) AS has_active_session
         FROM agents a
         WHERE a.workspace_id = 'default'
           AND a.role = 'builder'
           AND (COALESCE(a.session_key_prefix, '') != '' OR a.is_master = 1)
         ORDER BY has_active_session ASC, a.created_at ASC
         LIMIT 1`
      ).get() as DbAgent | undefined;
      assert(builder?.id, 'Could not find a routable builder agent in the default workspace');

      const task = await request(baseUrl, '/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: `Live callback proof ${nonce}`,
          description: [
            'This is a disposable runtime verification task.',
            'Create a tiny proof file in the task output directory, register it as a deliverable, log completion, and mark the task done.',
            'This task exists only to prove that the live agent runtime can authenticate callback requests back into Mission Control.',
            `Verification nonce: ${nonce}`,
          ].join('\n'),
          workspace_id: 'default',
          assigned_agent_id: builder.id,
          priority: 'normal',
        }),
      });

      taskId = task.id as string;
      assert(taskId, 'Task creation did not return an id');
      taskTitle = task.title as string;

      await request(baseUrl, `/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'assigned',
          assigned_agent_id: builder.id,
        }),
      });

      dispatchedTask = await waitFor(
        `task ${taskId} dispatch`,
        () => request(baseUrl, `/api/tasks/${taskId}`),
        (currentTask: any) => currentTask?.status === 'in_progress' || currentTask?.status === 'done',
        120_000,
        1_500,
      );
    }
    assert(builder?.id, 'Builder selection failed');

    const session = await waitFor(
      `task ${taskId} session link`,
      async () =>
        db.prepare(
          `SELECT id, agent_id, openclaw_session_id, status
           FROM openclaw_sessions
           WHERE task_id = ?
             AND status = 'active'
             AND ended_at IS NULL
           ORDER BY updated_at DESC
           LIMIT 1`
        ).get(taskId) as DbSession | undefined,
      (row) => Boolean(row?.id),
      120_000,
      1_000,
    );
    if (!session?.openclaw_session_id) {
      throw new Error(`No active session linked to task ${taskId}`);
    }
    const activeSession = session;

    client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    const sessionKey = buildAgentSessionKey(
      {
        id: builder.id,
        name: builder.name,
        is_master: Boolean(builder.is_master),
        session_key_prefix: builder.session_key_prefix ?? undefined,
      },
      activeSession.openclaw_session_id,
      { context: 'live-callback-proof' },
    );

    const dispatchPayload = await waitFor(
      `dispatch payload for ${taskId}`,
      async () => {
        const history = await client!.call<{
          messages: Array<{ role?: string; content?: unknown }>;
        }>('chat.history', {
          sessionKey,
          limit: 50,
        });

        const latestUserMessage = [...(history.messages || [])]
          .reverse()
          .find((message) => message.role === 'user' && extractText(message.content).includes(taskId));

        return latestUserMessage ? extractText(latestUserMessage.content) : '';
      },
      (message) => message.includes(taskId) && message.includes('MC_API_TOKEN'),
      120_000,
      1_500,
    );

    const proofFilename = `${nonce}.txt`;
    if (!existingTaskId) {
      const chatInstruction = [
        `Runtime verification exercise for nonce ${nonce}.`,
        'Do not change application code beyond the proof artifact needed for this callback test.',
        `1. In the assigned output directory, create a file named ${proofFilename} whose contents are exactly: LIVE_CALLBACK_PROOF::${nonce}`,
        '2. Verify MC_API_TOKEN exists in your runtime before calling Mission Control APIs.',
        `3. Register that file as a deliverable for task ${taskId}.`,
        `4. Log exactly one completed activity for task ${taskId} with message LIVE_CALLBACK_PROOF::${nonce}, your agent_id ${builder.id}, and metadata {"proof":"live_agent_callback","nonce":"${nonce}"}.`,
        `5. Update the task status to done with status_reason ${nonce}.`,
        `6. Reply with exactly CALLBACK_PROOF_DONE::${nonce} after the API calls succeed.`,
        `If any callback step fails, reply with CALLBACK_PROOF_FAIL::${nonce}::<reason> and stop.`,
      ].join('\n');

      await request(baseUrl, `/api/tasks/${taskId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: chatInstruction }),
      });
    }

    const assistantReply = await waitFor(
      `agent reply for ${taskId}`,
      async () => {
        const history = await client!.call<{
          messages: Array<{ role?: string; content?: unknown }>;
        }>('chat.history', {
          sessionKey,
          limit: 100,
        });

        const latestAssistant = [...(history.messages || [])]
          .reverse()
          .find((message) => message.role === 'assistant' && extractText(message.content).includes(nonce));

        return latestAssistant ? extractText(latestAssistant.content) : '';
      },
      (message) =>
        message.includes(`CALLBACK_PROOF_DONE::${nonce}`) ||
        message.includes(`CALLBACK_PROOF_FAIL::${nonce}`) ||
        message.includes(`TASK_COMPLETE: ${nonce}`),
      180_000,
      2_000,
    );

    assert(
      assistantReply.includes(`CALLBACK_PROOF_DONE::${nonce}`) ||
        assistantReply.includes(`TASK_COMPLETE: ${nonce}`),
      `Agent reported callback failure: ${assistantReply}`,
    );

    const activity = await waitFor(
      `callback activity for ${taskId}`,
      async () =>
        db.prepare(
          `SELECT id, agent_id, activity_type, message, metadata, created_at
           FROM task_activities
           WHERE task_id = ?
             AND message IN (?, ?)
           ORDER BY created_at DESC
           LIMIT 1`
        ).get(taskId, `LIVE_CALLBACK_PROOF::${nonce}`, nonce) as DbActivity | undefined,
      (row) => Boolean(row?.id),
      120_000,
      1_500,
    );
    if (!activity?.id) {
      throw new Error(`Expected callback activity for task ${taskId}`);
    }
    const callbackActivity = activity;

    const activityAgentMatchedBuilder = callbackActivity.agent_id === builder.id;
    const activityMissingAgentId = callbackActivity.agent_id == null;
    assert(
      activityAgentMatchedBuilder || activityMissingAgentId,
      `Expected callback activity agent_id ${builder.id} or null, got ${callbackActivity.agent_id}`,
    );

    const deliverable = await waitFor(
      `callback deliverable for ${taskId}`,
      async () =>
        db.prepare(
          `SELECT id, path, title, created_at
           FROM task_deliverables
           WHERE task_id = ?
             AND (title = ? OR path LIKE ?)
           ORDER BY created_at DESC
           LIMIT 1`
        ).get(taskId, proofFilename, `%${proofFilename}`) as DbDeliverable | undefined,
      (row) => Boolean(row?.id),
      120_000,
      1_500,
    );
    if (!deliverable?.path) {
      throw new Error(`Expected callback deliverable with a path for task ${taskId}`);
    }
    const callbackDeliverable = deliverable;

    const updatedTask = await waitFor(
      `task ${taskId} done status`,
      () => request(baseUrl, `/api/tasks/${taskId}`),
      (currentTask: any) => currentTask?.status === 'done' && currentTask?.status_reason === nonce,
      120_000,
      1_500,
    );

    assert(fs.existsSync(callbackDeliverable.path), `Expected deliverable file to exist at ${callbackDeliverable.path}`);
    const deliverableContents = fs.readFileSync(callbackDeliverable.path, 'utf-8').trim();
    assert(
      deliverableContents === `LIVE_CALLBACK_PROOF::${nonce}` || deliverableContents === nonce,
      `Unexpected deliverable contents: ${deliverableContents}`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          nonce,
          missionControlUrl: baseUrl,
          task: {
            id: taskId,
            title: taskTitle,
            initialStatusAfterDispatch: dispatchedTask.status,
            finalStatus: updatedTask.status,
            finalStatusReason: updatedTask.status_reason || null,
            workspacePath: updatedTask.workspace_path || dispatchedTask.workspace_path || null,
          },
          builder: {
            id: builder.id,
            name: builder.name,
            sessionKey,
            openclawSessionId: activeSession.openclaw_session_id,
          },
          evidence: {
            dispatchIncludedCallbackInstructions: dispatchPayload.includes('MC_API_TOKEN') &&
              dispatchPayload.includes(`/api/tasks/${taskId}/activities`) &&
              dispatchPayload.includes(`/api/tasks/${taskId}`),
            assistantReply,
            activity: callbackActivity,
            activityAgentMatchedBuilder,
            activityMissingAgentId,
            deliverable: callbackDeliverable,
            deliverableContents,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    client?.disconnect();
    db.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[live-agent-callback] failed:', error);
    process.exit(1);
  });
