// Token estimation utilities for context window tracking
// Uses chars/4 approximation (accurate enough for a progress bar)

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'google/gemini-3.1-pro-preview': 1_000_000,
  'google/gemini-3-flash-preview': 1_000_000,
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
};

const DEFAULT_CONTEXT_WINDOW = 1_000_000;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function getContextWindowSize(modelId?: string): number {
  if (!modelId) return DEFAULT_CONTEXT_WINDOW;
  return MODEL_CONTEXT_WINDOWS[modelId] ?? DEFAULT_CONTEXT_WINDOW;
}

export interface TokenEstimate {
  systemPromptTokens: number;
  conversationTokens: number;
  fileContextTokens: number;
  totalTokens: number;
}

export function estimateContextTokens(
  conversationHistory: Array<{ role: string; content: string }>,
  fileContext: Record<string, string>,
  systemPromptOverhead?: number
): TokenEstimate {
  const systemPromptTokens = systemPromptOverhead ?? 500;

  let conversationTokens = 0;
  for (const msg of conversationHistory) {
    conversationTokens += estimateTokens(msg.content) + 4; // +4 for role/metadata overhead
  }

  let fileContextTokens = 0;
  for (const content of Object.values(fileContext)) {
    fileContextTokens += estimateTokens(content);
  }

  return {
    systemPromptTokens,
    conversationTokens,
    fileContextTokens,
    totalTokens: systemPromptTokens + conversationTokens + fileContextTokens,
  };
}

export function calculateUsagePercent(totalTokens: number, maxTokens: number): number {
  if (maxTokens <= 0) return 0;
  return Math.min(100, (totalTokens / maxTokens) * 100);
}

export type ColorTier = 'gray' | 'green' | 'yellow' | 'orange' | 'red';

export function getColorTier(percent: number): ColorTier {
  if (percent < 25) return 'gray';
  if (percent < 50) return 'green';
  if (percent < 75) return 'yellow';
  if (percent < 90) return 'orange';
  return 'red';
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}
