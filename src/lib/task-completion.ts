import type { QCStatus, TaskStatus } from './types';

export interface DoneTransitionTaskState {
  status?: TaskStatus | string | null;
  assigned_agent_id?: string | null;
  created_by_agent_id?: string | null;
  result?: string | null;
  result_captured_at?: string | null;
  verification_output?: string | null;
  output_url?: string | null;
  qc_status?: QCStatus | string | null;
  qc_failures?: string | string[] | null;
}

export interface DoneTransitionUpdates {
  assigned_agent_id?: string | null;
  result?: string | null;
  verification_output?: string | null;
  output_url?: string | null;
  qc_status?: QCStatus | null;
  qc_failures?: string[] | null;
}

export interface DoneTransitionOptions {
  completionAgentId?: string | null;
  deliverableCount?: number | null;
  sessionCount?: number | null;
  allowedCurrentStatuses?: Array<TaskStatus | string | null | undefined>;
}

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseQcFailures(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export function getDoneTransitionIssues(
  task: DoneTransitionTaskState,
  updates: DoneTransitionUpdates = {},
  options: DoneTransitionOptions = {}
): string[] {
  const issues: string[] = [];
  const finalStatus = task.status;
  const finalAssignedAgentId = updates.assigned_agent_id !== undefined
    ? updates.assigned_agent_id
    : task.assigned_agent_id;
  const finalResult = normalizeString(updates.result !== undefined ? updates.result : task.result);
  const finalVerificationOutput = normalizeString(
    updates.verification_output !== undefined ? updates.verification_output : task.verification_output
  );
  const finalEvidence = finalVerificationOutput || finalResult;
  const finalOutputUrl = normalizeString(updates.output_url !== undefined ? updates.output_url : task.output_url);
  const finalQcStatus = updates.qc_status ?? task.qc_status;
  const finalQcFailures = updates.qc_failures ?? parseQcFailures(task.qc_failures);
  const finalDeliverableCount = options.deliverableCount ?? null;
  const finalSessionCount = options.sessionCount ?? null;
  const allowedCurrentStatuses = options.allowedCurrentStatuses ?? ['review'];

  if (!allowedCurrentStatuses.includes(finalStatus ?? null)) {
    if (allowedCurrentStatuses.length === 1 && allowedCurrentStatuses[0] === 'review') {
      issues.push(`done requires current status=review, received ${finalStatus || 'unknown'}`);
    } else {
      issues.push(
        `done requires current status in [${allowedCurrentStatuses
          .map((status) => status || 'unknown')
          .join(', ')}], received ${finalStatus || 'unknown'}`
      );
    }
  }

  if (!finalEvidence) {
    issues.push('done requires completion evidence in result or verification_output');
  }

  if (!finalVerificationOutput) {
    issues.push('done requires verification_output describing how completion was verified');
  }

  if (!finalOutputUrl && !(typeof finalDeliverableCount === 'number' && finalDeliverableCount > 0)) {
    issues.push('done requires output traceability via output_url or at least one logged deliverable');
  }

  if (!finalAssignedAgentId && !options.completionAgentId) {
    issues.push('done requires assignee traceability via assigned_agent_id');
  }

  if (typeof finalSessionCount === 'number' && finalSessionCount < 1) {
    issues.push('done requires task session traceability via openclaw_sessions');
  }

  if (!finalQcStatus || finalQcStatus === 'pending') {
    issues.push('done requires qc_status=passed or qc_status=skipped, not pending');
  } else if (finalQcStatus === 'failed') {
    issues.push('done cannot proceed while qc_status=failed');
  }

  if (finalQcFailures.length > 0) {
    issues.push('done cannot proceed while qc_failures are still recorded');
  }

  return issues;
}

export interface ApprovedCompletionStamp {
  status: 'done';
  qc_status: 'passed';
  qc_last_run: string;
  qc_failures: string;
  verified_at: string;
  updated_at: string;
  result_captured_at?: string;
}

export function getApprovedCompletionStamp(
  now: string,
  task: Pick<DoneTransitionTaskState, 'result' | 'result_captured_at'> = {}
): ApprovedCompletionStamp {
  const stamp: ApprovedCompletionStamp = {
    status: 'done',
    qc_status: 'passed',
    qc_last_run: now,
    qc_failures: JSON.stringify([]),
    verified_at: now,
    updated_at: now,
  };

  if (normalizeString(task.result) && !normalizeString(task.result_captured_at)) {
    return {
      ...stamp,
      result_captured_at: now,
    };
  }

  return stamp;
}

export function formatDoneOverrideLog(issues: string[], reason: string): string {
  const failedChecks = issues.length > 0 ? issues.join('; ') : 'no failed checks captured';
  return `[MANUAL OVERRIDE] Marked done despite completion gate failures: ${failedChecks}. Reason: ${reason}`;
}
