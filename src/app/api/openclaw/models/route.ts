import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface OpenClawConfig {
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
  error?: string;
}

/**
 * GET /api/openclaw/models
 *
 * Returns available models from OpenClaw configuration.
 * Reads ~/.openclaw/openclaw.json to get:
 * - defaultModel
 * - available models from providers
 */
export async function GET() {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');

  try {
    if (!existsSync(configPath)) {
      return NextResponse.json<OpenClawModelsResponse>({
        defaultModel: undefined,
        availableModels: [],
        error: 'OpenClaw config not found at ~/.openclaw/openclaw.json',
      }, { status: 404 });
    }

    const configContent = readFileSync(configPath, 'utf-8');
    const config: OpenClawConfig = JSON.parse(configContent);

    // Extract default model from agents.defaults.model.primary
    const defaultModel = config?.agents?.defaults?.model?.primary;

    // Extract all available models from both sources
    const models = new Set<string>();

    // 1. From models.providers (structured provider catalog)
    if (config.models?.providers) {
      for (const [providerName, provider] of Object.entries(config.models.providers)) {
        if (provider.models) {
          for (const model of provider.models) {
            // Add with provider prefix
            models.add(`${providerName}/${model.id}`);
            // Also add as just the model id for convenience
            models.add(model.id);
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

    // Add some common models if none found
    if (models.size === 0) {
      models.add('anthropic/claude-sonnet-4-5');
      models.add('anthropic/claude-opus-4-5');
      models.add('anthropic/claude-haiku-4-5');
      models.add('openai/gpt-4o');
      models.add('openai/o1');
    }

    return NextResponse.json<OpenClawModelsResponse>({
      defaultModel,
      availableModels: Array.from(models).sort(),
    });
  } catch (error) {
    console.error('Failed to read OpenClaw config:', error);
    return NextResponse.json<OpenClawModelsResponse>({
      defaultModel: undefined,
      availableModels: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
