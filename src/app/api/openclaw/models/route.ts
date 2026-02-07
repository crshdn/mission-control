import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface OpenClawConfig {
  defaultModel?: string;
  providers?: Record<string, {
    models?: string[];
  }>;
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

    // Extract default model
    const defaultModel = config.defaultModel;

    // Extract all available models from providers
    const models = new Set<string>();

    if (config.providers) {
      for (const [providerName, provider] of Object.entries(config.providers)) {
        if (provider.models) {
          for (const model of provider.models) {
            // Add both with and without provider prefix
            models.add(model);
            models.add(`${providerName}/${model}`);
          }
        }
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
