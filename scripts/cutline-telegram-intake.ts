import fs from 'fs';
import os from 'os';
import path from 'path';
import { assert, ensureDir, loadLocalEnv, request } from './_shared';
import {
  type AgentRow,
  type BuildSubmissionMode,
  CutlineTelegramIntakeService,
  type IntakeLane,
  type MissionControlApi,
  type ProductRow,
  type WorkspaceRow,
} from '../src/lib/cutline-telegram-intake';

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
  previewRevision?: number;
  help?: boolean;
}

interface ProbeResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
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
      case 'help':
        options.help = true;
        break;
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
      case 'preview-revision':
        options.previewRevision = hasValue ? Number.parseInt(next, 10) : undefined;
        if (hasValue) index += 1;
        break;
      default:
        throw new Error(`Unknown flag: --${key}`);
    }
  }

  if (positional[0] === 'help') {
    options.help = true;
  }
  options.command = positional[0];
  return options;
}

function printHelp(): void {
  console.log(
    [
      'Cutline Telegram Intake',
      '',
      'Usage:',
      '  npm run cutline:telegram -- doctor',
      '  npm run cutline:telegram -- message --chat <id> --text "..."',
      '  npm run cutline:telegram -- preview --chat <id>',
      '  npm run cutline:telegram -- confirm --chat <id> --preview-revision <n> [--build-mode idea|task]',
      '  npm run cutline:telegram -- cancel --chat <id>',
      '  npm run cutline:telegram -- submit --lane build --chat <id> --text "structured request" [--confirm] [--build-mode idea|task]',
      '',
      'Behavior:',
      '  - message: wrapper-facing conversational refinement for Telegram build requests',
      '  - preview: render the current draft preview if the idea gate passes',
      '  - confirm: submit the latest preview revision into Mission Control, then export the vault note',
      '  - cancel: close the active draft without writing to Mission Control',
      '  - submit: repo-local convenience path; without --confirm it previews, with --confirm it confirms the fresh preview revision',
      '  - doctor: checks whether the local Mission Control API is reachable and authenticated',
      '',
      'Important:',
      '  - build lane only',
      '  - nothing writes to Mission Control until the build draft passes the readiness gate',
      '  - task mode only succeeds when the stronger repo-backed task gate passes; otherwise the flow safely falls back to idea preview',
      '',
      'Flags:',
      '  --chat "..."',
      '  --text "..." or --transcript "..."',
      '  --build-mode idea|task',
      '  --product "Mission Control"',
      '  --title "..."',
      '  --preview-revision <n>',
    ].join('\n'),
  );
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

async function probe(baseUrl: string, pathname: string): Promise<ProbeResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (process.env.MC_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.MC_API_TOKEN}`;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${pathname}`, {
      headers,
    });
    const text = await response.text();
    let body: unknown = null;

    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeTelegramNote(notePath: string, fields: {
  title: string;
  lane: IntakeLane;
  buildMode?: BuildSubmissionMode;
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
    `- Source: Telegram`,
    `- Lane: ${fields.lane}`,
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

async function runDoctor(baseUrl: string): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..');
  const health = await probe(baseUrl, '/api/health');
  const workspaces = await probe(baseUrl, '/api/workspaces');

  console.log(
    JSON.stringify(
      {
        ok: health.ok && workspaces.ok,
        missionControlUrl: baseUrl,
        repoRoot,
        workspaceRoot: path.resolve(repoRoot, '..'),
        apiTokenPresent: Boolean(process.env.MC_API_TOKEN),
        defaultChatId: defaultChatId() || null,
        health,
        workspaces: {
          ...workspaces,
          workspaceCount: Array.isArray(workspaces.body) ? workspaces.body.length : undefined,
        },
      },
      null,
      2,
    ),
  );
}

function printRecoveryHint(baseUrl: string): void {
  console.error('Quick recovery steps:');
  console.error(`  1. Start Mission Control locally: cd ${path.resolve(__dirname, '..')} && npm run dev`);
  console.error(`  2. Check the local API path: npm run cutline:telegram -- doctor`);
  console.error(`  3. Confirm your target URL: ${baseUrl}`);
  console.error('  4. See examples: npm run cutline:telegram -- --help');
}

function buildApi(baseUrl: string): MissionControlApi {
  return {
    async listWorkspaces() {
      return (await request(baseUrl, '/api/workspaces')) as WorkspaceRow[];
    },
    async listAgents(workspaceId: string) {
      return (await request(
        baseUrl,
        `/api/agents?workspace_id=${encodeURIComponent(workspaceId)}`,
      )) as AgentRow[];
    },
    async listProducts(workspaceId: string) {
      return (await request(
        baseUrl,
        `/api/products?workspace_id=${encodeURIComponent(workspaceId)}`,
      )) as ProductRow[];
    },
    async createIdea(productId: string, payload: Record<string, unknown>) {
      return request(baseUrl, `/api/products/${productId}/ideas`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }) as Promise<{ id: string }>;
    },
    async createTask(payload: Record<string, unknown>) {
      return request(baseUrl, '/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      }) as Promise<{ id: string }>;
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.command) {
    printHelp();
    return;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const workspaceRoot = path.resolve(repoRoot, '..');
  const { missionControlUrl } = loadLocalEnv(repoRoot);
  const baseUrl = missionControlUrl;

  if (options.command === 'doctor') {
    await runDoctor(baseUrl);
    return;
  }

  const chatId = options.chatId || defaultChatId();
  assert(chatId, 'No Telegram chat id available. Pass --chat or set CUTLINE_DEFAULT_CHAT_ID.');

  const service = new CutlineTelegramIntakeService({
    workspaceRoot,
    missionControlApi: buildApi(baseUrl),
    writeNote: (payload) => writeTelegramNote(payload.notePath, payload),
  });

  if (options.command === 'message') {
    const result = await service.handleMessage({
      chatId,
      text: options.text,
      transcript: options.transcript,
      title: options.title,
      product: options.product,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.command === 'preview') {
    const result = await service.previewDraft(chatId);
    if (result.ok && result.action === 'preview') {
      console.log('--- BUILD REQUEST PREVIEW ---');
      console.log(`Title: ${result.preview.title}`);
      console.log(`Product: ${result.preview.product}`);
      console.log(`Ready Score: ${result.preview.readyScore}%`);
      console.log(`Missing Fields: ${result.preview.missingFields.join(', ') || 'None'}`);
      console.log('\nFields:');
      for (const [key, val] of Object.entries(result.preview.fields)) {
        if (val) console.log(`${key}: ${val}`);
      }
      console.log('-----------------------------');
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  if (options.command === 'cancel') {
    const result = await service.cancelDraft(chatId);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.command === 'confirm') {
    assert(Number.isInteger(options.previewRevision), 'Confirm requires --preview-revision <n>.');
    const result = await service.confirmDraft({
      chatId,
      previewRevision: options.previewRevision as number,
      buildMode: options.buildMode,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.command !== 'submit') {
    throw new Error(
      'Usage: tsx scripts/cutline-telegram-intake.ts <doctor|message|preview|confirm|cancel|submit> [flags]',
    );
  }

  assert(options.lane === 'build', 'The Cutline Telegram intake only supports --lane build in this v1 bridge.');

  const result = await service.submit({
    chatId,
    text: options.text,
    transcript: options.transcript,
    title: options.title,
    product: options.product,
    buildMode: options.confirm ? options.buildMode || 'idea' : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[cutline-telegram-intake] failed:', error);
  const repoRoot = path.resolve(__dirname, '..');
  const { missionControlUrl } = loadLocalEnv(repoRoot);
  printRecoveryHint(missionControlUrl);
  process.exitCode = 1;
});
