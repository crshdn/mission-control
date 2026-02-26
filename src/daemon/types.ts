/**
 * Daemon type definitions
 */

import type { TaskPriority } from '../lib/types';

export interface JobSchedule {
  type: 'interval' | 'daily';
  intervalMs?: number;
  hour?: number;
  minute?: number;
  marketHoursOnly?: boolean;
  weekdaysOnly?: boolean;
}

export interface ScheduledJob {
  id: string;
  name: string;
  agentName: string;
  schedule: JobSchedule;
  taskTemplate: {
    title: string;
    description: string;
    priority: TaskPriority;
  };
  enabled: boolean;
}

export interface AgentHealthRecord {
  agent_id: string;
  last_seen: string;
  session_alive: number;
  consecutive_failures: number;
  updated_at: string;
}

export interface ScheduledJobRun {
  id: string;
  job_id: string;
  fired_at: string;
  task_id: string | null;
  status: string;
  created_at: string;
}

export interface DaemonConfig {
  heartbeatIntervalMs: number;
  dispatchIntervalMs: number;
  schedulerIntervalMs: number;
  missionControlUrl: string;
  staleThresholdMs: number;
  maxConsecutiveFailures: number;
}
