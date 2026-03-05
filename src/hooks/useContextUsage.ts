'use client';

import { useMemo } from 'react';
import {
  estimateContextTokens,
  calculateUsagePercent,
  getColorTier,
  getContextWindowSize,
  type ColorTier,
  type TokenEstimate,
} from '@/lib/ai/utils/tokenCounter';

export interface ContextUsage {
  estimate: TokenEstimate;
  maxTokens: number;
  percent: number;
  colorTier: ColorTier;
  label: string;
}

interface UseContextUsageOptions {
  messages: Array<{ role: string; content: string }>;
  fileContext: Record<string, string>;
  modelId?: string;
}

export function useContextUsage({
  messages,
  fileContext,
  modelId,
}: UseContextUsageOptions): ContextUsage {
  return useMemo(() => {
    const maxTokens = getContextWindowSize(modelId);
    const estimate = estimateContextTokens(messages, fileContext);
    const percent = calculateUsagePercent(estimate.totalTokens, maxTokens);
    const colorTier = getColorTier(percent);
    const label = `${percent.toFixed(1)}% used`;

    return { estimate, maxTokens, percent, colorTier, label };
  }, [messages, fileContext, modelId]);
}
