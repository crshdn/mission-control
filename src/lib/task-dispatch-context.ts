import { queryAll, queryOne } from '@/lib/db';
import { getTaskWorkflow } from '@/lib/workflow-engine';
import { formatMailForDispatch } from '@/lib/mailbox';
import { getPendingNotesForDispatch } from '@/lib/task-notes';
import { getMatchedSkills, formatSkillsForDispatch } from '@/lib/skills';
import { buildBrowserTestContext } from '@/lib/browser-test-context';
import type {
  Agent,
  Idea,
  KnowledgeEntry,
  Product,
  ResearchCycle,
  Task,
  TaskActivity,
  TaskDeliverable,
  TaskImage,
  TaskStatus,
  WorkCheckpoint,
  WorkflowStage,
} from '@/lib/types';

export const DISPATCH_CONTEXT_VERSION = 'task-dispatch-context/v1';

const SECTION_MAX_CHARS = 32_000;
const RESEARCH_REPORT_MAX_CHARS = 40_000;
const ACTIVITY_MESSAGE_MAX_CHARS = 700;
const FINAL_MESSAGE_MAX_CHARS = 1_200;

/**
 * Sandbox-stable artifact root used as the canonical base for source deliverable
 * paths advertised to sandboxed QA/review workers. Must be reachable inside
 * OpenClaw sandboxes and must not be a host-only Mission Control data path.
 */
export const SANDBOX_ARTIFACT_ROOT: string =
  process.env.MISSION_CONTROL_SANDBOX_ARTIFACT_ROOT || '/workspace/mission-control-artifacts';

const HOST_ARTIFACT_ROOT = '/opt/openclaw/mission-control/data/task-artifacts';

export function rewriteSourceArtifactPath(hostPath: string | null | undefined): string {
  if (!hostPath) return hostPath ?? '';
  if (!hostPath.startsWith(HOST_ARTIFACT_ROOT)) return hostPath;
  return SANDBOX_ARTIFACT_ROOT + hostPath.slice(HOST_ARTIFACT_ROOT.length);
}

export function resolveSourceArtifactPath(path: string | null | undefined, storagePath?: string | null): string {
  const rewrittenPath = rewriteSourceArtifactPath(path);
  if (rewrittenPath) return rewrittenPath;

  if (!storagePath) return '';
  if (storagePath.startsWith('/')) return rewriteSourceArtifactPath(storagePath);
  return `${SANDBOX_ARTIFACT_ROOT}/${storagePath.replace(/^\/+/, '')}`;
}

export interface DispatchContextSectionAudit {
  key: string;
  title: string;
  included: boolean;
  charCount: number;
  truncated: boolean;
}

export interface DispatchContextAudit {
  version: typeof DISPATCH_CONTEXT_VERSION;
  generatedAt: string;
  taskId: string;
  agentId: string;
  totalChars: number;
  sections: DispatchContextSectionAudit[];
}

export interface DispatchContextInput {
  task: Task;
  agent: Agent;
  missionControlUrl: string;
  taskProjectDir: string;
  workspaceIsolated: boolean;
  workspaceBranchName?: string;
  workspacePort?: number;
}

export interface DispatchContextResult {
  message: string;
  audit: DispatchContextAudit;
  isBuilder: boolean;
  nextStatus: TaskStatus;
}

interface SectionDraft {
  key: string;
  title: string;
  body: string;
  maxChars?: number;
}

type RuntimeSessionSummary = {
  runtime: 'openclaw' | 'codex';
  session_id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  ended_at?: string;
  error?: string;
  log_path?: string;
};

function clipText(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }

  const omitted = value.length - maxChars;
  const headSize = Math.floor(maxChars * 0.65);
  const tailSize = Math.max(0, maxChars - headSize - 120);
  return {
    text: `${value.slice(0, headSize)}\n\n[... ${omitted} characters omitted from the middle of this context section ...]\n\n${value.slice(-tailSize)}`,
    truncated: true,
  };
}

function compact(value: string | null | undefined): string {
  return (value || '').trim();
}

function safeJsonParse<T = unknown>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function stringifyUnknown(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatJsonList(value: string | null | undefined): string {
  const parsed = safeJsonParse<unknown>(value);
  if (Array.isArray(parsed)) {
    return parsed.map(item => `- ${stringifyUnknown(item)}`).join('\n');
  }
  if (parsed) return stringifyUnknown(parsed);
  return compact(value);
}

function formatTimestamp(value?: string | null): string {
  return value || 'unknown time';
}

function addSection(sections: SectionDraft[], key: string, title: string, body: string, maxChars = SECTION_MAX_CHARS): void {
  sections.push({ key, title, body: compact(body), maxChars });
}

function renderSections(input: DispatchContextInput, drafts: SectionDraft[]): { message: string; audit: DispatchContextAudit } {
  const auditSections: DispatchContextSectionAudit[] = [];
  const rendered: string[] = [];

  for (const section of drafts) {
    const original = compact(section.body);
    const { text, truncated } = clipText(original, section.maxChars || SECTION_MAX_CHARS);
    auditSections.push({
      key: section.key,
      title: section.title,
      included: original.length > 0,
      charCount: original.length,
      truncated,
    });

    if (original.length > 0) {
      rendered.push(`---\n## ${section.title}\n${text}`);
    }
  }

  const message = rendered.join('\n\n');
  return {
    message,
    audit: {
      version: DISPATCH_CONTEXT_VERSION,
      generatedAt: new Date().toISOString(),
      taskId: input.task.id,
      agentId: input.agent.id,
      totalChars: message.length,
      sections: auditSections,
    },
  };
}

function resolveWorkflowStage(task: Task): { currentStage?: WorkflowStage; nextStage?: WorkflowStage } {
  const workflow = getTaskWorkflow(task.id);
  if (!workflow) return {};

  let stageIndex = workflow.stages.findIndex(stage => stage.status === task.status);
  if (stageIndex < 0 && (task.status === 'assigned' || task.status === 'inbox')) {
    stageIndex = workflow.stages.findIndex(stage => stage.role === 'builder');
  }

  if (stageIndex < 0) return {};

  return {
    currentStage: workflow.stages[stageIndex],
    nextStage: workflow.stages[stageIndex + 1],
  };
}

function formatTaskSection(task: Task, agent: Agent, currentStage?: WorkflowStage): string {
  const roleLabel = currentStage?.label || 'Task';
  const lines = [
    `Dispatch mode: ${!currentStage || currentStage.role === 'builder' || task.status === 'assigned' ? 'NEW TASK ASSIGNED' : `${roleLabel.toUpperCase()} STAGE`}`,
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Status at dispatch: ${task.status}`,
    `Priority: ${task.priority.toUpperCase()}`,
    `Assigned gateway: ${agent.name} (${agent.id})`,
  ];

  if (task.due_date) lines.push(`Due: ${task.due_date}`);
  if (task.status_reason) lines.push(`Current status reason: ${task.status_reason}`);

  if (task.description) {
    lines.push('', 'Task description:', task.description);
  }

  return lines.join('\n');
}

function formatProductSection(task: Task): string {
  if (!task.product_id) return 'No linked product record.';

  const product = queryOne<Product>('SELECT * FROM products WHERE id = ?', [task.product_id]);
  if (!product) return `Linked product ${task.product_id} was not found.`;

  const lines = [
    `Product: ${product.name} (${product.id})`,
    `Status: ${product.status}`,
    `Workspace: ${product.workspace_id}`,
  ];

  if (product.description) lines.push('', 'Description:', product.description);
  if (product.product_program) lines.push('', 'Product program:', product.product_program);
  if (product.live_url) lines.push(`Live URL: ${product.live_url}`);
  if (product.repo_url) lines.push(`Repo URL: ${product.repo_url}`);
  if (product.default_branch) lines.push(`Default branch: ${product.default_branch}`);
  if (product.build_mode) lines.push(`Build mode: ${product.build_mode}`);
  if (product.cost_cap_per_task !== undefined) lines.push(`Cost cap per task: ${product.cost_cap_per_task}`);
  if (product.cost_cap_monthly !== undefined) lines.push(`Monthly cost cap: ${product.cost_cap_monthly}`);

  return lines.join('\n');
}

function getLinkedIdea(task: Task): Idea | null {
  if (task.idea_id) {
    const byId = queryOne<Idea>('SELECT * FROM ideas WHERE id = ?', [task.idea_id]);
    if (byId) return byId;
  }

  return queryOne<Idea>('SELECT * FROM ideas WHERE task_id = ? ORDER BY updated_at DESC LIMIT 1', [task.id]) || null;
}

function formatIdeaSection(task: Task): { body: string; idea: Idea | null } {
  const idea = getLinkedIdea(task);
  if (!idea) {
    return { body: 'No linked Autopilot idea record.', idea: null };
  }

  const lines = [
    `Idea: ${idea.title} (${idea.id})`,
    `Category: ${idea.category}`,
    `Source: ${idea.source}`,
    `Status: ${idea.status}`,
  ];

  if (idea.description) lines.push('', 'Idea description:', idea.description);
  if (idea.research_backing) lines.push('', 'Research backing:', idea.research_backing);
  if (idea.technical_approach) lines.push('', 'Technical approach:', idea.technical_approach);
  if (idea.competitive_analysis) lines.push('', 'Competitive analysis:', idea.competitive_analysis);
  if (idea.target_user_segment) lines.push('', 'Target user segment:', idea.target_user_segment);
  if (idea.revenue_potential) lines.push('', 'Revenue potential:', idea.revenue_potential);
  if (idea.risks) lines.push('', 'Risks:', formatJsonList(idea.risks));
  if (idea.tags) lines.push('', 'Tags:', formatJsonList(idea.tags));
  if (idea.user_notes) lines.push('', 'User notes from approval:', idea.user_notes);
  if (idea.similarity_flag) lines.push('', 'Similarity notes:', formatJsonList(idea.similarity_flag));
  if (idea.impact_score !== undefined) lines.push(`Impact score: ${idea.impact_score}`);
  if (idea.feasibility_score !== undefined) lines.push(`Feasibility score: ${idea.feasibility_score}`);
  if (idea.complexity) lines.push(`Complexity: ${idea.complexity}`);
  if (idea.estimated_effort_hours !== undefined) lines.push(`Estimated effort hours: ${idea.estimated_effort_hours}`);
  if (idea.source_research) lines.push('', 'Source research excerpts:', formatJsonList(idea.source_research));

  return { body: lines.join('\n'), idea };
}

function formatResearchSection(task: Task, idea: Idea | null): string {
  const cycleId = idea?.cycle_id;
  if (!cycleId) return 'No linked research cycle for this task.';

  const cycle = queryOne<ResearchCycle>('SELECT * FROM research_cycles WHERE id = ?', [cycleId]);
  if (!cycle) return `Linked research cycle ${cycleId} was not found.`;

  const lines = [
    `Research cycle: ${cycle.id}`,
    `Status: ${cycle.status}`,
    `Phase: ${cycle.current_phase || 'unknown'}`,
    `Started: ${formatTimestamp(cycle.started_at)}`,
    `Completed: ${formatTimestamp(cycle.completed_at)}`,
    `Ideas generated: ${cycle.ideas_generated}`,
  ];

  if (cycle.error_message) lines.push(`Error: ${cycle.error_message}`);
  if (cycle.phase_data) lines.push('', 'Phase data:', stringifyUnknown(safeJsonParse(cycle.phase_data) || cycle.phase_data));
  if (cycle.report) {
    const parsedReport = safeJsonParse(cycle.report);
    lines.push('', 'Research report:', stringifyUnknown(parsedReport || cycle.report));
  } else {
    lines.push('', 'Research report: No report stored.');
  }

  return lines.join('\n');
}

function formatPlanningSection(task: Task, agent: Agent): string {
  const lines: string[] = [];

  if (task.planning_spec) {
    const parsed = safeJsonParse<{ spec_markdown?: string } | string>(task.planning_spec);
    lines.push('Planning specification:', typeof parsed === 'string' ? parsed : parsed?.spec_markdown || stringifyUnknown(parsed || task.planning_spec));
  } else {
    lines.push('Planning specification: none stored.');
  }

  if (task.planning_agents) {
    const agents = safeJsonParse<Array<{ agent_id?: string; name?: string; role?: string; instructions?: string }>>(task.planning_agents);
    if (Array.isArray(agents)) {
      const ownInstructions = agents.find(item => item.agent_id === agent.id || item.name === agent.name);
      if (ownInstructions?.instructions) {
        lines.push('', 'Instructions for this gateway:', ownInstructions.instructions);
      }

      const allInstructions = agents
        .filter(item => item.instructions)
        .map(item => `- ${item.name || item.role || item.agent_id || 'Agent'}: ${item.instructions}`)
        .join('\n');
      if (allInstructions) lines.push('', 'All planned agent instructions:', allInstructions);
    } else {
      lines.push('', 'Planning agents:', task.planning_agents);
    }
  } else {
    lines.push('Planning agents: none stored.');
  }

  if (task.planning_messages) {
    lines.push('', 'Planning conversation/messages:', stringifyUnknown(safeJsonParse(task.planning_messages) || task.planning_messages));
  } else {
    lines.push('Planning messages: none stored.');
  }

  return lines.join('\n');
}

function formatKnowledgeSection(task: Task): string {
  const entries = queryAll<KnowledgeEntry & { tags: string | null }>(
    `SELECT *
     FROM knowledge_entries
     WHERE workspace_id = ?
     ORDER BY CASE
       WHEN task_id = ? THEN 0
       WHEN task_id IS NULL THEN 1
       ELSE 2
     END, confidence DESC, created_at DESC
     LIMIT 8`,
    [task.workspace_id, task.id]
  );

  if (entries.length === 0) return 'No workspace lessons or task-specific knowledge entries found.';

  return entries.map((entry, index) => {
    const tags = formatJsonList(entry.tags || undefined);
    return [
      `${index + 1}. ${entry.title}`,
      `   Category: ${entry.category}; confidence: ${Math.round(entry.confidence * 100)}%; created: ${entry.created_at}`,
      tags ? `   Tags: ${tags.replace(/\n/g, '; ')}` : '',
      `   Content: ${entry.content}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function formatSkillsSection(task: Task, agent: Agent): string {
  if (!task.product_id) return 'No product linked, so no product skills were matched.';

  const skills = getMatchedSkills(task.product_id, task.title, task.description || '', agent.role || agent.name);
  const formatted = formatSkillsForDispatch(skills);
  return formatted || 'No matching active product skills found.';
}

function formatImagesSection(task: Task, missionControlUrl: string): string {
  if (!task.images) return 'No task reference images.';

  const images = safeJsonParse<TaskImage[]>(task.images);
  if (!Array.isArray(images) || images.length === 0) return 'No task reference images.';

  return images
    .map(img => `- ${img.original_name}: ${missionControlUrl}/api/task-images/${task.id}/${img.filename}`)
    .join('\n');
}

function parseCheckpoint(row: WorkCheckpoint): WorkCheckpoint {
  return {
    ...row,
    files_snapshot: typeof row.files_snapshot === 'string'
      ? safeJsonParse<Array<{ path: string; hash: string; size: number }>>(row.files_snapshot)
      : row.files_snapshot,
    context_data: typeof row.context_data === 'string'
      ? safeJsonParse<Record<string, unknown>>(row.context_data)
      : row.context_data,
  };
}

function formatCheckpoint(checkpoint: WorkCheckpoint): string {
  const lines = [
    `Checkpoint ${checkpoint.id} (${checkpoint.checkpoint_type}) at ${checkpoint.created_at}`,
    `Summary: ${checkpoint.state_summary}`,
  ];

  if (checkpoint.files_snapshot && checkpoint.files_snapshot.length > 0) {
    lines.push('Files snapshot:');
    for (const file of checkpoint.files_snapshot) {
      lines.push(`- ${file.path} (${file.size} bytes)`);
    }
  }

  if (checkpoint.context_data) {
    lines.push('Context data:', stringifyUnknown(checkpoint.context_data));
  }

  return lines.join('\n');
}

function getRecentRuntimeSessions(taskId: string): RuntimeSessionSummary[] {
  return queryAll<RuntimeSessionSummary>(
    `SELECT 'openclaw' AS runtime, openclaw_session_id AS session_id, status, created_at, updated_at, ended_at, NULL AS error, NULL AS log_path
     FROM openclaw_sessions
     WHERE task_id = ?
     UNION ALL
     SELECT 'codex' AS runtime, id AS session_id, status, created_at, updated_at, ended_at, error, log_path
     FROM codex_sessions
     WHERE task_id = ?
     ORDER BY created_at DESC
     LIMIT 8`,
    [taskId, taskId]
  );
}

function formatActivity(activity: TaskActivity & { agent_name?: string | null }): string {
  const metadata = safeJsonParse<Record<string, unknown>>(activity.metadata);
  const lines = [
    `- ${activity.created_at} [${activity.activity_type}${activity.agent_name ? ` by ${activity.agent_name}` : ''}]: ${clipText(activity.message, ACTIVITY_MESSAGE_MAX_CHARS).text}`,
  ];

  if (metadata?.final_message) {
    lines.push(`  Final message: ${clipText(String(metadata.final_message), FINAL_MESSAGE_MAX_CHARS).text}`);
  }
  if (metadata?.runtime || metadata?.codex_session_id || metadata?.session_id) {
    lines.push(`  Metadata: ${stringifyUnknown({
      runtime: metadata.runtime,
      session_id: metadata.codex_session_id || metadata.session_id,
      log_path: metadata.log_path,
    })}`);
  }

  return lines.join('\n');
}

function formatPreviousWorkSection(task: Task): string {
  const lines: string[] = [];

  const deliverables = queryAll<TaskDeliverable>(
    `SELECT *
     FROM task_deliverables
     WHERE task_id = ?
     ORDER BY created_at DESC
     LIMIT 12`,
    [task.id]
  );
  lines.push('Registered deliverables:');
  if (deliverables.length === 0) {
    lines.push('- None registered.');
  } else {
    for (const deliverable of deliverables) {
      const kind = deliverable.artifact_format || deliverable.deliverable_type;
      const location = resolveSourceArtifactPath(deliverable.path, deliverable.storage_path);
      lines.push(`- ${deliverable.created_at} [${kind}] ${deliverable.title}${location ? `: ${location}` : ''}${deliverable.description ? ` - ${deliverable.description}` : ''}`);
    }
  }

  const checkpoints = queryAll<WorkCheckpoint>(
    `SELECT *
     FROM work_checkpoints
     WHERE task_id = ?
     ORDER BY created_at DESC
     LIMIT 3`,
    [task.id]
  ).map(parseCheckpoint);
  lines.push('', 'Work checkpoints:');
  if (checkpoints.length === 0) {
    lines.push('- None stored.');
  } else {
    for (const checkpoint of checkpoints) {
      lines.push(formatCheckpoint(checkpoint));
    }
    lines.push('Continue from the latest checkpoint. Do not redo completed work.');
  }

  const activities = queryAll<TaskActivity & { agent_name?: string | null }>(
    `SELECT ta.*, a.name AS agent_name
     FROM task_activities ta
     LEFT JOIN agents a ON a.id = ta.agent_id
     WHERE ta.task_id = ?
       AND ta.message NOT LIKE 'Agent health:%'
     ORDER BY ta.created_at DESC
     LIMIT 15`,
    [task.id]
  );
  lines.push('', 'Recent task activity:');
  if (activities.length === 0) {
    lines.push('- No non-health activity recorded.');
  } else {
    lines.push(...activities.map(formatActivity));
  }

  const sessions = getRecentRuntimeSessions(task.id);
  lines.push('', 'Recent runtime sessions across gateways:');
  if (sessions.length === 0) {
    lines.push('- No runtime sessions recorded.');
  } else {
    for (const session of sessions) {
      lines.push(`- ${session.created_at} ${session.runtime}:${session.session_id} status=${session.status}${session.ended_at ? ` ended=${session.ended_at}` : ''}${session.error ? ` error=${clipText(session.error, 700).text}` : ''}${session.log_path ? ` log=${session.log_path}` : ''}`);
    }
  }

  if (task.pr_url || task.pr_status || task.merge_pr_url || task.merge_status) {
    lines.push('', 'PR and merge state:');
    if (task.pr_url) lines.push(`- PR URL: ${task.pr_url}`);
    if (task.pr_status) lines.push(`- PR status: ${task.pr_status}`);
    if (task.merge_pr_url) lines.push(`- Merge PR URL: ${task.merge_pr_url}`);
    if (task.merge_status) lines.push(`- Merge status: ${task.merge_status}`);
  }

  return lines.join('\n');
}

function formatNotesSection(task: Task, agent: Agent): string {
  const recentNotes = queryAll<{ role: string; mode: string; status: string; content: string; created_at: string; delivered_at?: string | null }>(
    `SELECT role, mode, status, content, created_at, delivered_at
     FROM task_notes
     WHERE task_id = ?
     ORDER BY created_at DESC
     LIMIT 12`,
    [task.id]
  );

  const lines: string[] = [];
  if (recentNotes.length > 0) {
    lines.push('Recent operator/agent notes:');
    for (const note of recentNotes) {
      lines.push(`- ${note.created_at} [${note.role}/${note.mode}/${note.status}]: ${note.content}`);
    }
  } else {
    lines.push('Recent operator/agent notes: none.');
  }

  const { formatted: pendingNotes } = getPendingNotesForDispatch(task.id);
  if (pendingNotes) {
    lines.push('', pendingNotes);
  }

  const mail = formatMailForDispatch(agent.id);
  if (mail) {
    lines.push('', mail);
  } else {
    lines.push('', 'Unread gateway mail: none.');
  }

  return lines.join('\n');
}

function formatRepoSection(task: Task, missionControlUrl: string, isBuilder: boolean): string {
  if (!task.repo_url) return 'No repository attached to this task.';

  const repoBranch = task.repo_branch || 'main';
  const branchName = `autopilot/${task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;
  const lines = [
    `Repo: ${task.repo_url}`,
    `Base branch: ${repoBranch}`,
    `Feature branch: ${branchName}`,
  ];

  if (isBuilder) {
    lines.push(
      '',
      'Git workflow:',
      `1. First, verify git access: git ls-remote ${task.repo_url}`,
      '   If this fails, report the error immediately via Mission Control and stop.',
      '2. Clone the repo or use the existing local checkout.',
      `3. Create or continue branch ${branchName} from ${repoBranch}.`,
      `4. Implement the task. Commit with clear messages that reference task ${task.id}.`,
      '5. Push the branch and create/update a Pull Request.',
      '',
      'PR requirements:',
      `- Title: "Autopilot: ${task.title}"`,
      '- Body must include what was built, research backing, technical approach, risks/tradeoffs, and the task ID.',
      `- Target branch: ${repoBranch}`,
      `- After creating PR, PATCH ${missionControlUrl}/api/tasks/${task.id} with {"pr_url":"<github PR url>","pr_status":"open"}.`
    );
  }

  return lines.join('\n');
}

function formatWorkspaceSection(input: DispatchContextInput, isBuilder: boolean): string {
  if (isBuilder && input.workspaceIsolated) {
    return [
      `Output/workspace directory: ${input.taskProjectDir}`,
      `Port: ${input.workspacePort || 'default'} (use this for any dev server, not the default app port)`,
      input.workspaceBranchName ? `Workspace branch: ${input.workspaceBranchName}` : '',
      `Do not modify files outside this workspace directory: ${input.taskProjectDir}`,
      'Create this directory if needed and save all task deliverables there.',
    ].filter(Boolean).join('\n');
  }

  return [
    `Output directory: ${input.taskProjectDir}`,
    'Create this directory if needed and save all task deliverables there.',
  ].join('\n');
}

function formatCompletionSection(input: DispatchContextInput, isBuilder: boolean, isTester: boolean, isVerifier: boolean, nextStatus: TaskStatus): string {
  const { task, missionControlUrl, taskProjectDir } = input;
  const failEndpoint = `POST ${missionControlUrl}/api/tasks/${task.id}/fail`;

  if (isBuilder) {
    return `After completing work, you MUST call these APIs:
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Description of what was done"}
2. Register deliverable: POST ${missionControlUrl}/api/tasks/${task.id}/deliverables
   Body: {"deliverable_type": "file", "title": "File name", "path": "${taskProjectDir}/filename.html"}
3. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}

When complete, reply with:
TASK_COMPLETE: [brief summary of what you did]`;
  }

  if (isTester) {
    return `YOUR ROLE: TESTER. Test the deliverables for this task.

If tests PASS:
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Tests passed: [summary]"}
2. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}

If tests FAIL:
1. ${failEndpoint}
   Body: {"reason": "Detailed description of what failed and what needs fixing"}
   If the failure is caused by a missing local tool/dependency or repository access issue, include this exact line in the reason when you can identify a concrete command:
   Suggested setup command: <single command to run>

Reply with: TEST_PASS: [summary] or TEST_FAIL: [what failed]`;
  }

  if (isVerifier) {
    return `YOUR ROLE: VERIFIER. Verify that all work meets quality standards.

If verification PASSES:
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Verification passed: [summary]"}
2. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}

If verification FAILS:
1. ${failEndpoint}
   Body: {"reason": "Detailed description of what failed and what needs fixing"}
   If the failure is caused by a missing local tool/dependency or repository access issue, include this exact line in the reason when you can identify a concrete command:
   Suggested setup command: <single command to run>

Reply with: VERIFY_PASS: [summary] or VERIFY_FAIL: [what failed]`;
  }

  return `After completing work:
1. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}`;
}

export function buildTaskDispatchContext(input: DispatchContextInput): DispatchContextResult {
  const { task, agent, missionControlUrl } = input;
  const { currentStage, nextStage } = resolveWorkflowStage(task);
  const isBuilder = !currentStage || currentStage.role === 'builder' || task.status === 'assigned';
  const isTester = currentStage?.role === 'tester';
  const isVerifier = currentStage?.role === 'verifier' || currentStage?.role === 'reviewer';
  const nextStatus = (nextStage?.status || 'review') as TaskStatus;

  const { body: ideaBody, idea } = formatIdeaSection(task);

  const sections: SectionDraft[] = [];
  addSection(sections, 'task', 'Task', formatTaskSection(task, agent, currentStage));
  addSection(sections, 'product', 'Product Context', formatProductSection(task));
  addSection(sections, 'idea', 'Research Idea Context', ideaBody);
  addSection(sections, 'research', 'Research Cycle Context', formatResearchSection(task, idea), RESEARCH_REPORT_MAX_CHARS);
  addSection(sections, 'planning', 'Planning Context', formatPlanningSection(task, agent), SECTION_MAX_CHARS);
  addSection(sections, 'knowledge', 'Memory and Lessons', formatKnowledgeSection(task), SECTION_MAX_CHARS);
  addSection(sections, 'skills', 'Reusable Product Skills', formatSkillsSection(task, agent), SECTION_MAX_CHARS);
  addSection(sections, 'previous_work', 'Previous Work and Continuation Memory', formatPreviousWorkSection(task), SECTION_MAX_CHARS);
  addSection(sections, 'notes_mail', 'Operator Notes and Gateway Mail', formatNotesSection(task, agent), SECTION_MAX_CHARS);
  addSection(sections, 'images', 'Reference Images', formatImagesSection(task, missionControlUrl), SECTION_MAX_CHARS);
  addSection(sections, 'repo', 'Repository and PR Workflow', formatRepoSection(task, missionControlUrl, isBuilder), SECTION_MAX_CHARS);
  addSection(sections, 'workspace', 'Workspace and Deliverable Location', formatWorkspaceSection(input, isBuilder), SECTION_MAX_CHARS);
  if (isTester) {
    addSection(sections, 'browser_test', 'Browser Testing', buildBrowserTestContext(task as Task & { planning_spec?: string; workspace_port?: number; browser_test_url?: string }), SECTION_MAX_CHARS);
  }
  addSection(sections, 'completion', 'Completion Contract', formatCompletionSection(input, isBuilder, Boolean(isTester), Boolean(isVerifier), nextStatus), SECTION_MAX_CHARS);
  addSection(sections, 'support', 'Support', 'If you need help or clarification, ask the orchestrator through Mission Control.');

  const rendered = renderSections(input, sections);
  return {
    ...rendered,
    isBuilder,
    nextStatus,
  };
}
