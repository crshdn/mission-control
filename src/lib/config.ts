/**
 * Configuration Management
 * 
 * Handles user-configurable settings for Mission Control.
 * Settings are stored in localStorage for client-side access.
 * 
 * NEVER commit hardcoded IPs, paths, or sensitive data!
 */

export interface MissionControlConfig {
  // Workspace settings
  workspaceBasePath: string; // e.g., ~/Documents/Shared
  projectsPath: string; // e.g., ${workspaceBasePath}/projects
  
  // Mission Control API URL (for orchestration)
  missionControlUrl: string; // Auto-detected or manually set
  
  // OpenClaw Gateway settings (these come from .env on server)
  // Client-side only needs to know if it's configured
  
  // Project defaults
  defaultProjectName: string; // 'mission-control' or custom
}

const DEFAULT_DISCORD_RELAY_CHANNEL_ID = '1467633883678769244';
const DEFAULT_DISCORD_TASK_COMMAND_PREFIX = '!task';

const DEFAULT_CONFIG: MissionControlConfig = {
  workspaceBasePath: '~/Documents/Shared',
  projectsPath: '~/Documents/Shared/projects',
  missionControlUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000',
  defaultProjectName: 'mission-control',
};

const CONFIG_KEY = 'mission-control-config';

/**
 * Get current configuration
 * Returns defaults merged with user overrides
 */
export function getConfig(): MissionControlConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG;
  }

  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }

  return DEFAULT_CONFIG;
}

/**
 * Update configuration
 * Validates and saves to localStorage
 */
export function updateConfig(updates: Partial<MissionControlConfig>): void {
  if (typeof window === 'undefined') {
    throw new Error('Cannot update config on server side');
  }

  const current = getConfig();
  const updated = { ...current, ...updates };

  // Validate paths
  if (updates.workspaceBasePath !== undefined) {
    if (!updates.workspaceBasePath.trim()) {
      throw new Error('Workspace base path cannot be empty');
    }
  }

  if (updates.missionControlUrl !== undefined) {
    try {
      new URL(updates.missionControlUrl);
    } catch {
      throw new Error('Invalid Mission Control URL');
    }
  }

  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save config:', error);
    throw new Error('Failed to save configuration');
  }
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  if (typeof window === 'undefined') {
    throw new Error('Cannot reset config on server side');
  }

  localStorage.removeItem(CONFIG_KEY);
}

/**
 * Expand tilde in paths (for display purposes)
 * Note: Actual path resolution happens server-side
 */
export function expandPath(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }

  // This is client-side only - server will handle actual expansion
  return path.replace(/^~/, process.env.HOME || '/Users/user');
}

/**
 * Get Mission Control URL for API calls
 * Used by orchestration module and other server-side modules
 */
export function getMissionControlUrl(): string {
  // Server-side: use env var or auto-detect
  if (typeof window === 'undefined') {
    return process.env.MISSION_CONTROL_URL || 'http://localhost:4000';
  }

  // Client-side: use config
  return getConfig().missionControlUrl;
}

/**
 * Get workspace base path
 * Server-side only - returns configured path or default
 */
export function getWorkspaceBasePath(): string {
  if (typeof window !== 'undefined') {
    return getConfig().workspaceBasePath;
  }

  // Server-side: check env var first, then default
  return process.env.WORKSPACE_BASE_PATH || '~/Documents/Shared';
}

/**
 * Get projects path
 * Server-side only - returns configured path or default
 */
export function getProjectsPath(): string {
  if (typeof window !== 'undefined') {
    return getConfig().projectsPath;
  }

  // Server-side: check env var first, then default
  return process.env.PROJECTS_PATH || '~/Documents/Shared/projects';
}

/**
 * Build project-specific path
 * @param projectName - Name of the project
 * @param subpath - Optional subpath within project (e.g., 'deliverables')
 */
export function getProjectPath(projectName: string, subpath?: string): string {
  const projectsPath = getProjectsPath();
  const base = `${projectsPath}/${projectName}`;
  return subpath ? `${base}/${subpath}` : base;
}

/**
 * Get Discord relay session key for Mission Control broadcast messages.
 * Server-side only.
 */
export function getDiscordRelaySessionKey(): string | null {
  if (typeof window !== 'undefined') return null;

  const enabled = (process.env.OPENCLAW_DISCORD_RELAY_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) return null;

  const channelId = process.env.OPENCLAW_DISCORD_CHANNEL_ID || DEFAULT_DISCORD_RELAY_CHANNEL_ID;
  if (!channelId) return null;

  return `agent:main:discord:channel:${channelId}`;
}

export interface DiscordTaskCommandConfig {
  enabled: boolean;
  sessionKey: string | null;
  commandPrefix: string;
  workspaceId: string;
  defaultPriority: 'low' | 'normal' | 'high' | 'urgent';
  maxOpenTasks: number;
  minIntervalMs: number;
  allowedUserIds: Set<string>;
}

/**
 * Get configuration for Discord -> Mission Control task command ingestion.
 * Server-side only.
 */
export function getDiscordTaskCommandConfig(): DiscordTaskCommandConfig {
  if (typeof window !== 'undefined') {
    return {
      enabled: false,
      sessionKey: null,
      commandPrefix: DEFAULT_DISCORD_TASK_COMMAND_PREFIX,
      workspaceId: 'default',
      defaultPriority: 'normal',
      maxOpenTasks: 200,
      minIntervalMs: 5000,
      allowedUserIds: new Set<string>(),
    };
  }

  const sessionKey = getDiscordRelaySessionKey();
  const enabled = (process.env.OPENCLAW_DISCORD_TASK_COMMANDS_ENABLED || 'false').toLowerCase() === 'true';
  const commandPrefix = (process.env.OPENCLAW_DISCORD_TASK_COMMAND_PREFIX || DEFAULT_DISCORD_TASK_COMMAND_PREFIX).trim() || DEFAULT_DISCORD_TASK_COMMAND_PREFIX;
  const workspaceId = (process.env.OPENCLAW_DISCORD_TASK_WORKSPACE_ID || 'default').trim() || 'default';
  const configuredPriority = (process.env.OPENCLAW_DISCORD_TASK_DEFAULT_PRIORITY || 'normal').trim().toLowerCase();
  const defaultPriority = (['low', 'normal', 'high', 'urgent'] as const).includes(configuredPriority as 'low' | 'normal' | 'high' | 'urgent')
    ? (configuredPriority as 'low' | 'normal' | 'high' | 'urgent')
    : 'normal';
  const maxOpenTasks = Number(process.env.OPENCLAW_DISCORD_TASK_MAX_OPEN || 200);
  const minIntervalMs = Number(process.env.OPENCLAW_DISCORD_TASK_MIN_INTERVAL_MS || 5000);
  const allowlistRaw = process.env.OPENCLAW_DISCORD_TASK_COMMAND_USER_ALLOWLIST || '';
  const allowedUserIds = new Set(
    allowlistRaw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );

  return {
    enabled,
    sessionKey,
    commandPrefix,
    workspaceId,
    defaultPriority,
    maxOpenTasks: Number.isFinite(maxOpenTasks) && maxOpenTasks > 0 ? maxOpenTasks : 200,
    minIntervalMs: Number.isFinite(minIntervalMs) && minIntervalMs >= 0 ? minIntervalMs : 5000,
    allowedUserIds,
  };
}
