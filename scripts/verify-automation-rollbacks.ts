import fs from 'fs';
import http from 'http';
import path from 'path';
import net from 'net';
import crypto from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import { ensureDir, loadLocalEnv, request, runCommand, waitFor, assert } from './_shared';

type ScenarioStatus = 'pass' | 'blocked' | 'fail';

type ScenarioResult = {
  name: string;
  status: ScenarioStatus;
  summary: string;
  details: string[];
  evidence?: Record<string, unknown>;
};

type RepoProfile =
  | {
      mode: 'real';
      owner: string;
      repo: string;
      fullName: string;
      repoUrl: string;
      mergedPrUrl: string;
      mergeCommitSha: string;
      localSeedDir: string;
    }
  | {
      mode: 'fake';
      owner: string;
      repo: string;
      fullName: string;
      repoUrl: string;
      mergedPrUrl: string;
      mergeCommitSha: string;
      localSeedDir: string;
    };

type HealthServer = {
  baseUrl: string;
  close: () => Promise<void>;
  counts: {
    ok: number;
    fail: number;
  };
};

type MissionControlServer = {
  baseUrl: string;
  port: number;
  child: ChildProcess;
  stop: () => Promise<void>;
};

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFreePort(startPort = 4100): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(false));
      server.listen({ host: '127.0.0.1', port }, () => {
        server.close(() => resolve(true));
      });
    });
    if (available) return port;
  }

  throw new Error('Unable to find a free port for the verifier server');
}

function copyFileIfExists(source: string, target: string): void {
  if (!fs.existsSync(source)) return;
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function copyDatabaseSnapshot(repoRoot: string, tempDbPath: string): void {
  const sourceDb = path.join(repoRoot, process.env.DATABASE_PATH || 'mission-control.db');
  assert(fs.existsSync(sourceDb), `Source database missing: ${sourceDb}`);

  ensureDir(path.dirname(tempDbPath));
  fs.copyFileSync(sourceDb, tempDbPath);
  copyFileIfExists(`${sourceDb}-wal`, `${tempDbPath}-wal`);
  copyFileIfExists(`${sourceDb}-shm`, `${tempDbPath}-shm`);
}

function resolveGitHubToken(repoRoot: string): string | null {
  if (process.env.GITHUB_TOKEN?.trim()) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN?.trim()) return process.env.GH_TOKEN.trim();

  try {
    const token = runCommand('gh auth token', repoRoot);
    return token.trim() || null;
  } catch {
    return null;
  }
}

function resolveGitHubOwner(repoRoot: string): string | null {
  try {
    return runCommand('gh api user -q .login', repoRoot).trim();
  } catch {
    return null;
  }
}

function writeDisposableRepoSeed(seedDir: string): void {
  ensureDir(seedDir);
  fs.writeFileSync(
    path.join(seedDir, 'README.md'),
    [
      '# Mission Control Automation Verification',
      '',
      'This disposable repository exists only to verify Mission Control automation tiers and rollback behavior.',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(seedDir, 'index.html'),
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      '  <title>Automation Verification</title>',
      '  <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5}</style>',
      '</head>',
      '<body>',
      '  <main>',
      '    <h1>Automation Verification</h1>',
      '    <p>Mission Control verifies webhook monitoring, rollback, and tier restoration against this disposable repo.</p>',
      '  </main>',
      '</body>',
      '</html>',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(seedDir, '.gitignore'),
    ['node_modules', '.DS_Store', 'dist', 'build', '.next', ''].join('\n'),
  );
}

function hashFallbackSha(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 40);
}

function createFakeRepoProfile(): RepoProfile {
  const owner = 'local';
  const repo = `automation-verifier-${nowStamp().toLowerCase()}`;
  const fullName = `${owner}/${repo}`;
  const mergeCommitSha = hashFallbackSha(fullName);

  return {
    mode: 'fake',
    owner,
    repo,
    fullName,
    repoUrl: `https://github.com/${fullName}.git`,
    mergedPrUrl: `https://github.com/${fullName}/pull/1`,
    mergeCommitSha,
    localSeedDir: path.join('/tmp', repo),
  };
}

function createWebhookSignature(secret: string, body: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function startHealthServer(): Promise<HealthServer> {
  const counts = { ok: 0, fail: 0 };
  const port = await findFreePort(5100);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${port}`}`);

    if (url.pathname === '/ok') {
      counts.ok += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ healthy: true, status: 'ok' }));
      return;
    }

    if (url.pathname === '/fail') {
      counts.fail += 1;
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ healthy: false, error: 'intentional verifier failure' }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    counts,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function startMissionControlServer(repoRoot: string): Promise<{ server: MissionControlServer; tempDbPath: string }> {
  const tempDbPath = path.join(repoRoot, '.tmp', `automation-verifier-${nowStamp()}.db`);
  copyDatabaseSnapshot(repoRoot, tempDbPath);

  const ghToken = resolveGitHubToken(repoRoot);
  const env = {
    ...process.env,
    DATABASE_PATH: path.relative(repoRoot, tempDbPath),
    ...(ghToken ? { GH_TOKEN: ghToken, GITHUB_TOKEN: ghToken } : {}),
  };

  const maxAttempts = 5;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const port = await findFreePort(4300);
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn('npx', ['next', 'dev', '--turbo', '-p', String(port), '--hostname', '127.0.0.1'], {
      cwd: repoRoot,
      env: {
        ...env,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let exitedEarly: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    child.once('exit', (code, signal) => {
      exitedEarly = { code, signal };
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(`[mc:${port}] ${chunk.toString()}`);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[mc:${port}:err] ${chunk.toString()}`);
    });

    const server: MissionControlServer = {
      baseUrl,
      port,
      child,
      stop: async () => {
        if (child.exitCode === null && !child.killed) {
          child.kill('SIGTERM');
          await sleep(2_000);
          if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
        }
      },
    };

    try {
      await waitFor(
        'Mission Control server readiness',
        async () => {
          if (exitedEarly) {
            throw new Error(`Mission Control dev server exited before readiness (code=${exitedEarly.code}, signal=${exitedEarly.signal ?? 'null'})`);
          }

          try {
            return await request(baseUrl, '/api/health', { method: 'GET' });
          } catch {
            return null;
          }
        },
        (value) => Boolean(value && typeof value === 'object'),
        180_000,
        1_500,
      );

      return { server, tempDbPath };
    } catch (error) {
      lastError = error;
      await server.stop().catch(() => {});
      if (attempt === maxAttempts) break;
      await sleep(1_000);
    }
  }

  throw new Error(
    `Unable to start Mission Control server after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function prepareRepoProfile(repoRoot: string): Promise<RepoProfile> {
  const token = resolveGitHubToken(repoRoot);
  const owner = resolveGitHubOwner(repoRoot);

  if (!token || !owner) {
    return createFakeRepoProfile();
  }

  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const repo = `mission-control-automation-verifier-${dateStamp}-${nowStamp().slice(-6).toLowerCase()}`;
  const fullName = `${owner}/${repo}`;
  const seedDir = path.join(repoRoot, '.tmp', 'automation-verifier-repos', repo);
  ensureDir(seedDir);
  writeDisposableRepoSeed(seedDir);

  if (!fs.existsSync(path.join(seedDir, '.git'))) {
    runCommand('git init -b main', seedDir);
    runCommand('git config user.name "Mission Control Verifier"', seedDir);
    runCommand('git config user.email "verifier@local.invalid"', seedDir);
  }

  runCommand('git add -A', seedDir);
  try {
    runCommand('git commit -m "Initial disposable verifier seed"', seedDir);
  } catch {
    // Nothing to commit on subsequent runs.
  }

  const repoExists = (() => {
    try {
      runCommand(`gh repo view ${fullName} --json name`, seedDir);
      return true;
    } catch {
      return false;
    }
  })();

  if (!repoExists) {
    runCommand(`gh repo create ${fullName} --private --source . --remote origin --push`, seedDir);
  } else {
    const remotes = runCommand('git remote', seedDir);
    if (!remotes.split('\n').includes('origin')) {
      runCommand(`git remote add origin https://github.com/${fullName}.git`, seedDir);
    }
    runCommand('git push -u origin main', seedDir);
  }

  const featureBranch = `verifier/${nowStamp().toLowerCase()}`;
  runCommand(`git checkout -b ${featureBranch}`, seedDir);
  fs.appendFileSync(path.join(seedDir, 'index.html'), `\n<!-- verifier update ${new Date().toISOString()} -->\n`);
  fs.appendFileSync(path.join(seedDir, 'README.md'), `\n## Verifier Update\nUpdated at ${new Date().toISOString()}\n`);
  runCommand('git add -A', seedDir);
  runCommand('git commit -m "Verifier feature update"', seedDir);
  runCommand(`git push -u origin ${featureBranch}`, seedDir);

  const prUrl = runCommand(
    `gh pr create --title "Verifier automation proof" --body "Disposable PR for automation-tier verification" --base main --head ${featureBranch}`,
    seedDir,
  );
  runCommand(`gh pr merge ${prUrl} --merge --delete-branch`, seedDir);

  const mergedPr = JSON.parse(
    runCommand(`gh pr view ${prUrl} --json url,mergeCommit,number`, seedDir),
  ) as { url: string; mergeCommit?: { oid?: string }; number: number };

  const mergeCommitSha = mergedPr.mergeCommit?.oid || hashFallbackSha(prUrl);

  return {
    mode: 'real',
    owner,
    repo,
    fullName,
    repoUrl: `https://github.com/${fullName}.git`,
    mergedPrUrl: mergedPr.url,
    mergeCommitSha,
    localSeedDir: seedDir,
  };
}

async function updateProduct(baseUrl: string, productId: string, updates: Record<string, unknown>): Promise<void> {
  await request(baseUrl, `/api/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

async function setProductAutomation(
  baseUrl: string,
  productId: string,
  repoUrl: string,
  tier: 'supervised' | 'semi_auto' | 'full_auto',
  healthCheckUrl: string,
): Promise<void> {
  await updateProduct(baseUrl, productId, {
    repo_url: repoUrl,
    settings: JSON.stringify({
      automation_tier: tier,
      health_check_url: healthCheckUrl,
      post_merge_monitor_minutes: 5,
    }),
  });
}

async function triggerGitHubWebhook(
  baseUrl: string,
  event: string,
  payload: Record<string, unknown>,
  webhookSecret?: string,
): Promise<{ status: number; body: any }> {
  const rawBody = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-github-event': event,
  };

  if (webhookSecret) {
    headers['x-hub-signature-256'] = createWebhookSignature(webhookSecret, rawBody);
  }

  const response = await fetch(`${baseUrl}/api/webhooks/github`, {
    method: 'POST',
    headers,
    body: rawBody,
  });

  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text body
  }

  return { status: response.status, body };
}

async function getRollbackState(baseUrl: string, productId: string): Promise<any> {
  return request(baseUrl, `/api/products/${productId}/rollback`, { method: 'GET' });
}

async function getAdminRollbackState(baseUrl: string, productId: string): Promise<any> {
  return request(baseUrl, `/api/admin/rollbacks?product_id=${encodeURIComponent(productId)}`, { method: 'GET' });
}

async function waitForRollbackSettlement(
  baseUrl: string,
  productId: string,
  rollbackId: string,
): Promise<any> {
  return waitFor(
    `rollback settlement ${rollbackId}`,
    async () => getRollbackState(baseUrl, productId),
    (state: any) => {
      const rollback = Array.isArray(state?.rollbacks)
        ? state.rollbacks.find((entry: any) => entry?.id === rollbackId)
        : null;
      return Boolean(rollback && rollback.revert_pr_status && rollback.revert_pr_status !== 'pending');
    },
    60_000,
    1_500,
  );
}

async function createMergedTask(baseUrl: string, productId: string, repoProfile: RepoProfile): Promise<string> {
  const task = await request(baseUrl, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: `Verifier merged PR lookup for ${repoProfile.fullName}`,
      description: 'Creates a task that points to the disposable merged PR so CI-failure rollback lookup has a target.',
      product_id: productId,
      workspace_id: 'default',
      priority: 'normal',
    }),
  });

  assert(task?.id, 'Task creation did not return an id');

  await request(baseUrl, `/api/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      pr_url: repoProfile.mergedPrUrl,
      pr_status: 'merged',
    }),
  });

  return task.id as string;
}

function blockedResult(name: string, summary: string, details: string[], evidence?: Record<string, unknown>): ScenarioResult {
  return { name, status: 'blocked', summary, details, evidence };
}

function passResult(name: string, summary: string, details: string[], evidence?: Record<string, unknown>): ScenarioResult {
  return { name, status: 'pass', summary, details, evidence };
}

function failResult(name: string, summary: string, details: string[], evidence?: Record<string, unknown>): ScenarioResult {
  return { name, status: 'fail', summary, details, evidence };
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const { mcApiToken } = loadLocalEnv(repoRoot);
  assert(mcApiToken, 'MC_API_TOKEN is required for the automation verifier');

  let healthServer: HealthServer | null = null;
  let mcServer: MissionControlServer | null = null;
  let repoProfile: RepoProfile = createFakeRepoProfile();
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim() || undefined;

  const results: ScenarioResult[] = [];

  try {
    healthServer = await startHealthServer();
    const startedServer = await startMissionControlServer(repoRoot);
    mcServer = startedServer.server;
    const server = mcServer; // non-null alias for closures
    try {
      repoProfile = await prepareRepoProfile(repoRoot);
    } catch (error) {
      results.push(blockedResult(
        'GitHub repository setup',
        'Could not create a disposable GitHub repo, so the revert-PR proof will be blocked.',
        [`setupError=${error instanceof Error ? error.message : String(error)}`],
      ));
      repoProfile = createFakeRepoProfile();
    }

    const product = await request(server.baseUrl, '/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Automation Verification ${new Date().toISOString()}`,
        description: 'Disposable product for automation-tier and rollback proof.',
        repo_url: repoProfile.repoUrl,
        product_program: [
          '# Product Program',
          'This product exists only to verify automation tiers and rollback behavior.',
        ].join('\n'),
        build_mode: 'plan_first',
        default_branch: 'main',
        workspace_id: 'default',
      }),
    });
    assert(product?.id, 'Product creation did not return an id');
    const productId = product.id as string;

    const pullRequestWebhook = {
      action: 'closed',
      repository: { full_name: repoProfile.fullName },
      pull_request: {
        html_url: repoProfile.mergedPrUrl,
        merge_commit_sha: repoProfile.mergeCommitSha,
        merged: true,
      },
    };

    const ciFailureWebhook = {
      action: 'completed',
      repository: { full_name: repoProfile.fullName },
      conclusion: 'failure',
      check_suite: {
        head_sha: repoProfile.mergeCommitSha,
        conclusion: 'failure',
      },
    };

    await setProductAutomation(server.baseUrl, productId, repoProfile.repoUrl, 'supervised', `${healthServer.baseUrl}/ok`);
    const supervisedBefore = await getRollbackState(server.baseUrl, productId);
    const supervisedWebhook = await triggerGitHubWebhook(server.baseUrl, 'pull_request', pullRequestWebhook, webhookSecret);
    const supervisedAfter = await getAdminRollbackState(server.baseUrl, productId);
    const supervisedState = await getRollbackState(server.baseUrl, productId);

    if (supervisedWebhook.status !== 200) {
      results.push(failResult(
        'supervised merged webhook',
        'Webhook request itself failed.',
        [`Webhook status: ${supervisedWebhook.status}`],
      ));
    } else if ((supervisedAfter.activeMonitors || []).includes(productId) || (supervisedAfter.rollbacks || []).length !== supervisedBefore.total) {
      results.push(failResult(
        'supervised merged webhook',
        'Supervised mode should not start a monitor or create rollback history.',
        [
          `activeMonitors=${JSON.stringify(supervisedAfter.activeMonitors || [])}`,
          `rollbackTotalBefore=${supervisedBefore.total}`,
          `rollbackTotalAfter=${supervisedAfter.total}`,
        ],
        { webhookResponse: supervisedWebhook.body, rollbackState: supervisedState },
      ));
    } else if (supervisedState.currentTier !== 'supervised') {
      results.push(failResult(
        'supervised merged webhook',
        `Expected tier to stay supervised, got ${supervisedState.currentTier ?? 'null'}.`,
        [`currentTier=${supervisedState.currentTier ?? 'null'}`],
      ));
    } else {
      results.push(passResult(
        'supervised merged webhook',
        'Supervised merge correctly skipped monitor and rollback.',
        ['No active monitor was started and no rollback rows were created.'],
        { webhookResponse: supervisedWebhook.body },
      ));
    }

    await setProductAutomation(server.baseUrl, productId, repoProfile.repoUrl, 'semi_auto', `${healthServer.baseUrl}/ok`);
    const semiBefore = await getRollbackState(server.baseUrl, productId);
    const semiWebhook = await triggerGitHubWebhook(server.baseUrl, 'pull_request', pullRequestWebhook, webhookSecret);
    const semiAdmin = await getAdminRollbackState(server.baseUrl, productId);
    const healthyProbe = await fetch(`${healthServer.baseUrl}/ok`);
    const healthyProbeBody = await healthyProbe.json();
    const semiState = await getRollbackState(server.baseUrl, productId);

    if (semiWebhook.status !== 200) {
      results.push(failResult(
        'semi_auto healthy merge',
        'Webhook request failed.',
        [`Webhook status: ${semiWebhook.status}`],
      ));
    } else if (!(semiAdmin.activeMonitors || []).includes(productId)) {
      results.push(failResult(
        'semi_auto healthy merge',
        'Expected an active post-merge monitor for semi_auto.',
        [`activeMonitors=${JSON.stringify(semiAdmin.activeMonitors || [])}`],
      ));
    } else if (!healthyProbe.ok || healthyProbeBody?.healthy !== true) {
      results.push(failResult(
        'semi_auto healthy merge',
        'Healthy probe endpoint did not return a healthy response.',
        [`healthProbe=${JSON.stringify(healthyProbeBody)}`],
      ));
    } else if (semiAdmin.total !== semiBefore.total) {
      results.push(failResult(
        'semi_auto healthy merge',
        'Healthy merge should not create rollback history.',
        [`rollbackTotalBefore=${semiBefore.total}`, `rollbackTotalAfter=${semiAdmin.total}`],
      ));
    } else if (semiState.currentTier !== 'semi_auto') {
      results.push(failResult(
        'semi_auto healthy merge',
        `Expected tier to remain semi_auto, got ${semiState.currentTier ?? 'null'}.`,
        [`currentTier=${semiState.currentTier ?? 'null'}`],
      ));
    } else {
      results.push(passResult(
        'semi_auto healthy merge',
        'Semi-auto merge started a monitor, passed health, and kept the tier unchanged.',
        ['Active monitor observed and health endpoint returned healthy.'],
        { webhookResponse: semiWebhook.body },
      ));
    }

    const failingBefore = await getRollbackState(server.baseUrl, productId);
    await setProductAutomation(server.baseUrl, productId, repoProfile.repoUrl, 'semi_auto', `${healthServer.baseUrl}/fail`);
    const failingWebhook = await triggerGitHubWebhook(server.baseUrl, 'pull_request', pullRequestWebhook, webhookSecret);
    const failingResult = await waitFor(
      'health failure rollback',
      async () => getRollbackState(server.baseUrl, productId),
      (state: any) => Array.isArray(state.rollbacks) && state.rollbacks.length > failingBefore.total,
      180_000,
      2_500,
    ).catch((error) => ({ error }));

    if ('error' in failingResult) {
      results.push(blockedResult(
        'semi_auto failing health check',
        'Health-failure rollback could not be proven within the verifier timeout.',
        [`timeout=${failingResult.error instanceof Error ? failingResult.error.message : String(failingResult.error)}`],
      ));
    } else {
      let latestRollback = failingResult.rollbacks[0];
      if (latestRollback?.id && latestRollback.revert_pr_status === 'pending') {
        const settledState = await waitForRollbackSettlement(server.baseUrl, productId, latestRollback.id).catch(() => null);
        if (settledState?.rollbacks?.length) {
          latestRollback = settledState.rollbacks[0];
        }
      }
      const failingAdmin = await getAdminRollbackState(server.baseUrl, productId);
      const failingState = await getRollbackState(server.baseUrl, productId);
      const failureHits = healthServer.counts.fail;
      const revertAttempted = Boolean(latestRollback?.revert_pr_url) && latestRollback?.revert_pr_status !== 'failed';

      if (!failureHits || failureHits < 3) {
        results.push(failResult(
          'semi_auto failing health check',
          'The monitor did not reach the 3-failure rollback threshold.',
          [`failureHits=${failureHits}`],
          { rollback: latestRollback, webhookResponse: failingWebhook.body },
        ));
      } else if (!revertAttempted) {
        results.push(blockedResult(
          'semi_auto failing health check',
          'Rollback row was created, but revert PR creation did not complete.',
          [
            `rollbackStatus=${latestRollback?.revert_pr_status ?? 'unknown'}`,
            `rollbackUrl=${latestRollback?.revert_pr_url ?? 'null'}`,
            'This usually means the app process does not have GITHUB_TOKEN/GH_TOKEN or GitHub access.',
          ],
          { rollback: latestRollback, webhookResponse: failingWebhook.body, failureHits },
        ));
      } else if (failingState.currentTier !== 'supervised') {
        results.push(failResult(
          'semi_auto failing health check',
          `Rollback should force tier to supervised, got ${failingState.currentTier ?? 'null'}.`,
          [`currentTier=${failingState.currentTier ?? 'null'}`],
          { rollback: latestRollback, webhookResponse: failingWebhook.body, activeMonitors: failingAdmin.activeMonitors },
        ));
      } else {
        results.push(passResult(
          'semi_auto failing health check',
          'The failing health monitor created a rollback row, attempted a revert PR, and forced the tier to supervised.',
          [`Health failure polls observed: ${failureHits}`],
          { rollback: latestRollback, webhookResponse: failingWebhook.body, failureHits },
        ));
      }
    }

    const mergedTaskId = await createMergedTask(server.baseUrl, productId, repoProfile);
    await updateProduct(server.baseUrl, productId, {
      settings: JSON.stringify({
        automation_tier: 'semi_auto',
        health_check_url: `${healthServer.baseUrl}/ok`,
        post_merge_monitor_minutes: 5,
      }),
    });

    const ciBefore = await getRollbackState(server.baseUrl, productId);
    const ciWebhook = await triggerGitHubWebhook(server.baseUrl, 'check_suite', ciFailureWebhook, webhookSecret);
    const ciAfter = await waitFor(
      'ci failure rollback',
      async () => getRollbackState(server.baseUrl, productId),
      (state: any) => Array.isArray(state.rollbacks) && state.rollbacks.length > ciBefore.total,
      60_000,
      1_500,
    ).catch((error) => ({ error }));

    if ('error' in ciAfter) {
      results.push(blockedResult(
        'CI failure webhook',
        'CI-failure rollback could not be proven within the verifier timeout.',
        [`timeout=${ciAfter.error instanceof Error ? ciAfter.error.message : String(ciAfter.error)}`],
      ));
    } else {
      const latestRollback = ciAfter.rollbacks[0];
      const ciState = await getRollbackState(server.baseUrl, productId);
      const revertAttempted = Boolean(latestRollback?.revert_pr_url) && latestRollback?.revert_pr_status !== 'failed';

      if (!revertAttempted) {
        results.push(blockedResult(
          'CI failure webhook',
          'Rollback row was created, but revert PR creation did not complete.',
          [
            `rollbackStatus=${latestRollback?.revert_pr_status ?? 'unknown'}`,
            `rollbackUrl=${latestRollback?.revert_pr_url ?? 'null'}`,
            'This usually means the app process does not have GITHUB_TOKEN/GH_TOKEN or GitHub access.',
          ],
          { rollback: latestRollback, webhookResponse: ciWebhook.body, mergedTaskId },
        ));
      } else if (ciState.currentTier !== 'supervised') {
        results.push(failResult(
          'CI failure webhook',
          `Expected tier to be forced to supervised, got ${ciState.currentTier ?? 'null'}.`,
          [`currentTier=${ciState.currentTier ?? 'null'}`],
          { rollback: latestRollback, webhookResponse: ciWebhook.body, mergedTaskId },
        ));
      } else {
        results.push(passResult(
          'CI failure webhook',
          'A failing CI webhook created a rollback row, attempted a revert PR, and forced the tier to supervised.',
          [],
          { rollback: latestRollback, webhookResponse: ciWebhook.body, mergedTaskId },
        ));
      }
    }

    const latestRollback = (await getRollbackState(server.baseUrl, productId)).rollbacks?.[0];
    if (!latestRollback?.id) {
      results.push(failResult(
        'rollback acknowledgement',
        'No rollback row was available to acknowledge.',
        ['Rollback state did not include an id.'],
      ));
    } else {
      const ackResponse = await request(server.baseUrl, `/api/products/${productId}/rollback`, {
        method: 'PATCH',
        body: JSON.stringify({
          rollback_id: latestRollback.id,
          restore_tier: 'semi_auto',
        }),
      });

      const ackState = await getRollbackState(server.baseUrl, productId);
      if (ackResponse?.success !== true) {
        results.push(failResult(
          'rollback acknowledgement',
          'Acknowledge PATCH did not return success.',
          [`response=${JSON.stringify(ackResponse)}`],
        ));
      } else if (ackState.currentTier !== 'semi_auto') {
        results.push(failResult(
          'rollback acknowledgement',
          `Expected tier restoration to semi_auto, got ${ackState.currentTier ?? 'null'}.`,
          [`currentTier=${ackState.currentTier ?? 'null'}`],
        ));
      } else {
        results.push(passResult(
          'rollback acknowledgement',
          'Rollback acknowledgement restored the automation tier through the product rollback PATCH.',
          [],
          { response: ackResponse },
        ));
      }
    }

    await setProductAutomation(server.baseUrl, productId, repoProfile.repoUrl, 'full_auto', `${healthServer.baseUrl}/ok`);
    const fullBefore = await getRollbackState(server.baseUrl, productId);
    const fullWebhook = await triggerGitHubWebhook(server.baseUrl, 'pull_request', pullRequestWebhook, webhookSecret);
    const fullAdmin = await getAdminRollbackState(server.baseUrl, productId);
    const fullState = await getRollbackState(server.baseUrl, productId);

    if (fullWebhook.status !== 200) {
      results.push(failResult(
        'full_auto behaves like semi_auto',
        'Webhook request itself failed.',
        [`Webhook status: ${fullWebhook.status}`],
      ));
    } else if (!(fullAdmin.activeMonitors || []).includes(productId)) {
      results.push(failResult(
        'full_auto behaves like semi_auto',
        'Expected full_auto to start the same post-merge monitor path as semi_auto.',
        [`activeMonitors=${JSON.stringify(fullAdmin.activeMonitors || [])}`],
      ));
    } else if (fullAdmin.total !== fullBefore.total) {
      results.push(failResult(
        'full_auto behaves like semi_auto',
        'Healthy full_auto merge should not create rollback history.',
        [`rollbackTotalBefore=${fullBefore.total}`, `rollbackTotalAfter=${fullAdmin.total}`],
      ));
    } else if (fullState.currentTier !== 'full_auto') {
      results.push(failResult(
        'full_auto behaves like semi_auto',
        `Expected tier to remain full_auto, got ${fullState.currentTier ?? 'null'}.`,
        [`currentTier=${fullState.currentTier ?? 'null'}`],
      ));
    } else {
      results.push(passResult(
        'full_auto behaves like semi_auto',
        'Full auto followed the same currently-implemented webhook/monitor behavior as semi_auto.',
        ['No distinct full_auto behavior was observed in the current app.'],
        { webhookResponse: fullWebhook.body },
      ));
    }

    const summary = {
      repositoryMode: repoProfile.mode,
      repo: repoProfile.fullName,
      productId,
      scenarios: results,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (results.some((result) => result.status === 'fail')) {
      process.exitCode = 1;
    } else if (results.some((result) => result.status === 'blocked')) {
      process.exitCode = 1;
    }
  } finally {
    await healthServer?.close().catch(() => {});
    await mcServer?.stop().catch(() => {});
    // Temporary verifier DB and disposable repo seeds are intentionally left in .tmp only if needed for debugging.
  }
}

main().catch((error) => {
  console.error('[automation-verifier] failed:', error);
  process.exitCode = 1;
});
