import { existsSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const OPENCLAW_CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json');
const MAX_CONFIG_SIZE_BYTES = 1024 * 1024;
const TOKENS_PER_MILLION = 1_000_000;

interface PricingModelEntry {
  id?: string;
  name?: string;
  cost?: {
    input?: number;
    output?: number;
  };
}

interface OpenClawPricingConfig {
  models?: {
    providers?: Record<string, {
      models?: PricingModelEntry[];
    }>;
  };
}

interface PricingLookupResult {
  provider: string;
  modelId: string;
  inputRatePerMillion: number;
  outputRatePerMillion: number;
}

export interface EstimatedModelCost {
  costUsd: number;
  pricingStatus: 'estimated' | 'unavailable';
  provider?: string;
  normalizedModel?: string;
  inputRatePerMillion?: number;
  outputRatePerMillion?: number;
}

let cachedConfig: OpenClawPricingConfig | null | undefined;

function loadPricingConfig(): OpenClawPricingConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;

  try {
    if (!existsSync(OPENCLAW_CONFIG_PATH)) {
      cachedConfig = null;
      return cachedConfig;
    }

    const stats = statSync(OPENCLAW_CONFIG_PATH);
    if (stats.size > MAX_CONFIG_SIZE_BYTES) {
      console.warn(
        `[pricing] ~/.openclaw/openclaw.json is too large (${stats.size} bytes), skipping pricing lookup`,
      );
      cachedConfig = null;
      return cachedConfig;
    }

    cachedConfig = JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, 'utf8')) as OpenClawPricingConfig;
    return cachedConfig;
  } catch (error) {
    console.warn('[pricing] Failed to read local OpenClaw pricing config:', error);
    cachedConfig = null;
    return cachedConfig;
  }
}

function normalizeProviderAndModel(input: { provider?: string; model?: string }): {
  provider?: string;
  modelId?: string;
} {
  const rawProvider = input.provider?.trim();
  const rawModel = input.model?.trim();
  if (!rawProvider && !rawModel) return {};

  if (rawModel?.includes('/')) {
    const [provider, ...rest] = rawModel.split('/');
    return {
      provider: rawProvider || provider,
      modelId: rest.join('/'),
    };
  }

  return {
    provider: rawProvider,
    modelId: rawModel,
  };
}

function findPricingEntry(input: { provider?: string; model?: string }): PricingLookupResult | null {
  const config = loadPricingConfig();
  if (!config?.models?.providers) return null;

  const normalized = normalizeProviderAndModel(input);
  if (!normalized.provider || !normalized.modelId) return null;

  const providerCatalog = config.models.providers[normalized.provider];
  if (!providerCatalog?.models?.length) return null;

  const match = providerCatalog.models.find((model) => {
    if (!model.id) return false;
    return model.id === normalized.modelId || model.name === input.model || `${normalized.provider}/${model.id}` === input.model;
  });

  if (!match?.cost) return null;

  return {
    provider: normalized.provider,
    modelId: match.id || normalized.modelId,
    inputRatePerMillion: Number(match.cost.input || 0),
    outputRatePerMillion: Number(match.cost.output || 0),
  };
}

export function estimateModelCostUsd(input: {
  provider?: string;
  model?: string;
  tokensInput?: number;
  tokensOutput?: number;
}): EstimatedModelCost {
  const tokensInput = Math.max(0, input.tokensInput || 0);
  const tokensOutput = Math.max(0, input.tokensOutput || 0);
  const pricing = findPricingEntry(input);

  if (!pricing) {
    return {
      costUsd: 0,
      pricingStatus: 'unavailable',
      provider: input.provider,
      normalizedModel: input.model,
    };
  }

  const costUsd =
    (tokensInput / TOKENS_PER_MILLION) * pricing.inputRatePerMillion +
    (tokensOutput / TOKENS_PER_MILLION) * pricing.outputRatePerMillion;

  return {
    costUsd: Number(costUsd.toFixed(6)),
    pricingStatus: 'estimated',
    provider: pricing.provider,
    normalizedModel: `${pricing.provider}/${pricing.modelId}`,
    inputRatePerMillion: pricing.inputRatePerMillion,
    outputRatePerMillion: pricing.outputRatePerMillion,
  };
}
