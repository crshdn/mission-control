/**
 * GitHub Webhook Handler
 *
 * Listens for:
 * - pull_request events (merged PRs) → starts health monitoring
 * - check_suite / check_run events (CI failures) → triggers rollback
 * - status events (commit status failures) → triggers rollback
 *
 * Webhook secret validation via GITHUB_WEBHOOK_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { queryOne, queryAll } from '@/lib/db';
import {
  executeRollback,
  startPostMergeMonitor,
  getProductSettings,
} from '@/lib/rollback';
import { handlePRReviewFix } from '@/lib/pr-review-handler';
import type { Product, Task } from '@/lib/types';
import type { ReviewComment } from '@/lib/pr-review-handler';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifyGitHubSignature(signature: string | null, rawBody: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    // Dev mode — skip validation but log warning
    console.warn('[GitHub Webhook] No GITHUB_WEBHOOK_SECRET set — skipping signature validation');
    return true;
  }

  if (!signature) return false;

  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findProductByRepo(repoFullName: string): Product | undefined {
  // repoFullName is "owner/repo"
  const ghUrl = `https://github.com/${repoFullName}`;
  // Match product by repo_url (may have trailing .git or /)
  const products = queryAll<Product>('SELECT * FROM products WHERE status = ?', ['active']);
  return products.find(p => {
    if (!p.repo_url) return false;
    const normalized = p.repo_url.replace(/\.git$/, '').replace(/\/$/, '');
    return normalized === ghUrl || normalized === `${ghUrl}.git`;
  });
}

function findTaskByPrUrl(prUrl: string): Task | undefined {
  return queryOne<Task>('SELECT * FROM tasks WHERE pr_url = ?', [prUrl]);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handlePullRequestMerged(payload: {
  pull_request: {
    html_url: string;
    merge_commit_sha: string;
    merged: boolean;
  };
  repository: { full_name: string };
}) {
  const pr = payload.pull_request;
  if (!pr.merged) return;

  const product = findProductByRepo(payload.repository.full_name);
  if (!product) {
    console.log(`[GitHub Webhook] No product found for repo ${payload.repository.full_name} — skipping`);
    return;
  }

  const settings = getProductSettings(product);
  if (!settings.health_check_url) {
    console.log(`[GitHub Webhook] Product ${product.name} has no health_check_url — skipping monitor`);
    return;
  }

  // Only monitor if automation tier is semi_auto or full_auto
  if (!settings.automation_tier || settings.automation_tier === 'supervised') {
    console.log(`[GitHub Webhook] Product ${product.name} is supervised — skipping auto-monitor`);
    return;
  }

  const task = findTaskByPrUrl(pr.html_url);

  startPostMergeMonitor({
    productId: product.id,
    taskId: task?.id,
    healthCheckUrl: settings.health_check_url,
    mergedPrUrl: pr.html_url,
    mergedCommitSha: pr.merge_commit_sha,
    monitorMinutes: settings.post_merge_monitor_minutes || 5,
  });

  console.log(`[GitHub Webhook] Started post-merge monitor for ${product.name} (PR: ${pr.html_url})`);
}

async function handleCIFailure(payload: {
  conclusion?: string;
  status?: string;
  state?: string;
  head_sha?: string;
  sha?: string;
  commit?: { sha: string };
  repository: { full_name: string };
  check_suite?: { head_sha: string; conclusion: string };
  check_run?: { head_sha: string; conclusion: string; check_suite: { head_sha: string } };
}) {
  const commitSha = payload.head_sha
    || payload.sha
    || payload.commit?.sha
    || payload.check_suite?.head_sha
    || payload.check_run?.head_sha
    || payload.check_run?.check_suite?.head_sha;

  const conclusion = payload.conclusion
    || payload.state
    || payload.check_suite?.conclusion
    || payload.check_run?.conclusion;

  if (!commitSha || !conclusion) return;

  // Only act on failure conclusions
  const failureStates = ['failure', 'error', 'timed_out', 'action_required'];
  if (!failureStates.includes(conclusion)) return;

  const product = findProductByRepo(payload.repository.full_name);
  if (!product) return;

  const settings = getProductSettings(product);

  // Only auto-rollback for semi_auto / full_auto tiers
  if (!settings.automation_tier || settings.automation_tier === 'supervised') return;

  // Find the task/PR associated with this commit
  // Look for tasks with a merge commit matching this SHA
  const task = queryOne<Task>(
    `SELECT * FROM tasks WHERE product_id = ? AND pr_status = 'merged' ORDER BY updated_at DESC LIMIT 1`,
    [product.id]
  );

  if (!task?.pr_url) {
    console.log(`[GitHub Webhook] CI failure for ${product.name} but no recent merged PR found — skipping`);
    return;
  }

  console.log(`[GitHub Webhook] CI failure detected for ${product.name}: ${conclusion}`);

  await executeRollback({
    productId: product.id,
    taskId: task.id,
    triggerType: 'ci_failure',
    triggerDetails: `Post-merge CI ${conclusion} for commit ${commitSha.slice(0, 7)}`,
    mergedPrUrl: task.pr_url,
    mergedCommitSha: commitSha,
  });
}

// ---------------------------------------------------------------------------
// PR Review Auto-Fix handlers
// ---------------------------------------------------------------------------

async function handlePullRequestReview(payload: {
  action: string;
  review: {
    state: string;
    body?: string;
    user: { login: string };
    html_url: string;
  };
  pull_request: {
    html_url: string;
    user: { login: string };
  };
  repository: { full_name: string };
}) {
  // Only handle 'submitted' reviews
  if (payload.action !== 'submitted') return;

  const reviewState = payload.review.state; // 'approved', 'changes_requested', 'commented'

  // Skip approved reviews — no fix needed
  if (reviewState === 'approved') {
    console.log(`[GitHub Webhook] PR approved by ${payload.review.user.login} — no action needed`);
    return;
  }

  // Only act on changes_requested
  if (reviewState !== 'changes_requested') return;

  const task = findTaskByPrUrl(payload.pull_request.html_url);
  if (!task) {
    console.log(`[GitHub Webhook] No task found for PR ${payload.pull_request.html_url} — skipping review`);
    return;
  }

  const comments: ReviewComment[] = [];
  if (payload.review.body) {
    comments.push({
      body: payload.review.body,
      author: payload.review.user.login,
    });
  }

  await handlePRReviewFix({
    taskId: task.id,
    taskTitle: task.title,
    prUrl: payload.pull_request.html_url,
    reviewerName: payload.review.user.login,
    comments,
    eventType: 'review',
  });
}

async function handlePullRequestReviewComment(payload: {
  action: string;
  comment: {
    body: string;
    path?: string;
    line?: number;
    original_line?: number;
    user: { login: string };
  };
  pull_request: {
    html_url: string;
    user: { login: string };
  };
  repository: { full_name: string };
}) {
  if (payload.action !== 'created') return;

  // Skip comments from the PR author (likely the bot)
  if (payload.comment.user.login === payload.pull_request.user.login) return;

  const task = findTaskByPrUrl(payload.pull_request.html_url);
  if (!task) {
    console.log(`[GitHub Webhook] No task found for PR ${payload.pull_request.html_url} — skipping comment`);
    return;
  }

  const comments: ReviewComment[] = [{
    body: payload.comment.body,
    path: payload.comment.path,
    line: payload.comment.line ?? payload.comment.original_line,
    author: payload.comment.user.login,
  }];

  await handlePRReviewFix({
    taskId: task.id,
    taskTitle: task.title,
    prUrl: payload.pull_request.html_url,
    reviewerName: payload.comment.user.login,
    comments,
    eventType: 'comment',
  });
}

async function handleIssueComment(payload: {
  action: string;
  issue: {
    pull_request?: { html_url: string };
    html_url: string;
    user: { login: string };
  };
  comment: {
    body: string;
    user: { login: string };
  };
  repository: { full_name: string };
}) {
  if (payload.action !== 'created') return;

  // Only handle comments on PRs (issue_comment fires for both issues and PRs)
  if (!payload.issue.pull_request) return;

  // Skip comments from the PR author (likely the bot)
  if (payload.comment.user.login === payload.issue.user.login) return;

  const prUrl = payload.issue.pull_request.html_url;
  const task = findTaskByPrUrl(prUrl);
  if (!task) {
    console.log(`[GitHub Webhook] No task found for PR ${prUrl} — skipping issue comment`);
    return;
  }

  const comments: ReviewComment[] = [{
    body: payload.comment.body,
    author: payload.comment.user.login,
  }];

  await handlePRReviewFix({
    taskId: task.id,
    taskTitle: task.title,
    prUrl,
    reviewerName: payload.comment.user.login,
    comments,
    eventType: 'comment',
  });
}

async function handleCheckSuiteForReviewFix(payload: {
  action: string;
  check_suite: {
    conclusion: string;
    head_sha: string;
    pull_requests?: Array<{ url: string; html_url?: string; number: number }>;
  };
  repository: { full_name: string; html_url: string };
}) {
  if (payload.action !== 'completed') return;
  if (payload.check_suite.conclusion !== 'failure') return;

  // Find the PR associated with this check suite
  const prs = payload.check_suite.pull_requests;
  if (!prs || prs.length === 0) return;

  for (const pr of prs) {
    // Build the PR HTML URL if not provided
    const prHtmlUrl = pr.html_url || `${payload.repository.html_url}/pull/${pr.number}`;
    const task = findTaskByPrUrl(prHtmlUrl);
    if (!task) continue;

    await handlePRReviewFix({
      taskId: task.id,
      taskTitle: task.title,
      prUrl: prHtmlUrl,
      reviewerName: 'CI',
      comments: [{
        body: `CI check suite failed (conclusion: ${payload.check_suite.conclusion}, sha: ${payload.check_suite.head_sha.slice(0, 7)})`,
        author: 'CI',
      }],
      ciStatus: 'fail',
      eventType: 'ci_failure',
    });
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyGitHubSignature(signature, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  if (!event) {
    return NextResponse.json({ error: 'Missing x-github-event header' }, { status: 400 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    switch (event) {
      case 'pull_request':
        if (payload.action === 'closed' && payload.pull_request?.merged) {
          await handlePullRequestMerged(payload);
        }
        break;

      case 'pull_request_review':
        await handlePullRequestReview(payload);
        break;

      case 'pull_request_review_comment':
        await handlePullRequestReviewComment(payload);
        break;

      case 'issue_comment':
        await handleIssueComment(payload);
        break;

      case 'check_suite':
        if (payload.action === 'completed') {
          await handleCIFailure(payload);
          // Also check for PR review auto-fix on CI failures
          await handleCheckSuiteForReviewFix(payload);
        }
        break;

      case 'check_run':
        if (payload.action === 'completed') {
          await handleCIFailure(payload);
        }
        break;

      case 'status':
        // Commit status events (legacy CI systems)
        await handleCIFailure(payload);
        break;

      case 'ping':
        console.log('[GitHub Webhook] Ping received');
        break;

      default:
        console.log(`[GitHub Webhook] Ignoring event: ${event}`);
    }

    return NextResponse.json({ received: true, event });
  } catch (err) {
    console.error('[GitHub Webhook] Error processing event:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
