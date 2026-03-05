'use client';

import { cn } from '@/lib/utils';

interface MessageLoaderProps {
    className?: string;
}

export function MessageLoader({ className }: MessageLoaderProps) {
    return (
        <div className={cn('px-4 py-3', className)}>
            <div className="flex items-center gap-2">
                <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[#a89d8e] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#a89d8e] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#a89d8e] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-[#7a6f60] animate-pulse">AI is thinking...</span>
            </div>
        </div>
    );
}

export function ChatSkeleton() {
    return (
        <div className="flex flex-col h-full animate-pulse">
            <div className="flex-1 p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="px-4">
                        <div className={cn(
                            'rounded-2xl px-4 py-3',
                            i % 2 === 0
                                ? 'bg-white/5 w-[60%]'
                                : 'bg-white/3 w-[80%]'
                        )}>
                            <div className="h-4 bg-white/5 rounded w-full mb-2" />
                            <div className="h-4 bg-white/5 rounded w-3/4" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4">
                <div className="h-12 bg-white/5 rounded-2xl" />
            </div>
        </div>
    );
}
