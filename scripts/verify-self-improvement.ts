import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { assert, ensureDir, loadLocalEnv, request, waitFor } from './_shared';
import { getOpenClawClient } from '../src/lib/openclaw/client';
import { buildAgentSessionKey } from '../src/lib/openclaw/routing';

type DbAgent = {
  id: string;
  name: string;
  role: string;
  is_master: number;
  session_key_prefix?: string | null;
};

type DbSession = {
  id: string;
  agent_id: string;
  openclaw_session_id: string;
  status: string;
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
  const { missionControlUrl, projectsPath } = loadLocalEnv(repoRoot);
  const baseUrl = missionControlUrl;
  const dbPath = path.join(repoRoot, process.env.DATABASE_PATH || 'mission-control.db');
  const db = new Database(dbPath, { readonly: false });
  let client: ReturnType<typeof getOpenClawClient> | null = null;

  try {
    const product = await request(baseUrl, '/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Self Improvement Validation ${new Date().toISOString()}`,
        description: 'Validates learner knowledge capture and skill extraction/injection/reporting.',
        product_program: [
          '# Product Program',
          'Favor tiny deterministic edits for validation.',
          'We want reusable procedures and durable lessons from each completed task.',
        ].join('\n'),
        build_mode: 'plan_first',
        workspace_id: 'default',
      }),
    });
    const productId = product.id as string;
    assert(productId, 'Product creation did not return an id');

    const builder = db.prepare(
      `SELECT id, name, role, is_master, session_key_prefix
       FROM agents
       WHERE workspace_id = 'default' AND role = 'builder'
       ORDER BY created_at ASC
       LIMIT 1`
    ).get() as DbAgent | undefined;
    assert(builder?.id, 'Could not find a builder agent in the default workspace');

    const createTask = async (title: string, description: string) => {
      const created = await request(baseUrl, '/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          product_id: productId,
          workspace_id: 'default',
          assigned_agent_id: builder.id,
          priority: 'normal',
        }),
      });
      return created.id as string;
    };

    const driveTaskToDone = async (taskId: string, filename: string, message: string) => {
      await request(baseUrl, `/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'assigned',
          assigned_agent_id: builder.id,
        }),
      });

      await waitFor(
        `task ${taskId} dispatch`,
        () => request(baseUrl, `/api/tasks/${taskId}`),
        (task: any) => ['assigned', 'in_progress'].includes(task?.status),
        120_000,
        1_500,
      );

      let workspacePath = path.join(projectsPath, '.validation-self-improvement', taskId);
      try {
        const workspace = await waitFor(
          `task ${taskId} workspace`,
          () => request(baseUrl, `/api/tasks/${taskId}/workspace`),
          (status: any) => Boolean(status?.path),
          15_000,
          1_500,
        );
        if (workspace?.path) {
          workspacePath = workspace.path as string;
        }
      } catch {
        // Local/no-repo tasks may not persist a workspace path immediately. Use a
        // deterministic validation directory so deliverable registration still works.
      }

      ensureDir(workspacePath);
      const filePath = path.join(workspacePath, filename);
      fs.writeFileSync(filePath, `${message}\n`);

      await request(baseUrl, `/api/tasks/${taskId}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          activity_type: 'completed',
          message,
          agent_id: builder.id,
        }),
      });

      await request(baseUrl, `/api/tasks/${taskId}/deliverables`, {
        method: 'POST',
        body: JSON.stringify({
          deliverable_type: 'file',
          title: filename,
          path: filePath,
          description: message,
        }),
      });

      await request(baseUrl, `/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });

      return { workspacePath, filePath };
    };

    const taskOneId = await createTask(
      'Validate learner knowledge capture',
      [
        'Create one tiny validation artifact so Mission Control can learn a durable build/test lesson for later tasks.',
        'This task should demonstrate a reusable procedure:',
        '1. Write a validation artifact file in the task workspace.',
        '2. Log a completion activity describing what was validated.',
        '3. Register the artifact as a task deliverable.',
        '4. Mark the task done.',
        'Future agents should be able to reuse this same validation-artifact workflow.',
      ].join('\n'),
    );

    const taskOneResult = await driveTaskToDone(
      taskOneId,
      'learner-validation.txt',
      'Recorded a validation artifact for learner/skills verification.',
    );

    const knowledgeEntry = await waitFor(
    'learner knowledge entry',
    async () =>
      db.prepare(
        `SELECT id, category, title, confidence
         FROM knowledge_entries
         WHERE task_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      ).get(taskOneId) as { id: string; category: string; title: string; confidence: number } | undefined,
    (entry) => Boolean(entry?.id),
    120_000,
    2_000,
  );

    const extractedSkill = await waitFor(
    'extracted skill',
    async () =>
      db.prepare(
        `SELECT id, title, status, confidence, times_used, times_succeeded
         FROM product_skills
         WHERE created_by_task_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      ).get(taskOneId) as {
        id: string;
        title: string;
        status: string;
        confidence: number;
        times_used: number;
        times_succeeded: number;
      } | undefined,
    (skill) => Boolean(skill?.id),
    120_000,
    2_000,
  );
    assert(extractedSkill?.status === 'active', `Expected extracted skill to be active, got ${extractedSkill?.status}`);

    const taskTwoId = await createTask(
    'Reuse the learned validation workflow',
    [
      'Apply the same lightweight validation artifact workflow again so the previous skill and learner note should be injected.',
      'Re-use the prior procedure: create a validation file, log completion, and register the file as a deliverable.',
    ].join('\n'),
  );

    await request(baseUrl, `/api/tasks/${taskTwoId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'assigned',
      assigned_agent_id: builder.id,
    }),
  });

    await waitFor(
    `task ${taskTwoId} dispatch`,
    () => request(baseUrl, `/api/tasks/${taskTwoId}`),
    (task: any) => ['assigned', 'in_progress'].includes(task?.status),
    120_000,
    1_500,
  );

    const skillContext = await waitFor(
    'skill injection activity',
    async () =>
      db.prepare(
        `SELECT id, metadata
         FROM task_activities
         WHERE task_id = ? AND activity_type = 'skill_context'
         ORDER BY created_at DESC
         LIMIT 1`
      ).get(taskTwoId) as { id: string; metadata: string | null } | undefined,
    (activity) => Boolean(activity?.id),
    120_000,
    1_500,
  );

    const session = await waitFor(
    'builder session',
    async () =>
      db.prepare(
        `SELECT id, agent_id, openclaw_session_id, status
         FROM openclaw_sessions
         WHERE agent_id = ? AND status = 'active'
         ORDER BY updated_at DESC
         LIMIT 1`
      ).get(builder.id) as DbSession | undefined,
    (row) => Boolean(row?.id),
    120_000,
    1_000,
  );

    client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }
    const connectedClient = client;

    const sessionKey = buildAgentSessionKey(
      {
        id: builder.id,
        name: builder.name,
        is_master: Boolean(builder.is_master),
        session_key_prefix: builder.session_key_prefix ?? undefined,
      },
      session!.openclaw_session_id,
      { context: 'self-improvement-verification' },
    );

    const dispatchMessage = await waitFor(
    'builder dispatch payload',
    async () => {
        const history = await connectedClient.call<{
          messages: Array<{ role?: string; content?: unknown }>;
        }>('chat.history', {
        sessionKey,
        limit: 50,
      });

      const latestUserMessage = [...(history.messages || [])]
        .reverse()
        .find((message) => message.role === 'user' && extractText(message.content).includes(taskTwoId));

      return latestUserMessage ? extractText(latestUserMessage.content) : '';
    },
    (message) =>
      message.includes('## Available Skills') &&
      message.includes('PREVIOUS LESSONS LEARNED'),
    120_000,
    1_500,
  );

    const taskTwoResult = await driveTaskToDone(
      taskTwoId,
      'learner-validation-second.txt',
      'Reused the learned validation artifact workflow for follow-up verification.',
    );

    const skillReport = await waitFor(
    'skill usage report',
    async () =>
      db.prepare(
        `SELECT skill_id, used, succeeded
         FROM skill_reports
         WHERE task_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      ).get(taskTwoId) as { skill_id: string; used: number; succeeded: number } | undefined,
    (report) => Boolean(report?.skill_id),
    120_000,
    2_000,
  );

    const updatedSkill = db.prepare(
      `SELECT id, title, status, confidence, times_used, times_succeeded
       FROM product_skills
       WHERE id = ?`
    ).get(extractedSkill.id) as {
      id: string;
      title: string;
      status: string;
      confidence: number;
      times_used: number;
      times_succeeded: number;
    };

    console.log(
      JSON.stringify(
        {
          ok: true,
          productId,
          builderAgentId: builder.id,
          firstTask: {
            id: taskOneId,
            workspacePath: taskOneResult.workspacePath,
            knowledgeEntry,
            extractedSkill,
          },
          secondTask: {
            id: taskTwoId,
            workspacePath: taskTwoResult.workspacePath,
            skillContextActivity: skillContext?.id,
            dispatchIncludedSkills: dispatchMessage.includes('## Available Skills'),
            dispatchIncludedKnowledge: dispatchMessage.includes('PREVIOUS LESSONS LEARNED'),
            skillReport,
            updatedSkill,
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

main().catch((error) => {
  console.error('[self-improvement] failed:', error);
  process.exitCode = 1;
});
