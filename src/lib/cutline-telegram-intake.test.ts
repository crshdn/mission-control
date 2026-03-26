import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CutlineTelegramIntakeService,
  type MissionControlApi,
  type NoteWriteRequest,
} from './cutline-telegram-intake';

function createTempWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cutline-telegram-intake-'));
  fs.mkdirSync(path.join(root, 'state', 'cutline-telegram', 'drafts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'obsidian', 'Cutline Vault', '99-Inbox', 'telegram-submissions'), {
    recursive: true,
  });
  return root;
}

function createClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 2, 24, 18, 0, tick++));
}

function createApi() {
  const calls = {
    ideas: [] as Array<{ productId: string; payload: Record<string, unknown> }>,
    tasks: [] as Array<Record<string, unknown>>,
  };

  const api: MissionControlApi = {
    async listWorkspaces() {
      return [{ id: 'ws-cutline', name: 'Cutline', slug: 'cutline' }];
    },
    async listAgents() {
      return [{ id: 'avery-1', name: 'Avery', is_master: true }];
    },
    async listProducts() {
      return [
        {
          id: 'prod-mc',
          name: 'Mission Control',
          workspace_id: 'ws-cutline',
          repo_url: 'https://github.com/example/mission-control',
          default_branch: 'main',
        },
        {
          id: 'prod-notes',
          name: 'Notes Console',
          workspace_id: 'ws-cutline',
          repo_url: null,
          default_branch: null,
        },
      ];
    },
    async createIdea(productId, payload) {
      calls.ideas.push({ productId, payload });
      return { id: `idea-${calls.ideas.length}` };
    },
    async createTask(payload) {
      calls.tasks.push(payload);
      return { id: `task-${calls.tasks.length}` };
    },
  };

  return { api, calls };
}

function createService(options?: {
  noteWriter?: (request: NoteWriteRequest) => void;
}) {
  const workspaceRoot = createTempWorkspace();
  const { api, calls } = createApi();
  const noteWrites: NoteWriteRequest[] = [];
  const service = new CutlineTelegramIntakeService({
    workspaceRoot,
    missionControlApi: api,
    now: createClock(),
    writeNote: (request) => {
      noteWrites.push(request);
      if (options?.noteWriter) {
        options.noteWriter(request);
        return;
      }
      fs.writeFileSync(request.notePath, request.text);
    },
  });

  return { service, workspaceRoot, calls, noteWrites };
}

function readDraft(workspaceRoot: string, chatId: string) {
  return JSON.parse(
    fs.readFileSync(
      path.join(workspaceRoot, 'state', 'cutline-telegram', 'drafts', `${chatId}.json`),
      'utf-8',
    ),
  ) as Record<string, unknown>;
}

test('non-build Telegram message stays normal chat and creates no draft', async () => {
  const { service, workspaceRoot } = createService();

  const result = await service.handleMessage({
    chatId: 'chat-1',
    text: 'Hey, what time is dinner?',
  });

  assert.equal(result.action, 'ignored');
  assert.equal(
    fs.existsSync(path.join(workspaceRoot, 'state', 'cutline-telegram', 'drafts', 'chat-1.json')),
    false,
  );
});

test('messy build request creates a persistent draft and asks exactly one next question', async () => {
  const { service, workspaceRoot } = createService();

  const result = await service.handleMessage({
    chatId: 'chat-2',
    text: 'Please improve the Telegram intake preview in Mission Control.',
  });

  assert.equal(result.action, 'draft_updated');
  assert.equal(result.nextField, 'goal');
  assert.equal(typeof result.nextQuestion, 'string');

  const draft = readDraft(workspaceRoot, 'chat-2');
  assert.equal(draft.state, 'draft');
  assert.equal((draft.build as { requested_change?: string }).requested_change, 'Please improve the Telegram intake preview in Mission Control.');
});

test('idea-ready draft auto-previews and confirm creates a Mission Control idea plus vault note', async () => {
  const { service, calls, noteWrites, workspaceRoot } = createService();
  const structured = [
    'lane: build',
    'title: Improve Telegram idea packaging',
    'goal: Make Telegram build ideas arrive in Mission Control with a cleaner preview.',
    'why now: The current path invites low-context submissions.',
    'constraints: Keep the wrapper conservative and do not auto-start execution.',
    'definition of done: I can review a clear idea preview before anything is written.',
    'target product: Mission Control',
    'user problem: I lose time re-explaining half-formed ideas.',
    'requested change: Add a quality-gated idea preview before Mission Control writes.',
  ].join('\n');

  const preview = await service.handleMessage({
    chatId: 'chat-3',
    text: structured,
  });

  assert.equal(preview.action, 'preview');
  assert.equal(preview.preview.proposedSubmissionType, 'idea');
  assert.equal(preview.preview.previewRevision, 1);

  const result = await service.confirmDraft({
    chatId: 'chat-3',
    previewRevision: preview.preview.previewRevision,
  });

  assert.equal(result.action, 'submitted');
  assert.equal(result.entityType, 'idea');
  assert.equal(calls.ideas.length, 1);
  assert.equal(noteWrites.length, 1);

  const draft = readDraft(workspaceRoot, 'chat-3');
  assert.equal(draft.state, 'submitted');
  assert.equal((draft.submission as { type?: string }).type, 'idea');
});

test('task-ready draft previews as task and confirm creates a Mission Control task', async () => {
  const { service, calls } = createService();
  const structured = [
    'lane: build',
    'title: Harden Telegram build intake',
    'goal: Convert Telegram build requests into high-quality Mission Control tasks.',
    'why now: The bridge is live but still too easy to misuse.',
    'constraints: Keep build lane only and require explicit confirmation.',
    'definition of done: A repo-backed task is created only after the draft passes review.',
    'target product: Mission Control',
    'user problem: Sloppy requests create expensive cleanup work.',
    'requested change: Add a persistent draft gate before task creation.',
    'acceptance criteria: A reviewed preview creates a repo-backed task with the right product attached.',
    'non-goals: Do not auto-plan or auto-dispatch implementation.',
  ].join('\n');

  const preview = await service.handleMessage({
    chatId: 'chat-4',
    text: structured,
  });

  assert.equal(preview.action, 'preview');
  assert.equal(preview.preview.proposedSubmissionType, 'task');
  assert.equal(preview.preview.taskOnlyMissingFields.length, 0);

  const result = await service.confirmDraft({
    chatId: 'chat-4',
    previewRevision: preview.preview.previewRevision,
    buildMode: 'task',
  });

  assert.equal(result.action, 'submitted');
  assert.equal(result.entityType, 'task');
  assert.equal(calls.tasks.length, 1);
});

test('task submit before task readiness falls back to idea preview and shows task-only gaps', async () => {
  const { service, calls } = createService();
  const structured = [
    'lane: build',
    'title: Improve intake guardrails',
    'goal: Keep low-context requests out of Mission Control.',
    'why now: We are actively testing Telegram intake.',
    'constraints: Stay conservative.',
    'definition of done: Idea preview blocks slop.',
    'target product: Mission Control',
    'user problem: I do not want incomplete requests turned into tasks.',
    'requested change: Gate task creation behind stronger readiness checks.',
  ].join('\n');

  const result = await service.submit({
    chatId: 'chat-5',
    text: structured,
    buildMode: 'task',
  });

  assert.equal(result.action, 'preview');
  assert.equal(result.preview.proposedSubmissionType, 'idea');
  assert.deepEqual(result.preview.taskOnlyMissingFields, ['acceptance_criteria', 'non_goals']);
  assert.equal(result.preview.readiness.taskReady, false);
  assert.equal(calls.tasks.length, 0);
  assert.equal(calls.ideas.length, 0);
});

test('invalid target product is held in draft and asks for a valid product', async () => {
  const { service } = createService();
  const structured = [
    'lane: build',
    'title: Route product safely',
    'goal: Only send build ideas to real Cutline products.',
    'why now: A bad product target should not create junk.',
    'constraints: Reject products outside the Cutline workspace.',
    'definition of done: Invalid product names block submission.',
    'target product: Outside Product',
    'user problem: I can mistype product names.',
    'requested change: Validate target products against the workspace.',
  ].join('\n');

  const result = await service.handleMessage({
    chatId: 'chat-6',
    text: structured,
  });

  assert.equal(result.action, 'draft_updated');
  assert.equal(result.nextField, 'target_product');
  assert.ok(result.missingFields.includes('target_product'));
});

test('stale confirmation is rejected after the draft changes', async () => {
  const { service } = createService();
  const structured = [
    'lane: build',
    'title: Preview revision safety',
    'goal: Require a fresh preview after draft edits.',
    'why now: Telegram refinement can change meaning quickly.',
    'constraints: Never confirm against stale context.',
    'definition of done: Old preview revisions are rejected after mutation.',
    'target product: Mission Control',
    'user problem: I might confirm an outdated preview by accident.',
    'requested change: Invalidate the old preview when the draft changes.',
  ].join('\n');

  const preview = await service.handleMessage({
    chatId: 'chat-7',
    text: structured,
  });

  assert.equal(preview.action, 'preview');

  const changed = await service.handleMessage({
    chatId: 'chat-7',
    text: 'Keep the preview compact and add a clearer reviewer note.',
  });

  assert.equal(changed.action, 'preview');
  assert.notEqual(changed.preview.previewRevision, preview.preview.previewRevision);

  await assert.rejects(
    () =>
      service.confirmDraft({
        chatId: 'chat-7',
        previewRevision: preview.preview.previewRevision,
      }),
    /Preview revision mismatch/,
  );
});

test('note export failure blocks blind re-submit after Mission Control write succeeds', async () => {
  const { service, workspaceRoot, calls } = createService({
    noteWriter: () => {
      throw new Error('vault offline');
    },
  });
  const structured = [
    'lane: build',
    'title: Handle partial submission failure',
    'goal: Prevent duplicate writes after note export errors.',
    'why now: The bridge writes to Mission Control before exporting the note.',
    'constraints: Keep the written entity visible but stop blind re-submit.',
    'definition of done: Draft moves to blocked when note export fails.',
    'target product: Mission Control',
    'user problem: A retry could create duplicate ideas.',
    'requested change: Mark the draft blocked after partial submission failure.',
  ].join('\n');

  const preview = await service.handleMessage({
    chatId: 'chat-8',
    text: structured,
  });
  assert.equal(preview.action, 'preview');

  await assert.rejects(
    () =>
      service.confirmDraft({
        chatId: 'chat-8',
        previewRevision: preview.preview.previewRevision,
      }),
    /vault offline/,
  );

  assert.equal(calls.ideas.length, 1);
  const draft = readDraft(workspaceRoot, 'chat-8');
  assert.equal(draft.state, 'blocked');
  assert.equal((draft.submission as { type?: string }).type, 'idea');
});

test('cancel closes the active draft without writing to Mission Control and clears local draft state', async () => {
  const { service, calls, workspaceRoot } = createService();

  await service.handleMessage({
    chatId: 'chat-9',
    text: 'Please improve the Mission Control build review workflow.',
  });

  const result = await service.cancelDraft('chat-9');
  assert.equal(result.action, 'cancelled');
  assert.equal(calls.ideas.length, 0);
  assert.equal(calls.tasks.length, 0);

  assert.equal(
    fs.existsSync(path.join(workspaceRoot, 'state', 'cutline-telegram', 'drafts', 'chat-9.json')),
    false,
  );
  const archived = fs
    .readdirSync(path.join(workspaceRoot, 'state', 'cutline-telegram', 'drafts'))
    .find((name) => name.startsWith('chat-9-cancelled-'));
  assert.ok(archived);
});

test('draft survives service restart and resumes from persisted state', async () => {
  const { service, workspaceRoot } = createService();
  await service.handleMessage({
    chatId: 'chat-10',
    text: 'Please improve the Mission Control Telegram draft review.',
  });

  const { api } = createApi();
  const restarted = new CutlineTelegramIntakeService({
    workspaceRoot,
    missionControlApi: api,
    now: createClock(),
    writeNote: (request) => fs.writeFileSync(request.notePath, request.text),
  });

  const result = await restarted.handleMessage({
    chatId: 'chat-10',
    text: 'We need the goal to be safer build intake quality.',
  });

  assert.equal(result.action, 'draft_updated');
  const draft = readDraft(workspaceRoot, 'chat-10');
  assert.equal(draft.state, 'draft');
});

test('task confirm with missing task fields stays gated on preview instead of creating a task', async () => {
  const { service, calls } = createService();
  const structured = [
    'lane: build',
    'title: Improve task confirm gate',
    'goal: Keep incomplete Telegram drafts from becoming tasks.',
    'why now: We need safe confirmation behavior for real usage.',
    'constraints: Stay conservative and explicit.',
    'definition of done: Confirm shows missing task fields instead of creating a task.',
    'target product: Mission Control',
    'user problem: A mistaken /confirm should not create cleanup work.',
    'requested change: Refuse task-mode confirmation until task-only fields are present.',
  ].join('\n');

  const preview = await service.handleMessage({
    chatId: 'chat-11',
    text: structured,
  });

  assert.equal(preview.action, 'preview');

  const gated = await service.confirmDraft({
    chatId: 'chat-11',
    previewRevision: preview.preview.previewRevision,
    buildMode: 'task',
  });

  assert.equal(gated.action, 'preview');
  assert.equal(gated.preview.readiness.taskReady, false);
  assert.deepEqual(gated.preview.readiness.taskMissingFields, ['acceptance_criteria', 'non_goals']);
  assert.equal(calls.tasks.length, 0);
  assert.equal(calls.ideas.length, 0);
});

test('conversational replies fill missing task fields and enable task confirmation', async () => {
  const { service, calls } = createService();
  const structured = [
    'lane: build',
    'title: Refine Telegram drafts conversationally',
    'goal: Let replies fill missing structured fields.',
    'why now: Telegram refinement should stay low-friction.',
    'constraints: Do not build a wizard.',
    'definition of done: Missing task fields can be supplied by reply.',
    'target product: Mission Control',
    'user problem: I want to add missing detail without rewriting the whole draft.',
    'requested change: Accept reply-based field injection for missing task details.',
  ].join('\n');

  const firstPreview = await service.handleMessage({
    chatId: 'chat-12',
    text: structured,
  });
  assert.equal(firstPreview.action, 'preview');
  assert.deepEqual(firstPreview.preview.readiness.taskMissingFields, ['acceptance_criteria', 'non_goals']);

  const fillAcceptance = await service.handleMessage({
    chatId: 'chat-12',
    text: 'Acceptance criteria: The wrapper shows every parsed field before Mission Control write.',
  });
  assert.equal(fillAcceptance.action, 'preview');
  assert.deepEqual(fillAcceptance.preview.readiness.taskMissingFields, ['non_goals']);

  const fillNonGoals = await service.handleMessage({
    chatId: 'chat-12',
    text: 'Non-goals: No schema changes, no wizard flow, no non-build lanes.',
  });
  assert.equal(fillNonGoals.action, 'preview');
  assert.equal(fillNonGoals.preview.readiness.taskReady, true);

  const submitted = await service.confirmDraft({
    chatId: 'chat-12',
    previewRevision: fillNonGoals.preview.previewRevision,
    buildMode: 'task',
  });
  assert.equal(submitted.action, 'submitted');
  assert.equal(submitted.entityType, 'task');
  assert.equal(calls.tasks.length, 1);
});
