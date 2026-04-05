const ACTIVE_WORKSPACE_STATUSES = new Set([
  'assigned',
  'in_progress',
  'convoy_active',
  'testing',
  'review',
  'verification',
]);

const MERGE_FOLLOW_UP_STATUSES = new Set([
  'pending',
  'pr_created',
  'conflict',
  'failed',
]);

interface WorkspaceTaskState {
  status?: string | null;
  merge_status?: string | null;
}

export function shouldRetainWorkspace(task: WorkspaceTaskState | null | undefined): boolean {
  if (!task?.status) {
    return false;
  }

  if (ACTIVE_WORKSPACE_STATUSES.has(task.status)) {
    return true;
  }

  return task.status === 'done' && !!task.merge_status && MERGE_FOLLOW_UP_STATUSES.has(task.merge_status);
}