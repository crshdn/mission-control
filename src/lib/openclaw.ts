import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { GatewayEnvelope } from './types';

const SESSIONS_DIR = join(
  process.env.HOME ?? '/Users/ministrom',
  '.openclaw/agents/main/sessions',
);

function getGatewayUrl(): string {
  const raw = process.env.OPENCLAW_GATEWAY_URL ?? 'http://127.0.0.1:18789';
  return raw.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
}

function getAuthHeaders(): Record<string, string> {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!token) return { 'Content-Type': 'application/json' };
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function unwrapText(envelope: GatewayEnvelope): string {
  if (!envelope.ok || envelope.error) {
    throw new Error(envelope.error?.message ?? 'Gateway request failed');
  }
  return envelope.result?.content?.[0]?.text ?? '';
}

function unwrapJson<T>(envelope: GatewayEnvelope): T {
  const text = unwrapText(envelope);
  if (!text) throw new Error('Empty gateway response');
  return JSON.parse(text) as T;
}

export async function invokeGatewayTool(
  tool: string,
  topLevelParams?: Record<string, unknown>,
): Promise<GatewayEnvelope> {
  const url = `${getGatewayUrl()}/tools/invoke`;
  const body = { tool, ...topLevelParams };
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gateway HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as GatewayEnvelope;
}

export async function invokeToolJson<T>(
  tool: string,
  topLevelParams?: Record<string, unknown>,
): Promise<T> {
  const envelope = await invokeGatewayTool(tool, topLevelParams);
  return unwrapJson<T>(envelope);
}

export async function invokeToolText(
  tool: string,
  topLevelParams?: Record<string, unknown>,
): Promise<string> {
  const envelope = await invokeGatewayTool(tool, topLevelParams);
  return unwrapText(envelope);
}

export async function checkGatewayHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getGatewayUrl()}/health`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchNpmVersion(pkg: string): Promise<string> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 'unknown';
    const data = (await res.json()) as { version?: string };
    return data.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

type TranscriptEntry = {
  type: string;
  id?: string;
  timestamp?: number;
  message?: {
    role: 'user' | 'assistant' | 'system';
    content: string | { type: string; text?: string; name?: string; arguments?: string }[];
    timestamp?: number;
  };
};

export function readTranscript(sessionId: string, limit = 50) {
  try {
    const filePath = join(SESSIONS_DIR, `${sessionId}.jsonl`);
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n');
    const messages: {
      role: string;
      content: string | { type: string; text?: string; name?: string; arguments?: string }[];
      timestamp?: number;
    }[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (entry.type === 'message' && entry.message) {
          messages.push({
            role: entry.message.role,
            content: entry.message.content,
            timestamp: entry.message.timestamp ?? entry.timestamp,
          });
        }
      } catch {
        continue;
      }
    }

    return messages.slice(-limit);
  } catch {
    return [];
  }
}

export function listTranscriptFiles(): string[] {
  try {
    return readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.jsonl') && !f.includes('.deleted.') && !f.endsWith('.lock'))
      .map((f) => f.replace('.jsonl', ''));
  } catch {
    return [];
  }
}

export function parseStatusText(text: string) {
  const lines = text.split('\n');
  const get = (prefix: string) => {
    const line = lines.find((l) => l.includes(prefix));
    return line ? line.split(prefix).pop()?.trim() ?? null : null;
  };

  const versionMatch = text.match(/OpenClaw\s+([\d.]+[-\w]*)/);
  const modelMatch = text.match(/Model:\s*(\S+)/);
  const contextMatch = text.match(/Context:\s*([\d.]+[km]?)\/([\d.]+[km]?)\s*\((\d+)%\)/);
  const runtimeMatch = text.match(/Runtime:\s*(\w+)/);
  const sessionMatch = text.match(/Session:\s*(\S+)/);

  return {
    agent_name: 'OpenClaw',
    version: versionMatch?.[1] ?? null,
    model: modelMatch?.[1] ?? null,
    context_usage: contextMatch
      ? { used: parseTokenCount(contextMatch[1]), total: parseTokenCount(contextMatch[2]), percent: parseInt(contextMatch[3], 10) }
      : null,
    runtime_mode: runtimeMatch?.[1] ?? null,
    session_key: sessionMatch?.[1] ?? null,
    raw: text,
  };
}

function parseTokenCount(s: string): number {
  if (s.endsWith('m')) return parseFloat(s) * 1_000_000;
  if (s.endsWith('k')) return parseFloat(s) * 1_000;
  return parseFloat(s);
}
