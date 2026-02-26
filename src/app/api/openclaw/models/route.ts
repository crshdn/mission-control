export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getOpenClawClient } from '@/lib/openclaw/client';

// Maximum allowed config file size (1MB) to prevent DoS
const MAX_CONFIG_SIZE_BYTES = 1024 * 1024;

// Model discovery mode: 'remote' | 'local' | 'auto' (default)
// - remote: Query the connected OpenClaw Gateway via RPC (models.list)
// - local:  Read ~/.openclaw/openclaw.json from the local filesystem
// - auto:   Try remote first, fall back to local, then common defaults
const MODEL_DISCOVERY = (process.env.MODEL_DISCOVERY || 'auto').toLowerCase();

interface LocalOpenClawConfig {
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
      models?: Record<string, {
        alias?: string;
      }>;
    };
  };
  models?: {
    providers?: Record<string, {
      models?: Array<{
        id: string;
        name: string;
      }>;
    }>;
  };
}

interface OpenClawModelsResponse {
  defaultModel?: string;
  availableModels: string[];
  source: 'remote' | 'local' | 'fallback';
  error?: string;
}

// Common fallback models when neither remote nor local discovery succeeds
const FALLBACK_MODELS = [
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-opus-4-5',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-4o',
  'openai/o1',
];

/**
 * Discover models from the remote OpenClaw Gateway via WebSocket RPC.
 * Uses the `models.list` and `config.get` gateway methods.
 */
async function discoverModelsRemote(): Promise<{
  defaultModel?: string;
  availableModels: string[];
} | null> {
  try {
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      await client.connect();
    }

    // Fetch models and default config in parallel
    const [models, config] = await Promise.all([
      client.listModels().catch(() => []),
      client.getConfig().catch(() => ({})),
    ]);

    if (models.length === 0) {
      return null;
    }

    // Extract default model from gateway config
    const defaultModel = config && 'config' in config ? config.config?.agents?.defaults?.model?.primary : undefined;

    // Build model ID list from the gateway catalog
    const availableModels = models.map((m) => {
      // Gateway returns provider-prefixed IDs (e.g. "anthropic/claude-sonnet-4-5")
      // If the id already contains a slash, use as-is; otherwise prefix with provider
      return m.id.includes('/') ? m.id : `${m.provider}/${m.id}`;
    });

    return {
      defaultModel,
      availableModels: Array.from(new Set(availableModels)).sort(),
    };
  } catch (error) {
    console.warn('[models] Remote discovery failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Discover models from the local ~/.openclaw/openclaw.json config file.
 * Original behavior — works when OpenClaw is installed locally.
 */
function discoverModelsLocal(): Promise<{
  defaultModel?: string;
  availableModels: string[];
} | null> {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');

  try {
    if (!existsSync(configPath)) {
      return Promise.resolve(null);
    }

    // Security: Check file size before reading to prevent DoS
    const stats = statSync(configPath);
    if (stats.size > MAX_CONFIG_SIZE_BYTES) {
      console.warn(`[models] Local config too large (${(stats.size / 1024).toFixed(0)}KB), skipping`);
      return Promise.resolve(null);
    }

    const configContent = readFileSync(configPath, 'utf-8');
    const config: LocalOpenClawConfig = JSON.parse(configContent);

    // Extract default model from agents.defaults.model.primary
    const defaultModel = config?.agents?.defaults?.model?.primary;

    // Extract all available models from both sources
    const models = new Set<string>();

    // 1. From models.providers (structured provider catalog)
    if (config.models?.providers) {
      for (const [providerName, provider] of Object.entries(config.models.providers)) {
        if (provider.models) {
          for (const model of provider.models) {
            models.add(`${providerName}/${model.id}`);
          }
        }
      }
    }

    // 2. From agents.defaults.models (flat model list with optional aliases)
    if (config.agents?.defaults?.models) {
      for (const modelKey of Object.keys(config.agents.defaults.models)) {
        models.add(modelKey);
      }
    }

    if (models.size === 0) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      defaultModel,
      availableModels: Array.from(models).sort(),
    });
  } catch (error) {
    console.warn('[models] Local discovery failed:', error instanceof Error ? error.message : error);
    return Promise.resolve(null);
  }
}

/**
 * GET /api/openclaw/models
 *
 * Returns available AI models for agent configuration.
 *
 * Discovery strategy controlled by MODEL_DISCOVERY env var:
 *   - "remote": Query the connected OpenClaw Gateway via models.list RPC
 *   - "local":  Read ~/.openclaw/openclaw.json from the local filesystem
 *   - "auto":   Try remote first, fall back to local, then common defaults
 */
export async function GET() {
  try {
    let result: { defaultModel?: string; availableModels: string[] } | null = null;
    let source: 'remote' | 'local' | 'fallback' = 'fallback';

    if (MODEL_DISCOVERY === 'remote' || MODEL_DISCOVERY === 'auto') {
      result = await discoverModelsRemote();
      if (result) {
        source = 'remote';
      }
    }

    if (!result && (MODEL_DISCOVERY === 'local' || MODEL_DISCOVERY === 'auto')) {
      result = await discoverModelsLocal();
      if (result) {
        source = 'local';
      }
    }

    // Fallback: provide common models so the dropdown is never empty
    if (!result) {
      result = {
        defaultModel: undefined,
        availableModels: FALLBACK_MODELS,
      };
      source = 'fallback';
    }

    return NextResponse.json<OpenClawModelsResponse>({
      defaultModel: result.defaultModel,
      availableModels: result.availableModels,
      source,
    });
  } catch (error) {
    console.error('[models] Failed to discover models:', error);
    return NextResponse.json<OpenClawModelsResponse>({
      defaultModel: undefined,
      availableModels: FALLBACK_MODELS,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
