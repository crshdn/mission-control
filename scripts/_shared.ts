import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

export interface LoadedEnv {
  missionControlUrl: string;
  projectsPath: string;
  gatewayUrl: string;
  mcApiToken?: string;
}

function parseEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env) || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

export function expandHome(inputPath: string): string {
  if (!inputPath.startsWith('~')) return inputPath;
  return path.join(os.homedir(), inputPath.slice(1));
}

export function loadLocalEnv(repoRoot: string): LoadedEnv {
  parseEnvFile(path.join(repoRoot, '.env.local'));
  parseEnvFile(path.join(repoRoot, '.env'));

  return {
    missionControlUrl: (process.env.MISSION_CONTROL_URL || 'http://127.0.0.1:4000').replace(/\/$/, ''),
    projectsPath: expandHome(process.env.PROJECTS_PATH || '~/Documents/Shared/projects'),
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
    mcApiToken: process.env.MC_API_TOKEN,
  };
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function runCommand(command: string, cwd?: string): string {
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export async function request(baseUrl: string, pathname: string, init?: RequestInit): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (process.env.MC_API_TOKEN && !headers.Authorization) {
    headers.Authorization = `Bearer ${process.env.MC_API_TOKEN}`;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${pathname}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `${init?.method || 'GET'} ${pathname} failed with ${response.status}: ${
        typeof body === 'string' ? body : JSON.stringify(body)
      }`,
    );
  }

  return body;
}

export async function waitFor<T>(
  label: string,
  read: () => Promise<T>,
  isDone: (value: T) => boolean,
  timeoutMs = 120_000,
  intervalMs = 1_500,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (isDone(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
