type ModelInfo = {
  name: string;
  blendedRate: number; // $ per 1M tokens
  color: string; // tailwind color class suffix
};

const MODEL_PRICING: Record<string, ModelInfo> = {
  'claude-opus-4-5': { name: 'Opus 4.5', blendedRate: 45, color: 'purple' },
  'claude-opus-4-6': { name: 'Opus 4.6', blendedRate: 45, color: 'purple' },
  'claude-sonnet-4-5': { name: 'Sonnet 4.5', blendedRate: 9, color: 'accent' },
  'claude-sonnet-4-5-20250929': { name: 'Sonnet 4.5', blendedRate: 9, color: 'accent' },
  'claude-haiku-4-5': { name: 'Haiku 4.5', blendedRate: 2.4, color: 'cyan' },
  'claude-haiku-4-5-20251001': { name: 'Haiku 4.5', blendedRate: 2.4, color: 'cyan' },
};

const DEFAULT_MODEL: ModelInfo = { name: 'Unknown', blendedRate: 9, color: 'text-secondary' };

export function getModelInfo(model: string): ModelInfo {
  return MODEL_PRICING[model] ?? DEFAULT_MODEL;
}

export function estimateCost(tokens: number, model: string): number {
  const info = getModelInfo(model);
  return (tokens / 1_000_000) * info.blendedRate;
}

export function formatCost(dollars: number): string {
  if (dollars < 0.01) return '$0.00';
  return `$${dollars.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
