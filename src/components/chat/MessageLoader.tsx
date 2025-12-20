'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Bot } from 'lucide-react';

interface MessageLoaderProps {
    className?: string;
}

export function MessageLoader({ className }: MessageLoaderProps) {
    return (
        <div className={cn('flex gap-3 p-4', className)}>
            {/* Avatar */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center shadow-lg">
                <Bot className="w-4 h-4 text-white" />
            </div>

            {/* Message Bubble with Animation */}
            <div className="flex-1 max-w-[85%]">
                <div className="bg-[var(--bg-tertiary)] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    {/* Typing Indicator */}
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-[var(--accent-primary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-[var(--accent-primary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-[var(--accent-primary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                </div>

                {/* Status Text */}
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <div className="w-3 h-3 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                    <span className="animate-pulse">AI is thinking...</span>
                </div>
            </div>
        </div>
    );
}

// Skeleton loader for initial page load
export function ChatSkeleton() {
    return (
        <div className="flex flex-col h-full animate-pulse">
            {/* Messages skeleton */}
            <div className="flex-1 p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className={cn('flex gap-3', i % 2 === 0 ? 'justify-end' : '')}>
                        {i % 2 !== 0 && (
                            <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)]" />
                        )}
                        <div className={cn(
                            'rounded-2xl px-4 py-3',
                            i % 2 === 0
                                ? 'bg-[var(--accent-primary)]/20 w-[60%]'
                                : 'bg-[var(--bg-tertiary)] w-[70%]'
                        )}>
                            <div className="h-4 bg-[var(--bg-hover)] rounded w-full mb-2" />
                            <div className="h-4 bg-[var(--bg-hover)] rounded w-3/4" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Input skeleton */}
            <div className="p-4 border-t border-[var(--border-default)]">
                <div className="h-12 bg-[var(--bg-tertiary)] rounded-xl" />
            </div>
        </div>
    );
}
