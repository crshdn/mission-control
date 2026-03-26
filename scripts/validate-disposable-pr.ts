import fs from 'fs';
import path from 'path';
import {
  loadLocalEnv,
  request,
  waitFor,
  assert,
  ensureDir,
  runCommand,
} from './_shared';

function writeSeedRepo(seedDir: string) {
  ensureDir(seedDir);
  fs.writeFileSync(
    path.join(seedDir, 'README.md'),
    [
      '# Mission Control Disposable PR Validation',
      '',
      'This repository exists only to validate the supervised Mission Control repo-backed PR flow.',
      '',
      'Generated automatically during local validation.',
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
      '  <title>Mission Control Disposable Validation</title>',
      '  <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5} .card{border:1px solid #ddd;border-radius:12px;padding:16px}</style>',
      '</head>',
      '<body>',
      '  <main class="card">',
      '    <h1>Disposable PR Validation</h1>',
      '    <p>This tiny site is used to validate Mission Control&apos;s supervised repo-backed PR flow.</p>',
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

function ensureDisposableRepo(projectsPath: string): { owner: string; repo: string; repoUrl: string; seedDir: string } {
  const owner = runCommand('gh api user -q .login');
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const repo = `mission-control-disposable-pr-validation-${dateStamp}`;
  const fullName = `${owner}/${repo}`;
  const seedDir = path.join(projectsPath, '.validation-seed', repo);
  ensureDir(seedDir);

  const exists = (() => {
    try {
      runCommand(`gh repo view ${fullName} --json name`);
      return true;
    } catch {
      return false;
    }
  })();

  writeSeedRepo(seedDir);

  if (!fs.existsSync(path.join(seedDir, '.git'))) {
    runCommand('git init -b main', seedDir);
    runCommand('git config user.name "Mission Control Validator"', seedDir);
    runCommand('git config user.email "validator@local.invalid"', seedDir);
  }

  runCommand('git add -A', seedDir);
  try {
    runCommand('git commit -m "Initial disposable validation seed"', seedDir);
  } catch {
    // no-op when nothing changed
  }

  if (!exists) {
    runCommand(`gh repo create ${fullName} --private --source . --remote origin --push`, seedDir);
  } else {
    const remotes = runCommand('git remote', seedDir);
    if (!remotes.split('\n').includes('origin')) {
      runCommand(`git remote add origin https://github.com/${fullName}.git`, seedDir);
    }
    runCommand('git push -u origin main', seedDir);
  }

  return {
    owner,
    repo,
    repoUrl: `https://github.com/${fullName}.git`,
    seedDir,
  };
}

async function runPlanning(baseUrl: string, taskId: string): Promise<void> {
  await request(baseUrl, `/api/tasks/${taskId}/planning`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  let answered = 0;
  let nonQuestionUpdates = 0;

  while (true) {
    const update = await waitFor(
      'planning poll update',
      () => request(baseUrl, `/api/tasks/${taskId}/planning/poll`),
      (value: any) => Boolean(value?.hasUpdates),
      120_000,
      1_500,
    );

    if (update.complete) break;
    if (update.dispatchError) {
      throw new Error(`Planning dispatch error: ${update.dispatchError}`);
    }

    const question = update.currentQuestion;
    if (!question?.options?.length) {
      nonQuestionUpdates += 1;
      if (nonQuestionUpdates > 8) {
        throw new Error('Planner kept returning non-question updates without completion');
      }
      continue;
    }

    nonQuestionUpdates = 0;

    const chosenOption = question.options.find((option: { id?: string }) => option.id !== 'other') || question.options[0];
    await request(baseUrl, `/api/tasks/${taskId}/planning/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer: chosenOption.label || chosenOption.id || 'Continue' }),
    });
    answered += 1;

    if (answered > 8) {
      throw new Error('Planning exceeded 8 automated answers');
    }
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const { missionControlUrl, projectsPath } = loadLocalEnv(repoRoot);
  const baseUrl = missionControlUrl;

  runCommand('gh auth status');
  const disposableRepo = ensureDisposableRepo(projectsPath);

  const product = await request(baseUrl, '/api/products', {
    method: 'POST',
    body: JSON.stringify({
      name: `Disposable PR Validation ${new Date().toISOString()}`,
      description: 'Disposable private product used to validate Mission Control supervised PR creation.',
      repo_url: disposableRepo.repoUrl,
      product_program: [
        '# Product Program',
        'Focus on small, safe UI improvements to the disposable validation site.',
        'Prefer changes that are easy to inspect in a pull request.',
      ].join('\n'),
      build_mode: 'plan_first',
      default_branch: 'main',
      workspace_id: 'default',
    }),
  });
  const productId = product.id as string;
  assert(productId, 'Product creation did not return an id');

  await request(baseUrl, `/api/products/${productId}/research/run`, {
    method: 'POST',
    body: JSON.stringify({ chainIdeation: false }),
  });

  const researchCycles = await waitFor(
    'research completion',
    () => request(baseUrl, `/api/products/${productId}/research/cycles`),
    (cycles: any[]) =>
      Array.isArray(cycles) &&
      cycles.length > 0 &&
      ['completed', 'failed', 'interrupted'].includes(cycles[0].status),
    300_000,
  );
  assert(researchCycles[0].status === 'completed', `Research failed: ${researchCycles[0].status}`);

  await request(baseUrl, `/api/products/${productId}/ideation/run`, {
    method: 'POST',
    body: JSON.stringify({ cycle_id: researchCycles[0].id }),
  });

  const ideationCycles = await waitFor(
    'ideation completion',
    () => request(baseUrl, `/api/products/${productId}/ideation/cycles`),
    (cycles: any[]) =>
      Array.isArray(cycles) &&
      cycles.length > 0 &&
      ['completed', 'failed', 'interrupted'].includes(cycles[0].status),
    300_000,
  );
  assert(ideationCycles[0].status === 'completed', `Ideation failed: ${ideationCycles[0].status}`);

  let deck = await request(baseUrl, `/api/products/${productId}/swipe/deck`);
  if (!Array.isArray(deck) || deck.length === 0) {
    await request(baseUrl, `/api/products/${productId}/ideas`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Add an autopilot validation banner to the disposable landing page',
        description: 'Update the disposable validation site so the resulting PR has an obvious, human-readable product change.',
        category: 'feature',
        complexity: 'S',
        impact_score: 5,
        feasibility_score: 10,
        technical_approach: 'Edit index.html and README.md in the disposable repo to include a validation banner and PR trace note.',
        tags: ['validation', 'disposable', 'ui'],
      }),
    });
    deck = await request(baseUrl, `/api/products/${productId}/swipe/deck`);
  }

  assert(Array.isArray(deck) && deck.length > 0, 'Expected at least one idea to approve');
  const approvedIdea = deck[0];

  const swipeResult = await request(baseUrl, `/api/products/${productId}/swipe`, {
    method: 'POST',
    body: JSON.stringify({
      idea_id: approvedIdea.id,
      action: 'approve',
      notes: 'Disposable PR validation approval',
    }),
  });
  const taskId = swipeResult.task?.id as string;
  assert(taskId, 'Approved idea did not create a task');

  await runPlanning(baseUrl, taskId);

  const taskAfterPlanning = await waitFor(
    'task assignment after planning',
    () => request(baseUrl, `/api/tasks/${taskId}`),
    (task: any) => Boolean(task?.assigned_agent_id) && ['assigned', 'in_progress', 'inbox'].includes(task?.status),
  );
  if (taskAfterPlanning.status === 'inbox' || taskAfterPlanning.planning_dispatch_error) {
    await request(baseUrl, `/api/tasks/${taskId}/planning/retry-dispatch`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  const workspace = await waitFor(
    'workspace creation',
    () => request(baseUrl, `/api/tasks/${taskId}/workspace`),
    (status: any) => Boolean(status?.exists && status?.path),
    120_000,
    2_000,
  );
  const workspacePath = workspace.path as string;
  assert(fs.existsSync(workspacePath), `Workspace path does not exist: ${workspacePath}`);

  const indexPath = path.join(workspacePath, 'index.html');
  const readmePath = path.join(workspacePath, 'README.md');
  assert(fs.existsSync(indexPath), `Expected workspace file missing: ${indexPath}`);
  assert(fs.existsSync(readmePath), `Expected workspace file missing: ${readmePath}`);

  const marker = `Mission Control validated this supervised PR flow on ${new Date().toISOString()} for task ${taskId}.`;
  const indexContents = fs.readFileSync(indexPath, 'utf-8');
  if (!indexContents.includes(marker)) {
    fs.writeFileSync(
      indexPath,
      indexContents.replace(
        '</main>',
        `    <section class="card" style="margin-top:16px"><h2>Autopilot Validation</h2><p>${marker}</p></section>\n  </main>`,
      ),
    );
  }

  const readmeContents = fs.readFileSync(readmePath, 'utf-8');
  if (!readmeContents.includes(marker)) {
    fs.writeFileSync(readmePath, `${readmeContents.trim()}\n\n## Latest Validation\n\n${marker}\n`);
  }

  fs.writeFileSync(path.join(workspacePath, 'autopilot-validation.txt'), `${marker}\n`);

  await request(baseUrl, `/api/tasks/${taskId}/activities`, {
    method: 'POST',
    body: JSON.stringify({
      activity_type: 'completed',
      message: `Validation script updated index.html and README.md in ${workspacePath}`,
      agent_id: taskAfterPlanning.assigned_agent_id,
    }),
  });

  await request(baseUrl, `/api/tasks/${taskId}/deliverables`, {
    method: 'POST',
    body: JSON.stringify({
      deliverable_type: 'file',
      title: 'Validation landing page',
      path: indexPath,
      description: 'Disposable repo landing page updated during supervised PR validation.',
    }),
  });

  await request(baseUrl, `/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  });

  const mergedTask = await waitFor(
    'pull request creation',
    () => request(baseUrl, `/api/tasks/${taskId}`),
    (task: any) => Boolean(task?.merge_pr_url || task?.pr_url || task?.merge_status === 'pr_created'),
    120_000,
    2_500,
  );

  const prUrl = mergedTask.pr_url || mergedTask.merge_pr_url;
  assert(prUrl, 'Task completed without a PR URL');

  const prView = runCommand(`gh pr view ${prUrl} --json url,state,headRefName,baseRefName`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        repo: `${disposableRepo.owner}/${disposableRepo.repo}`,
        repoUrl: disposableRepo.repoUrl,
        seedDir: disposableRepo.seedDir,
        productId,
        ideaId: approvedIdea.id,
        taskId,
        workspacePath,
        workspaceStrategy: workspace.strategy,
        branch: workspace.branch,
        prUrl,
        pr: JSON.parse(prView),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[validation] failed:', error);
  process.exitCode = 1;
});
