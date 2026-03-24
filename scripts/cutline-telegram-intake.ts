import fs from 'fs';
import os from 'os';
import path from 'path';
import { assert, ensureDir, loadLocalEnv, request } from './_shared';

type IntakeLane = 'signal' | 'line_lab' | 'build';
type BuildSubmissionMode = 'task' | 'idea';

interface CliOptions {
  command?: string;
  chatId?: string;
  text?: string;
  transcript?: string;
  lane?: IntakeLane;
  confirm?: boolean;
  buildMode?: BuildSubmissionMode;
  product?: string;
  title?: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
}

interface ProductRow {
  id: string;
  name: string;
  workspace_id: string;
  repo_url?: string | null;
  default_branch?: string | null;
}

interface AgentRow {
  id: string;
  name: string;
  is_master: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    const hasValue = typeof next === 'string' && !next.startsWith('--');

    switch (key) {
      case 'chat':
        options.chatId = hasValue ? next : undefined;
        if (hasValue) index += 1;
        break;
      case 'text':
        options.text = hasValue ? next : undefined;
        if (hasValue) index += 1;
        break;
      case 'transcript':
        options.transcript = hasValue ? next : undefined;
        if (hasValue) index += 1;
        break;
      case 'lane':
        options.lane = normalizeLane(hasValue ? next : undefined);
        if (hasValue) index += 1;
        break;
      case 'confirm':
        options.confirm = true;
        break;
      case 'build-mode':
        options.buildMode = hasValue && (next === 'task' || next === 'idea') ? next : undefined;
        if (hasValue) index += 1;
        break;
      case 'product':
        options.product = hasValue ? next : undefined;
        if (hasValue) index += 1;
        break;
      case 'title':
        options.title = hasValue ? next : undefined;
        if (hasValue) index += 1;
        break;
      default:
        throw new Error(`Unknown flag: --${key}`);
    }
  }

  options.command = positional[0];
  return options;
}

function normalizeLane(value?: string): IntakeLane | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (cleaned === 'signal') return 'signal';
  if (cleaned === 'line_lab' || cleaned === 'line') return 'line_lab';
  if (cleaned === 'build') return 'build';
  return undefined;
}

function defaultChatId(): string | undefined {
  if (process.env.CUTLINE_DEFAULT_CHAT_ID?.trim()) {
    return process.env.CUTLINE_DEFAULT_CHAT_ID.trim();
  }

  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  if (!fs.existsSync(configPath)) return undefined;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
    channels?: { telegram?: { allowFrom?: string[] } };
  };
  return config.channels?.telegram?.allowFrom?.[0];
}

async function resolveCutlineWorkspace(baseUrl: string): Promise<WorkspaceRow> {
  const workspaces = (await request(baseUrl, '/api/workspaces')) as WorkspaceRow[];
  const workspace = workspaces.find((entry) => entry.name === 'Cutline');
  if (!workspace) {
    throw new Error('Cutline workspace not found in Mission Control');
  }
  return workspace;
}

async function resolveAvery(baseUrl: string, workspaceId: string): Promise<AgentRow | undefined> {
  const agents = (await request(
    baseUrl,
    `/api/agents?workspace_id=${encodeURIComponent(workspaceId)}`,
  )) as AgentRow[];
  return agents.find((agent) => agent.name === 'Avery') || agents.find((agent) => agent.is_master);
}

async function resolveProductByName(baseUrl: string, workspaceId: string, target: string): Promise<ProductRow> {
  const products = (await request(
    baseUrl,
    `/api/products?workspace_id=${encodeURIComponent(workspaceId)}`,
  )) as ProductRow[];
  const cleanedTarget = target.trim().toLowerCase();
  const match = products.find((product) => product.id === target || product.name.trim().toLowerCase() === cleanedTarget);

  if (!match) {
    const validTargets = products.map((product) => product.name).sort().join(', ') || 'none';
    throw new Error(`Product not found in Cutline workspace: ${target}. Valid targets: ${validTargets}`);
  }

  return match;
}

function inferTitle(text: string, lane: IntakeLane, explicitTitle?: string): string {
  if (explicitTitle?.trim()) return explicitTitle.trim();
  const firstSentence = text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || text.trim();
  const trimmed = firstSentence.replace(/^[-*]\s*/, '').slice(0, 90);
  if (trimmed) return trimmed;
  return lane === 'build' ? 'Telegram build request' : `Telegram ${lane} request`;
}

function buildDescription(options: {
  lane: IntakeLane;
  body: string;
  chatId: string;
  transcript?: string;
  product?: ProductRow;
}): string {
  const sections = [
    `Lane: ${options.lane}`,
    `Telegram chat: ${options.chatId}`,
    options.product ? `Target product: ${options.product.name}` : undefined,
    '',
    '## Request',
    options.body.trim(),
  ].filter(Boolean);

  if (options.transcript?.trim()) {
    sections.push('', '## Transcript', options.transcript.trim());
  }

  return sections.join('\n');
}

function notePathFor(title: string): string {
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'telegram-intake';
  return path.join(
    '/Users/jordan/.openclaw/workspace/obsidian/Cutline Vault/99-Inbox/telegram-submissions',
    `${stamp}-${slug}.md`,
  );
}

function writeTelegramNote(notePath: string, fields: {
  title: string;
  lane: IntakeLane;
  buildMode?: BuildSubmissionMode;
  chatId: string;
  text: string;
  transcript?: string;
  entityId?: string;
  entityType?: 'task' | 'idea';
  productName?: string;
}): void {
  ensureDir(path.dirname(notePath));
  const lines = [
    `# ${fields.title}`,
    '',
    `- Lane: ${fields.lane}`,
    `- Chat: ${fields.chatId}`,
    fields.buildMode ? `- Build mode: ${fields.buildMode}` : undefined,
    fields.productName ? `- Product: ${fields.productName}` : undefined,
    fields.entityType && fields.entityId ? `- Mission Control ${fields.entityType}: ${fields.entityId}` : undefined,
    `- Captured: ${new Date().toISOString()}`,
    '',
    '## Request',
    fields.text.trim(),
    fields.transcript?.trim() ? '' : undefined,
    fields.transcript?.trim() ? '## Transcript' : undefined,
    fields.transcript?.trim() ? fields.transcript.trim() : undefined,
    '',
  ].filter(Boolean);
  fs.writeFileSync(notePath, lines.join('\n'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== 'submit') {
    throw new Error('Usage: tsx scripts/cutline-telegram-intake.ts submit --lane <signal|line_lab|build> --text "..." [--confirm]');
  }

  const repoRoot = path.resolve(__dirname, '..');
  const { missionControlUrl } = loadLocalEnv(repoRoot);
  const baseUrl = missionControlUrl;
  const chatId = options.chatId || defaultChatId();
  const lane = options.lane;
  const body = options.text || options.transcript;

  assert(chatId, 'No Telegram chat id available. Pass --chat or set CUTLINE_DEFAULT_CHAT_ID.');
  assert(lane, 'Lane is required: --lane signal|line_lab|build');
  assert(body?.trim(), 'Provide --text or --transcript');

  const workspace = await resolveCutlineWorkspace(baseUrl);
  const avery = await resolveAvery(baseUrl, workspace.id);
  const title = inferTitle(body!, lane, options.title);
  const buildMode = lane === 'build' ? options.buildMode || 'task' : undefined;
  const product = lane === 'build'
    ? await resolveProductByName(baseUrl, workspace.id, options.product || 'Mission Control')
    : undefined;

  const description = buildDescription({
    lane,
    body: body!,
    chatId,
    transcript: options.transcript && options.text ? options.transcript : undefined,
    product,
  });
  const notePath = notePathFor(title);

  if (!options.confirm) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          preview: true,
          title,
          lane,
          buildMode,
          workspace: workspace.name,
          product: product?.name || null,
          notePath,
        },
        null,
        2,
      ),
    );
    return;
  }

  let entityType: 'task' | 'idea';
  let entityId: string;

  if (lane === 'build' && buildMode === 'idea') {
    assert(product, 'Build-to-idea requires a target product');
    const idea = await request(baseUrl, `/api/products/${product.id}/ideas`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        category: 'operations',
        complexity: 'S',
        impact_score: 6,
        feasibility_score: 8,
        technical_approach: 'Captured from Telegram intake and routed into Mission Control.',
        tags: ['telegram', 'cutline', 'intake'],
      }),
    });
    entityType = 'idea';
    entityId = idea.id;
  } else {
    const task = await request(baseUrl, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        workspace_id: workspace.id,
        product_id: product?.id || null,
        created_by_agent_id: avery?.id || null,
        status: 'inbox',
        priority: lane === 'build' ? 'high' : 'normal',
        repo_url: product?.repo_url || undefined,
        repo_branch: product?.default_branch || undefined,
      }),
    });
    entityType = 'task';
    entityId = task.id;
  }

  writeTelegramNote(notePath, {
    title,
    lane,
    buildMode,
    chatId,
    text: body!,
    transcript: options.transcript && options.text ? options.transcript : undefined,
    entityType,
    entityId,
    productName: product?.name,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        entityType,
        entityId,
        lane,
        buildMode,
        product: product?.name || null,
        notePath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[cutline-telegram-intake] failed:', error);
  process.exitCode = 1;
});
