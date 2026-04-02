/**
 * Session Insights — post-task analytics engine.
 * Analyzes task activities to generate timelines, identify bottlenecks, and compute metrics.
 */

import { queryAll, queryOne, run } from '@/lib/db';

export interface TimelineEvent {
  type: 'dispatch' | 'file_created' | 'file_modified' | 'build' | 'test' | 'error' | 'stall' | 'recovery' | 'pr_created' | 'completed';
  timestamp: string;
  duration_ms?: number;
  annotation?: string;
  severity?: 'info' | 'warning' | 'error';
}

export interface TaskMetrics {
  duration_seconds: number;
  time_to_first_commit: number | null;
  build_attempts: number;
  test_pass_rate: number | null;
  stall_count: number;
  error_count: number;
}

export interface InsightResult {
  metrics: TaskMetrics;
  timeline: TimelineEvent[];
  bottleneck_summary: string;
}

interface ActivityRow {
  id: string;
  task_id: string;
  agent_id: string | null;
  activity_type: string;
  message: string;
  metadata: string | null;
  created_at: string;
}

interface TaskRow {
  id: string;
  status: string;
  product_id: string | null;
  created_at: string;
  updated_at: string;
  description: string | null;
}

/** Map activity_type + message patterns to timeline event types. */
function classifyActivity(act: ActivityRow): TimelineEvent['type'] | null {
  const msg = (act.message || '').toLowerCase();
  const type = act.activity_type;

  if (type === 'spawned' || msg.includes('dispatch')) return 'dispatch';
  if (type === 'file_created') return 'file_created';
  if (type === 'completed' && msg.includes('pr')) return 'pr_created';
  if (type === 'completed') return 'completed';
  if (msg.includes('build')) return 'build';
  if (msg.includes('test')) return 'test';
  if (type === 'error' || msg.includes('error') || msg.includes('fail')) return 'error';
  if (msg.includes('stall') || msg.includes('stuck')) return 'stall';
  if (msg.includes('recover')) return 'recovery';
  if (type === 'updated' && (msg.includes('modif') || msg.includes('edit'))) return 'file_modified';

  return null;
}

function severityFor(type: TimelineEvent['type']): TimelineEvent['severity'] {
  if (type === 'error') return 'error';
  if (type === 'stall') return 'warning';
  return 'info';
}

/** Build a timeline from raw activities. */
export function buildTimeline(activities: ActivityRow[]): TimelineEvent[] {
  const timeline: TimelineEvent[] = [];
  const sorted = [...activities].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (let i = 0; i < sorted.length; i++) {
    const act = sorted[i];
    const eventType = classifyActivity(act);
    if (!eventType) continue;

    const ts = new Date(act.created_at).getTime();
    const nextTs = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at).getTime() : ts;

    timeline.push({
      type: eventType,
      timestamp: act.created_at,
      duration_ms: nextTs - ts,
      annotation: act.message.length > 120 ? act.message.slice(0, 117) + '...' : act.message,
      severity: severityFor(eventType),
    });
  }

  return timeline;
}

/** Compute metrics from activities and task data. */
export function computeMetrics(activities: ActivityRow[], task: TaskRow): TaskMetrics {
  const sorted = [...activities].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const taskStart = new Date(task.created_at).getTime();
  const taskEnd = new Date(task.updated_at).getTime();
  const duration_seconds = Math.round((taskEnd - taskStart) / 1000);

  // Time to first file creation (proxy for first commit)
  const firstFile = sorted.find(a => a.activity_type === 'file_created' || (a.message || '').toLowerCase().includes('commit'));
  const time_to_first_commit = firstFile
    ? Math.round((new Date(firstFile.created_at).getTime() - taskStart) / 1000)
    : null;

  // Build attempts
  const build_attempts = sorted.filter(a => (a.message || '').toLowerCase().includes('build')).length;

  // Test pass rate
  const testActivities = sorted.filter(a => (a.message || '').toLowerCase().includes('test'));
  const testPasses = testActivities.filter(a => {
    const msg = (a.message || '').toLowerCase();
    return msg.includes('pass') || msg.includes('success') || (msg.includes('test') && a.activity_type === 'completed');
  }).length;
  const test_pass_rate = testActivities.length > 0 ? testPasses / testActivities.length : null;

  // Stalls and errors
  const stall_count = sorted.filter(a => {
    const msg = (a.message || '').toLowerCase();
    return msg.includes('stall') || msg.includes('stuck');
  }).length;

  const error_count = sorted.filter(a => {
    const msg = (a.message || '').toLowerCase();
    return a.activity_type === 'error' || msg.includes('error') || msg.includes('fail');
  }).length;

  return { duration_seconds, time_to_first_commit, build_attempts, test_pass_rate, stall_count, error_count };
}

/** Identify the main bottleneck from the timeline. */
export function identifyBottleneck(timeline: TimelineEvent[], metrics: TaskMetrics): string {
  if (timeline.length === 0) return 'No activity data available for analysis.';

  const parts: string[] = [];

  // Find longest gap
  let maxGapMs = 0;
  let maxGapAfter = '';
  for (let i = 0; i < timeline.length - 1; i++) {
    const gap = new Date(timeline[i + 1].timestamp).getTime() - new Date(timeline[i].timestamp).getTime();
    if (gap > maxGapMs) {
      maxGapMs = gap;
      maxGapAfter = timeline[i].type;
    }
  }

  if (maxGapMs > 60_000) {
    const mins = Math.round(maxGapMs / 60_000);
    parts.push(`Longest gap: ${mins}m after ${maxGapAfter}`);
  }

  if (metrics.error_count > 0) {
    parts.push(`${metrics.error_count} error(s) encountered`);
  }

  if (metrics.stall_count > 0) {
    parts.push(`${metrics.stall_count} stall(s) detected`);
  }

  if (metrics.build_attempts > 2) {
    parts.push(`${metrics.build_attempts} build attempts (possible build issues)`);
  }

  if (metrics.test_pass_rate !== null && metrics.test_pass_rate < 0.8) {
    parts.push(`Low test pass rate: ${Math.round(metrics.test_pass_rate * 100)}%`);
  }

  return parts.length > 0 ? parts.join('. ') + '.' : 'Task completed smoothly with no significant bottlenecks.';
}

/** Generate full insights for a task. Returns null if task not found. */
export function generateInsights(taskId: string): InsightResult | null {
  const task = queryOne<TaskRow>('SELECT id, status, product_id, created_at, updated_at, description FROM tasks WHERE id = ?', [taskId]);
  if (!task) return null;

  const activities = queryAll<ActivityRow>(
    'SELECT id, task_id, agent_id, activity_type, message, metadata, created_at FROM task_activities WHERE task_id = ? ORDER BY created_at ASC',
    [taskId]
  );

  const timeline = buildTimeline(activities);
  const metrics = computeMetrics(activities, task);
  const bottleneck_summary = identifyBottleneck(timeline, metrics);

  return { metrics, timeline, bottleneck_summary };
}

/** Save insights to the database. */
export function saveInsights(
  taskId: string,
  productId: string,
  insights: InsightResult,
  improvedPrompt?: string
): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  run(
    `INSERT OR REPLACE INTO task_insights
     (id, task_id, product_id, duration_seconds, time_to_first_commit, build_attempts,
      test_pass_rate, stall_count, error_count, bottleneck_summary, improved_prompt,
      timeline_data, insights_json, generated_at)
     VALUES (
       COALESCE((SELECT id FROM task_insights WHERE task_id = ?), ?),
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     )`,
    [
      taskId, id,
      taskId, productId,
      insights.metrics.duration_seconds,
      insights.metrics.time_to_first_commit,
      insights.metrics.build_attempts,
      insights.metrics.test_pass_rate,
      insights.metrics.stall_count,
      insights.metrics.error_count,
      insights.bottleneck_summary,
      improvedPrompt || null,
      JSON.stringify(insights.timeline),
      JSON.stringify(insights),
      now,
    ]
  );

  return id;
}

/** Retrieve saved insights for a task. */
export function getInsights(taskId: string) {
  return queryOne<{
    id: string;
    task_id: string;
    product_id: string;
    duration_seconds: number;
    time_to_first_commit: number | null;
    build_attempts: number;
    test_pass_rate: number | null;
    stall_count: number;
    error_count: number;
    bottleneck_summary: string;
    improved_prompt: string | null;
    timeline_data: string;
    insights_json: string;
    generated_at: string;
  }>('SELECT * FROM task_insights WHERE task_id = ?', [taskId]);
}

/** Get aggregate product-level metrics. */
export function getProductInsights(productId: string) {
  const stats = queryOne<{
    total_tasks: number;
    avg_duration: number;
    avg_errors: number;
    avg_stalls: number;
    avg_build_attempts: number;
    avg_test_pass_rate: number | null;
  }>(
    `SELECT
       COUNT(*) as total_tasks,
       AVG(duration_seconds) as avg_duration,
       AVG(error_count) as avg_errors,
       AVG(stall_count) as avg_stalls,
       AVG(build_attempts) as avg_build_attempts,
       AVG(test_pass_rate) as avg_test_pass_rate
     FROM task_insights WHERE product_id = ?`,
    [productId]
  );

  const successRate = queryOne<{ total: number; done: number }>(
    `SELECT COUNT(*) as total, SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done
     FROM tasks t WHERE t.product_id = ? AND t.status IN ('done', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'verification')`,
    [productId]
  );

  const recentInsights = queryAll<{
    id: string;
    task_id: string;
    duration_seconds: number;
    error_count: number;
    stall_count: number;
    bottleneck_summary: string;
    generated_at: string;
  }>(
    `SELECT id, task_id, duration_seconds, error_count, stall_count, bottleneck_summary, generated_at
     FROM task_insights WHERE product_id = ? ORDER BY generated_at DESC LIMIT 20`,
    [productId]
  );

  // Common failure patterns
  const failurePatterns = queryAll<{ bottleneck_summary: string; cnt: number }>(
    `SELECT bottleneck_summary, COUNT(*) as cnt
     FROM task_insights WHERE product_id = ? AND error_count > 0
     GROUP BY bottleneck_summary ORDER BY cnt DESC LIMIT 5`,
    [productId]
  );

  return {
    stats: stats || { total_tasks: 0, avg_duration: 0, avg_errors: 0, avg_stalls: 0, avg_build_attempts: 0, avg_test_pass_rate: null },
    success_rate: successRate && successRate.total > 0 ? successRate.done / successRate.total : null,
    recent_insights: recentInsights,
    failure_patterns: failurePatterns,
  };
}
