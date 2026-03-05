'use client';

import { cn } from '@/lib/utils';
import type { ContextUsage } from '@/hooks/useContextUsage';

const TIER_COLORS: Record<string, { bar: string; text: string }> = {
  gray: { bar: 'bg-[#a89d8e]/40', text: 'text-[#a89d8e]' },
  green: { bar: 'bg-emerald-400/60', text: 'text-emerald-600' },
  yellow: { bar: 'bg-amber-400/70', text: 'text-amber-600' },
  orange: { bar: 'bg-orange-400/80', text: 'text-orange-600' },
  red: { bar: 'bg-red-400/80', text: 'text-red-600' },
};

interface ContextIndicatorProps {
  usage: ContextUsage;
}

export function ContextIndicator({ usage }: ContextIndicatorProps) {
  const colors = TIER_COLORS[usage.colorTier] || TIER_COLORS.gray;

  return (
    <div className="flex items-center gap-1.5">
      {/* Progress bar */}
      <div className="w-14 h-1 rounded-full bg-[#d6cfc9]/40 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
          style={{ width: `${Math.max(1, usage.percent)}%` }}
        />
      </div>
      {/* Label */}
      <span className={cn('text-[10px] font-medium tabular-nums', colors.text)}>
        {usage.label}
      </span>
    </div>
  );
}
