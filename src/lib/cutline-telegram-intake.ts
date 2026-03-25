import fs from 'fs';
import path from 'path';

export type IntakeLane = 'signal' | 'line_lab' | 'build';
export type BuildSubmissionMode = 'task' | 'idea';
export type DraftState =
  | 'draft'
  | 'ready_for_idea'
  | 'ready_for_task'
  | 'previewed'
  | 'submitted'
  | 'blocked'
  | 'cancelled';

export type SharedDraftField =
  | 'title'
  | 'goal'
  | 'why_now'
  | 'constraints'
  | 'definition_of_done';

export type BuildDraftField =
  | 'target_product'
  | 'repo_or_product_target'
  | 'user_problem'
  | 'requested_change'
  | 'acceptance_criteria'
  | 'non_goals';

export type DraftFieldKey = SharedDraftField | BuildDraftField;

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
}

export interface ProductRow {
  id: string;
  name: string;
  workspace_id: string;
  repo_url?: string | null;
  default_branch?: string | null;
}

export interface AgentRow {
  id: string;
  name: string;
  is_master: boolean;
}

export interface SourceMessage {
  timestamp: string;
  kind: 'text' | 'transcript' | 'system';
  text: string;
}

export interface BuildDraftFields {
  target_product?: string;
  repo_or_product_target?: string;
  user_problem?: string;
  requested_change?: string;
  acceptance_criteria?: string;
  non_goals?: string;
}

export interface DraftSubmissionResult {
  type: BuildSubmissionMode;
  id: string;
  product_id?: string;
  product_name?: string;
  note_path?: string;
}

export interface CutlineTelegramDraft {
  version: number;
  chat_id: string;
  state: DraftState;
  lane_confidence: number;
  confidence: number;
  ready_score: number;
  missing_fields: DraftFieldKey[];
  supporting_context: string[];
  signal: Record<string, never>;
  line_lab: Record<string, never>;
  build: BuildDraftFields;
  source_messages: SourceMessage[];
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  preview_revision?: number;
  last_previewed_at?: string;
  lane?: IntakeLane;
  title?: string;
  goal?: string;
  why_now?: string;
  constraints?: string;
  definition_of_done?: string;
  submission?: DraftSubmissionResult;
}

export interface MissionControlApi {
  listWorkspaces(): Promise<WorkspaceRow[]>;
  listAgents(workspaceId: string): Promise<AgentRow[]>;
  listProducts(workspaceId: string): Promise<ProductRow[]>;
  createIdea(productId: string, payload: Record<string, unknown>): Promise<{ id: string }>;
  createTask(payload: Record<string, unknown>): Promise<{ id: string }>;
}

export interface NoteWriteRequest {
  notePath: string;
  title: string;
  lane: IntakeLane;
  buildMode?: BuildSubmissionMode;
  text: string;
  transcript?: string;
  entityId?: string;
  entityType?: 'task' | 'idea';
  productName?: string;
}

export interface CutlineIntakeDependencies {
  workspaceRoot: string;
  missionControlApi: MissionControlApi;
  now?: () => Date;
  ensureDir?: (dirPath: string) => void;
  writeNote: (request: NoteWriteRequest) => void;
}

export interface InteractionRequest {
  chatId: string;
  text?: string;
  transcript?: string;
  title?: string;
  product?: string;
}

export interface SubmitRequest extends InteractionRequest {
  buildMode?: BuildSubmissionMode;
}

export interface ConfirmRequest {
  chatId: string;
  previewRevision: number;
  buildMode?: BuildSubmissionMode;
}

export interface DraftPreview {
  title: string;
  lane: IntakeLane;
  state: DraftState;
  previewRevision: number;
  proposedSubmissionType: BuildSubmissionMode;
  readyScore: number;
  product: string | null;
  taskOnlyMissingFields: DraftFieldKey[];
  missingFields: DraftFieldKey[];
  // New structured fields for preview
  fields: Record<string, string | undefined>;
}

export interface DraftResponseBase {
  ok: true;
  chatId: string;
  state: DraftState;
  readyScore: number;
  draftPath?: string;
}

export type IntakeResponse =
  | (DraftResponseBase & {
      action: 'ignored';
      reason: 'non_build';
      message: string;
    })
  | (DraftResponseBase & {
      action: 'draft_updated';
      nextField: DraftFieldKey;
      nextQuestion: string;
      missingFields: DraftFieldKey[];
    })
  | (DraftResponseBase & {
      action: 'blocked';
      message: string;
      missingFields: DraftFieldKey[];
      submission?: DraftSubmissionResult;
    })
  | (DraftResponseBase & {
      action: 'preview';
      preview: DraftPreview;
      autoPreview?: boolean;
    })
  | (DraftResponseBase & {
      action: 'submitted';
      entityType: BuildSubmissionMode;
      entityId: string;
      notePath: string;
      previewRevision: number;
      product: string | null;
    })
  | (DraftResponseBase & {
      action: 'cancelled';
      message: string;
    });

interface WorkspaceContext {
  workspace: WorkspaceRow;
  avery?: AgentRow;
  products: ProductRow[];
}

interface DraftEvaluation {
  ideaMissing: DraftFieldKey[];
  taskMissing: DraftFieldKey[];
  missingFields: DraftFieldKey[];
  readyScore: number;
  resolvedProduct?: ProductRow;
  productResolutionError?: string;
  proposedSubmissionType: BuildSubmissionMode;
  nextField?: DraftFieldKey;
}

interface ParsedPatch {
  lane?: IntakeLane;
  shared: Partial<Record<SharedDraftField, string>>;
  build: Partial<Record<BuildDraftField, string>>;
}

const DRAFT_VERSION = 2;
const DRAFT_FIELD_ORDER: DraftFieldKey[] = [
  'title',
  'goal',
  'why_now',
  'user_problem',
  'requested_change',
  'definition_of_done',
  'constraints',
  'target_product',
  'acceptance_criteria',
  'non_goals',
  'repo_or_product_target',
];

const IDEA_REQUIRED_FIELDS: DraftFieldKey[] = [
  'title',
  'goal',
  'why_now',
  'constraints',
  'definition_of_done',
  'target_product',
  'user_problem',
  'requested_change',
];

const TASK_REQUIRED_FIELDS: DraftFieldKey[] = [
  ...IDEA_REQUIRED_FIELDS,
  'acceptance_criteria',
  'non_goals',
  'repo_or_product_target',
];

const FIELD_QUESTIONS: Record<DraftFieldKey, string> = {
  title: 'What should we call this build request?',
  goal: 'What outcome are we trying to achieve?',
  why_now: 'Why is this worth doing now?',
  user_problem: 'What user or operator problem is this solving?',
  requested_change: 'What specific change do you want made?',
  definition_of_done: 'How will we know this is done?',
  constraints: 'What constraints or guardrails should Mission Control respect?',
  target_product: 'Which Cutline product should own this, if not Mission Control?',
  acceptance_criteria: 'What acceptance criteria should a task be held to?',
  non_goals: 'What is explicitly out of scope?',
  repo_or_product_target: 'Which repo-backed target should this task attach to?',
};

function cleanValue(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned : undefined;
}

function normalizeLane(value?: string): IntakeLane | undefined {
  const cleaned = cleanValue(value)?.toLowerCase().replace(/[\s-]+/g, '_');
  if (cleaned === 'build') return 'build';
  if (cleaned === 'signal') return 'signal';
  if (cleaned === 'line_lab' || cleaned === 'line') return 'line_lab';
  return undefined;
}

function inferTitle(text: string, explicitTitle?: string): string {
  const override = cleanValue(explicitTitle);
  if (override) return override;
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || text.trim();
  return (
    firstLine.replace(/^[-*]\s*/, '').replace(/\s+/g, ' ').slice(0, 90).trim() ||
    'Telegram build request'
  );
}

function normalizeFieldKey(rawKey: string): DraftFieldKey | undefined {
  const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const aliases: Record<string, DraftFieldKey> = {
    title: 'title',
    goal: 'goal',
    why_now: 'why_now',
    why: 'why_now',
    constraints: 'constraints',
    definition_of_done: 'definition_of_done',
    done: 'definition_of_done',
    target_product: 'target_product',
    product: 'target_product',
    repo_or_product_target: 'repo_or_product_target',
    repo_target: 'repo_or_product_target',
    repo: 'repo_or_product_target',
    user_problem: 'user_problem',
    problem: 'user_problem',
    requested_change: 'requested_change',
    request: 'requested_change',
    change: 'requested_change',
    acceptance_criteria: 'acceptance_criteria',
    acceptance: 'acceptance_criteria',
    non_goals: 'non_goals',
    non_goal: 'non_goals',
  };
  return aliases[key];
}

function hasStructuredField(text: string): boolean {
  return text
    .split('\n')
    .some((line) => line.includes(':') && Boolean(normalizeFieldKey(line.split(':', 1)[0] || '')));
}

function parseStructuredPatch(text: string): ParsedPatch {
  const patch: ParsedPatch = { shared: {}, build: {} };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;

    const key = normalizeFieldKey(line.slice(0, separator));
    const value = cleanValue(line.slice(separator + 1));
    if (!key || !value) continue;

    if (key === 'title' || key === 'goal' || key === 'why_now' || key === 'constraints' || key === 'definition_of_done') {
      patch.shared[key] = value;
    } else {
      patch.build[key] = value;
    }
  }

  const explicitLane = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith('lane:'));
  if (explicitLane) {
    patch.lane = normalizeLane(explicitLane.slice(explicitLane.indexOf(':') + 1));
  }

  return patch;
}

function looksLikeBuildIntent(text: string): boolean {
  const lowered = text.toLowerCase();
  if (lowered.includes('lane: build')) return true;
  if (hasStructuredField(text)) return true;
  return /\b(build|feature|fix|bug|improve|improvement|workflow|automation|mission control|repo|product|task|idea)\b/i.test(text);
}

function createDraft(chatId: string, nowIso: string): CutlineTelegramDraft {
  return {
    version: DRAFT_VERSION,
    chat_id: chatId,
    state: 'draft',
    lane_confidence: 0.6,
    confidence: 0.6,
    ready_score: 0,
    missing_fields: [...IDEA_REQUIRED_FIELDS],
    supporting_context: [],
    signal: {},
    line_lab: {},
    build: {
      target_product: 'Mission Control',
    },
    source_messages: [],
    created_at: nowIso,
    updated_at: nowIso,
    preview_revision: 0,
    lane: 'build',
  };
}

function cloneDraft(draft: CutlineTelegramDraft): CutlineTelegramDraft {
  return JSON.parse(JSON.stringify(draft)) as CutlineTelegramDraft;
}

function resolveDraftFieldValue(draft: CutlineTelegramDraft, field: DraftFieldKey): string | undefined {
  if (
    field === 'title' ||
    field === 'goal' ||
    field === 'why_now' ||
    field === 'constraints' ||
    field === 'definition_of_done'
  ) {
    return cleanValue(draft[field]);
  }
  return cleanValue(draft.build[field]);
}

function setDraftFieldValue(draft: CutlineTelegramDraft, field: DraftFieldKey, value: string): void {
  if (
    field === 'title' ||
    field === 'goal' ||
    field === 'why_now' ||
    field === 'constraints' ||
    field === 'definition_of_done'
  ) {
    draft[field] = value;
    return;
  }
  draft.build[field] = value;
}

function buildDraftPath(workspaceRoot: string, chatId: string): string {
  return path.join(workspaceRoot, 'state', 'cutline-telegram', 'drafts', `${chatId}.json`);
}

function buildArchivePath(workspaceRoot: string, draft: CutlineTelegramDraft): string {
  const suffix = (draft.submitted_at || draft.updated_at || new Date().toISOString())
    .replace(/[:.]/g, '-')
    .replace(/Z$/, 'Z');
  return path.join(
    workspaceRoot,
    'state',
    'cutline-telegram',
    'drafts',
    `${draft.chat_id}-${draft.state}-${suffix}.json`,
  );
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'telegram-intake'
  );
}

function notePathFor(workspaceRoot: string, title: string, nowIso: string): string {
  const stamp = nowIso.replace(/[:]/g, '-');
  return path.join(
    workspaceRoot,
    'obsidian',
    'Cutline Vault',
    '99-Inbox',
    'telegram-submissions',
    `${stamp}-${slugify(title)}.md`,
  );
}

function buildDescriptionFromDraft(draft: CutlineTelegramDraft, body: string, transcript?: string): string {
  const lines = [
    `Lane: ${draft.lane || 'build'}`,
    draft.build.target_product ? `Target product: ${draft.build.target_product}` : undefined,
    draft.build.repo_or_product_target ? `Repo-backed target: ${draft.build.repo_or_product_target}` : undefined,
    '',
    '## Title',
    cleanValue(draft.title) || 'Untitled build request',
    '',
    '## Goal',
    cleanValue(draft.goal) || 'Not captured yet.',
    '',
    '## Why Now',
    cleanValue(draft.why_now) || 'Not captured yet.',
    '',
    '## User Problem',
    cleanValue(draft.build.user_problem) || 'Not captured yet.',
    '',
    '## Requested Change',
    cleanValue(draft.build.requested_change) || body.trim(),
    '',
    '## Definition of Done',
    cleanValue(draft.definition_of_done) || 'Not captured yet.',
    '',
    '## Constraints',
    cleanValue(draft.constraints) || 'None captured.',
    cleanValue(draft.build.acceptance_criteria)
      ? ['', '## Acceptance Criteria', cleanValue(draft.build.acceptance_criteria)]
      : undefined,
    cleanValue(draft.build.non_goals)
      ? ['', '## Non-Goals', cleanValue(draft.build.non_goals)]
      : undefined,
    '',
    '## Source',
    body.trim(),
    transcript?.trim() ? '' : undefined,
    transcript?.trim() ? '## Transcript' : undefined,
    transcript?.trim() ? transcript.trim() : undefined,
  ]
    .flat()
    .filter((entry): entry is string => Boolean(entry));

  return lines.join('\n');
}

function evaluateDraft(
  draft: CutlineTelegramDraft,
  context: WorkspaceContext,
): DraftEvaluation {
  const productName = cleanValue(draft.build.target_product) || 'Mission Control';
  draft.build.target_product = productName;

  const resolvedProduct = context.products.find((product) => {
    const target = productName.toLowerCase();
    return product.id === productName || product.name.trim().toLowerCase() === target;
  });

  const ideaMissing = IDEA_REQUIRED_FIELDS.filter((field) => {
    if (field === 'target_product') {
      return !resolvedProduct;
    }
    return !resolveDraftFieldValue(draft, field);
  });

  if (resolvedProduct?.repo_url && !cleanValue(draft.build.repo_or_product_target)) {
    draft.build.repo_or_product_target = resolvedProduct.name;
  }

  const taskMissing = TASK_REQUIRED_FIELDS.filter((field) => {
    if (field === 'target_product') {
      return !resolvedProduct;
    }
    if (field === 'repo_or_product_target') {
      return !resolvedProduct?.repo_url || !cleanValue(draft.build.repo_or_product_target);
    }
    return !resolveDraftFieldValue(draft, field);
  });

  const readyScoreTarget = ideaMissing.length === 0 ? TASK_REQUIRED_FIELDS : IDEA_REQUIRED_FIELDS;
  const presentCount = readyScoreTarget.filter((field) => {
    if (field === 'target_product') return Boolean(resolvedProduct);
    if (field === 'repo_or_product_target') {
      return Boolean(resolvedProduct?.repo_url && cleanValue(draft.build.repo_or_product_target));
    }
    return Boolean(resolveDraftFieldValue(draft, field));
  }).length;

  const orderedMissing = DRAFT_FIELD_ORDER.filter((field) => {
    if (ideaMissing.length > 0) return ideaMissing.includes(field);
    return taskMissing.includes(field);
  });

  return {
    ideaMissing,
    taskMissing,
    missingFields: orderedMissing,
    readyScore: Math.round((presentCount / readyScoreTarget.length) * 100),
    resolvedProduct,
    productResolutionError: resolvedProduct ? undefined : `Product not found in Cutline workspace: ${productName}`,
    proposedSubmissionType: taskMissing.length === 0 ? 'task' : 'idea',
    nextField: orderedMissing[0],
  };
}

function stateFromEvaluation(currentState: DraftState, evaluation: DraftEvaluation): DraftState {
  if (currentState === 'blocked' || currentState === 'submitted' || currentState === 'cancelled') {
    return currentState;
  }
  if (evaluation.taskMissing.length === 0) return 'ready_for_task';
  if (evaluation.ideaMissing.length === 0) return 'ready_for_idea';
  return 'draft';
}

function applyPatchToDraft(
  draft: CutlineTelegramDraft,
  patch: ParsedPatch,
  fallbackText?: string,
  explicitTitle?: string,
  nextField?: DraftFieldKey,
): void {
  if (patch.lane) {
    draft.lane = patch.lane;
  }

  for (const [key, value] of Object.entries(patch.shared)) {
    if (value) {
      setDraftFieldValue(draft, key as DraftFieldKey, value);
    }
  }

  for (const [key, value] of Object.entries(patch.build)) {
    if (value) {
      setDraftFieldValue(draft, key as DraftFieldKey, value);
    }
  }

  if (explicitTitle) {
    draft.title = cleanValue(explicitTitle);
  }

  if (fallbackText && !hasStructuredField(fallbackText)) {
    const value = fallbackText.trim();
    if (nextField) {
      setDraftFieldValue(draft, nextField, value);
    } else {
      if (!cleanValue(draft.title)) draft.title = inferTitle(value, explicitTitle);
      if (!cleanValue(draft.build.requested_change)) {
        draft.build.requested_change = value;
      } else if (!cleanValue(draft.goal)) {
        draft.goal = value;
      } else if (!cleanValue(draft.build.user_problem)) {
        draft.build.user_problem = value;
      } else {
        draft.supporting_context.push(value);
      }
    }
  }

  if (!cleanValue(draft.title)) {
    const seedText = fallbackText || draft.build.requested_change || draft.goal || 'Telegram build request';
    draft.title = inferTitle(seedText, explicitTitle);
  }
}

function currentStateAllowsMutation(state?: DraftState): boolean {
  return !state || (state !== 'submitted' && state !== 'blocked' && state !== 'cancelled');
}

export class CutlineTelegramIntakeService {
  private readonly workspaceRoot: string;
  private readonly draftRoot: string;
  private readonly missionControlApi: MissionControlApi;
  private readonly now: () => Date;
  private readonly ensureDir: (dirPath: string) => void;
  private readonly writeNote: (request: NoteWriteRequest) => void;

  constructor(deps: CutlineIntakeDependencies) {
    this.workspaceRoot = deps.workspaceRoot;
    this.draftRoot = path.join(this.workspaceRoot, 'state', 'cutline-telegram', 'drafts');
    this.missionControlApi = deps.missionControlApi;
    this.now = deps.now || (() => new Date());
    this.ensureDir = deps.ensureDir || ((dirPath: string) => fs.mkdirSync(dirPath, { recursive: true }));
    this.writeNote = deps.writeNote;
    this.ensureDir(this.draftRoot);
  }

  async handleMessage(request: InteractionRequest): Promise<IntakeResponse> {
    const text = cleanValue(request.text || request.transcript);
    const transcript = cleanValue(request.transcript && request.text ? request.transcript : undefined);
    if (!text) {
      throw new Error('Provide text or transcript for the Telegram intake message.');
    }

    const existing = this.loadDraft(request.chatId);
    if (!existing && !looksLikeBuildIntent(text)) {
      return {
        ok: true,
        action: 'ignored',
        reason: 'non_build',
        message: 'Message stayed in normal chat because it did not look like a Cutline build request.',
        chatId: request.chatId,
        state: 'draft',
        readyScore: 0,
      };
    }

    if (existing?.state === 'blocked') {
      return {
        ok: true,
        action: 'blocked',
        chatId: request.chatId,
        state: existing.state,
        readyScore: existing.ready_score,
        draftPath: buildDraftPath(this.workspaceRoot, request.chatId),
        message:
          'This draft is blocked because Mission Control already wrote the entity but the durable note step failed. Cancel it or repair it before resubmitting.',
        missingFields: existing.missing_fields,
        submission: existing.submission,
      };
    }

    const nowIso = this.now().toISOString();
    const draft = this.prepareMutableDraft(request.chatId, existing, nowIso);
    const context = await this.loadWorkspaceContext();
    const priorEvaluation = evaluateDraft(draft, context);
    const patch = parseStructuredPatch(text);

    const lane = patch.lane || draft.lane;
    if (lane && lane !== 'build') {
      return {
        ok: true,
        action: 'ignored',
        reason: 'non_build',
        message: `Lane "${lane}" stayed in normal chat because this bridge only handles build requests.`,
        chatId: request.chatId,
        state: draft.state,
        readyScore: draft.ready_score,
      };
    }

    applyPatchToDraft(
      draft,
      patch,
      text,
      request.title,
      existing ? priorEvaluation.nextField : undefined,
    );
    if (request.product) {
      draft.build.target_product = request.product.trim();
    }

    draft.lane = 'build';
    draft.lane_confidence = patch.lane === 'build' ? 0.95 : existing ? 0.85 : 0.75;
    draft.confidence = draft.lane_confidence;
    draft.updated_at = nowIso;
    draft.source_messages.push({
      timestamp: nowIso,
      kind: transcript ? 'transcript' : 'text',
      text,
    });
    if (transcript) {
      draft.supporting_context.push(transcript);
    }

    const evaluation = evaluateDraft(draft, context);
    draft.ready_score = evaluation.readyScore;
    draft.missing_fields = evaluation.missingFields;
    draft.state = stateFromEvaluation(draft.state, evaluation);

    const wasReady = priorEvaluation.ideaMissing.length === 0;
    const isNowReady = evaluation.ideaMissing.length === 0;
    const autoPreview = !wasReady && isNowReady;

    if (autoPreview) {
      const preview = this.renderPreview(draft, evaluation, true);
      this.saveDraft(draft);
      return this.previewResponse(request.chatId, draft, preview, true);
    }

    this.saveDraft(draft);

    if (draft.state === 'ready_for_idea' || draft.state === 'ready_for_task' || draft.state === 'previewed') {
      const preview = this.renderPreview(draft, evaluation, true);
      this.saveDraft(draft);
      return this.previewResponse(request.chatId, draft, preview);
    }

    return {
      ok: true,
      action: 'draft_updated',
      chatId: request.chatId,
      state: draft.state,
      readyScore: draft.ready_score,
      draftPath: buildDraftPath(this.workspaceRoot, request.chatId),
      nextField: evaluation.nextField || 'goal',
      nextQuestion: FIELD_QUESTIONS[evaluation.nextField || 'goal'],
      missingFields: draft.missing_fields,
    };
  }

  async previewDraft(chatId: string): Promise<IntakeResponse> {
    const draft = this.requireDraft(chatId);
    const context = await this.loadWorkspaceContext();
    const evaluation = evaluateDraft(draft, context);
    draft.ready_score = evaluation.readyScore;
    draft.missing_fields = evaluation.missingFields;
    draft.state = stateFromEvaluation(draft.state, evaluation);

    if (evaluation.ideaMissing.length > 0) {
      this.saveDraft(draft);
      return {
        ok: true,
        action: 'draft_updated',
        chatId,
        state: draft.state,
        readyScore: draft.ready_score,
        draftPath: buildDraftPath(this.workspaceRoot, chatId),
        nextField: evaluation.nextField || 'goal',
        nextQuestion: FIELD_QUESTIONS[evaluation.nextField || 'goal'],
        missingFields: draft.missing_fields,
      };
    }

    const preview = this.renderPreview(draft, evaluation, true);
    this.saveDraft(draft);
    return this.previewResponse(chatId, draft, preview);
  }

  async cancelDraft(chatId: string): Promise<IntakeResponse> {
    const draft = this.requireDraft(chatId);
    draft.state = 'cancelled';
    draft.updated_at = this.now().toISOString();
    this.saveDraft(draft);
    return {
      ok: true,
      action: 'cancelled',
      chatId,
      state: draft.state,
      readyScore: draft.ready_score,
      draftPath: buildDraftPath(this.workspaceRoot, chatId),
      message: 'The active Cutline Telegram draft is now cancelled and will not write to Mission Control.',
    };
  }

  async submit(request: SubmitRequest): Promise<IntakeResponse> {
    const text = cleanValue(request.text || request.transcript);
    if (!text) {
      throw new Error('Provide --text or --transcript for submit.');
    }

    const messageResult = await this.handleMessage(request);
    if (messageResult.action === 'ignored' || messageResult.action === 'blocked' || messageResult.action === 'cancelled') {
      return messageResult;
    }

    if (!request.buildMode && messageResult.action === 'preview') {
      return messageResult;
    }

    const draft = this.requireDraft(request.chatId);
    const context = await this.loadWorkspaceContext();
    const evaluation = evaluateDraft(draft, context);

    if (evaluation.ideaMissing.length > 0) {
      return {
        ok: true,
        action: 'draft_updated',
        chatId: request.chatId,
        state: draft.state,
        readyScore: draft.ready_score,
        draftPath: buildDraftPath(this.workspaceRoot, request.chatId),
        nextField: evaluation.nextField || 'goal',
        nextQuestion: FIELD_QUESTIONS[evaluation.nextField || 'goal'],
        missingFields: draft.missing_fields,
      };
    }

    const preview = this.renderPreview(draft, evaluation, true, request.buildMode);
    this.saveDraft(draft);

    if (request.buildMode === 'task') {
      if (evaluation.taskMissing.length > 0) {
        throw new Error(`Cannot submit as task: missing fields ${evaluation.taskMissing.join(', ')}`);
      }
    } else if (evaluation.ideaMissing.length > 0) {
      throw new Error(`Cannot submit as idea: missing fields ${evaluation.ideaMissing.join(', ')}`);
    }

    return this.confirmDraft({
      chatId: request.chatId,
      buildMode: request.buildMode,
      previewRevision: preview.previewRevision,
    });
  }

  async confirmDraft(request: ConfirmRequest): Promise<IntakeResponse> {
    const draft = this.requireDraft(request.chatId);
    if (draft.state === 'blocked') {
      return {
        ok: true,
        action: 'blocked',
        chatId: request.chatId,
        state: draft.state,
        readyScore: draft.ready_score,
        draftPath: buildDraftPath(this.workspaceRoot, request.chatId),
        message:
          'This draft is blocked because Mission Control already wrote the entity but the durable note export failed. Cancel or repair it before trying again.',
        missingFields: draft.missing_fields,
        submission: draft.submission,
      };
    }

    if ((draft.preview_revision || 0) !== request.previewRevision) {
      throw new Error(
        `Preview revision mismatch. Expected ${draft.preview_revision || 0}, received ${request.previewRevision}. Generate a fresh preview before confirming.`,
      );
    }

    if (
      draft.last_previewed_at &&
      new Date(draft.updated_at).getTime() > new Date(draft.last_previewed_at).getTime()
    ) {
      throw new Error('The draft changed after the last preview. Generate a fresh preview before confirming.');
    }

    const context = await this.loadWorkspaceContext();
    const evaluation = evaluateDraft(draft, context);
    if (evaluation.ideaMissing.length > 0) {
      throw new Error('Draft is not idea-ready yet. Continue refinement before confirming.');
    }

    if (request.buildMode === 'task' && evaluation.taskMissing.length > 0) {
      throw new Error(
        `Draft is not task-ready yet. Missing task fields: ${evaluation.taskMissing.join(', ')}`,
      );
    }

    const entityType: BuildSubmissionMode =
      request.buildMode === 'task' && evaluation.taskMissing.length === 0 ? 'task' : 'idea';
    const product = evaluation.resolvedProduct;
    if (!product) {
      throw new Error(evaluation.productResolutionError || 'Resolved product missing.');
    }

    const body = this.latestSourceBody(draft);
    const transcript = this.latestTranscript(draft);
    const description = buildDescriptionFromDraft(draft, body, transcript);

    let entityId = '';
    if (entityType === 'idea') {
      const idea = await this.missionControlApi.createIdea(product.id, {
        title: cleanValue(draft.title) || inferTitle(body),
        description,
        category: 'operations',
        complexity: 'S',
        impact_score: 6,
        feasibility_score: 8,
        technical_approach: 'Captured from Telegram intake after passing the Cutline readiness gate.',
        tags: ['telegram', 'cutline', 'intake'],
      });
      entityId = idea.id;
    } else {
      const task = await this.missionControlApi.createTask({
        title: cleanValue(draft.title) || inferTitle(body),
        description,
        workspace_id: context.workspace.id,
        product_id: product.id,
        created_by_agent_id: context.avery?.id || null,
        status: 'inbox',
        priority: 'high',
        repo_url: product.repo_url || undefined,
        repo_branch: product.default_branch || undefined,
      });
      entityId = task.id;
    }

    const notePath = notePathFor(this.workspaceRoot, cleanValue(draft.title) || inferTitle(body), this.now().toISOString());
    try {
      this.writeNote({
        notePath,
        title: cleanValue(draft.title) || inferTitle(body),
        lane: 'build',
        buildMode: entityType,
        text: body,
        transcript,
        entityType,
        entityId,
        productName: product.name,
      });
    } catch (error) {
      draft.state = 'blocked';
      draft.submission = {
        type: entityType,
        id: entityId,
        product_id: product.id,
        product_name: product.name,
      };
      draft.updated_at = this.now().toISOString();
      this.saveDraft(draft);
      throw error;
    }

    draft.submission = {
      type: entityType,
      id: entityId,
      product_id: product.id,
      product_name: product.name,
      note_path: notePath,
    };
    draft.submitted_at = this.now().toISOString();
    draft.updated_at = draft.submitted_at;
    draft.state = 'submitted';
    this.saveDraft(draft);

    return {
      ok: true,
      action: 'submitted',
      chatId: request.chatId,
      state: draft.state,
      readyScore: draft.ready_score,
      draftPath: buildDraftPath(this.workspaceRoot, request.chatId),
      entityType,
      entityId,
      notePath,
      previewRevision: request.previewRevision,
      product: product.name,
    };
  }

  private loadDraft(chatId: string): CutlineTelegramDraft | undefined {
    const draftPath = buildDraftPath(this.workspaceRoot, chatId);
    if (!fs.existsSync(draftPath)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(draftPath, 'utf-8')) as CutlineTelegramDraft;
    return {
      ...createDraft(chatId, parsed.created_at || this.now().toISOString()),
      ...parsed,
      version: DRAFT_VERSION,
      chat_id: chatId,
      build: {
        target_product: 'Mission Control',
        ...(parsed.build || {}),
      },
      supporting_context: Array.isArray(parsed.supporting_context) ? parsed.supporting_context : [],
      source_messages: Array.isArray(parsed.source_messages) ? parsed.source_messages : [],
      signal: {},
      line_lab: {},
      preview_revision: parsed.preview_revision || 0,
    };
  }

  private requireDraft(chatId: string): CutlineTelegramDraft {
    const draft = this.loadDraft(chatId);
    if (!draft) {
      throw new Error(`No active Cutline Telegram draft found for chat ${chatId}.`);
    }
    return draft;
  }

  private prepareMutableDraft(
    chatId: string,
    existing: CutlineTelegramDraft | undefined,
    nowIso: string,
  ): CutlineTelegramDraft {
    if (!existing) return createDraft(chatId, nowIso);
    if (currentStateAllowsMutation(existing.state)) return cloneDraft(existing);

    const archivePath = buildArchivePath(this.workspaceRoot, existing);
    this.ensureDir(path.dirname(archivePath));
    fs.writeFileSync(archivePath, JSON.stringify(existing, null, 2));
    return createDraft(chatId, nowIso);
  }

  private saveDraft(draft: CutlineTelegramDraft): void {
    this.ensureDir(this.draftRoot);
    fs.writeFileSync(buildDraftPath(this.workspaceRoot, draft.chat_id), JSON.stringify(draft, null, 2));
  }

  private async loadWorkspaceContext(): Promise<WorkspaceContext> {
    const workspaces = await this.missionControlApi.listWorkspaces();
    const workspace = workspaces.find((entry) => entry.name === 'Cutline');
    if (!workspace) {
      throw new Error('Cutline workspace not found in Mission Control.');
    }

    const [agents, products] = await Promise.all([
      this.missionControlApi.listAgents(workspace.id),
      this.missionControlApi.listProducts(workspace.id),
    ]);

    return {
      workspace,
      avery: agents.find((agent) => agent.name === 'Avery') || agents.find((agent) => agent.is_master),
      products,
    };
  }

  private renderPreview(
    draft: CutlineTelegramDraft,
    evaluation: DraftEvaluation,
    updateRevision: boolean,
    requestedBuildMode?: BuildSubmissionMode,
  ): DraftPreview {
    if (updateRevision) {
      draft.preview_revision = (draft.preview_revision || 0) + 1;
      draft.last_previewed_at = this.now().toISOString();
      draft.state = 'previewed';
      draft.updated_at = draft.last_previewed_at;
    }

    const proposedSubmissionType =
      requestedBuildMode === 'task' && evaluation.taskMissing.length === 0
        ? 'task'
        : evaluation.proposedSubmissionType;

    return {
      title: cleanValue(draft.title) || 'Telegram build request',
      lane: 'build',
      state: draft.state,
      previewRevision: draft.preview_revision || 0,
      proposedSubmissionType,
      readyScore: evaluation.readyScore,
      product: evaluation.resolvedProduct?.name || null,
      taskOnlyMissingFields: evaluation.ideaMissing.length === 0 ? evaluation.taskMissing : [],
      missingFields: evaluation.missingFields,
      fields: {
        title: cleanValue(draft.title),
        goal: cleanValue(draft.goal),
        why_now: cleanValue(draft.why_now),
        user_problem: cleanValue(draft.build.user_problem),
        requested_change: cleanValue(draft.build.requested_change),
        definition_of_done: cleanValue(draft.definition_of_done),
        constraints: cleanValue(draft.constraints),
        acceptance_criteria: cleanValue(draft.build.acceptance_criteria),
        non_goals: cleanValue(draft.build.non_goals),
        repo_or_product_target: cleanValue(draft.build.repo_or_product_target),
      },
    };
  }

  private previewResponse(
    chatId: string,
    draft: CutlineTelegramDraft,
    preview: DraftPreview,
    autoPreview = false,
  ): IntakeResponse {
    return {
      ok: true,
      action: 'preview',
      chatId,
      state: draft.state,
      readyScore: draft.ready_score,
      draftPath: buildDraftPath(this.workspaceRoot, chatId),
      preview,
      autoPreview,
    };
  }

  private latestSourceBody(draft: CutlineTelegramDraft): string {
    const latest = [...draft.source_messages]
      .reverse()
      .find((message) => message.kind === 'text' || message.kind === 'transcript');
    return latest?.text || cleanValue(draft.build.requested_change) || cleanValue(draft.title) || 'Telegram build request';
  }

  private latestTranscript(draft: CutlineTelegramDraft): string | undefined {
    return [...draft.source_messages].reverse().find((message) => message.kind === 'transcript')?.text;
  }
}
