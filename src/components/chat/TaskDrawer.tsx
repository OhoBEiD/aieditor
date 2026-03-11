'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Check, AlertCircle, ChevronDown, ListChecks } from 'lucide-react';

export interface TaskItem {
    id: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
}

interface TaskDrawerProps {
    tasks: TaskItem[];
    isVisible: boolean;
}

export function TaskDrawer({ tasks, isVisible }: TaskDrawerProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    // Auto-expand when new tasks appear
    useEffect(() => {
        if (tasks.length > 0) setIsExpanded(true);
    }, [tasks.length]);

    if (!isVisible || tasks.length === 0) return null;

    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const total = tasks.length;
    const allDone = completed + failed >= total;

    return (
        <div className="flex-shrink-0 border-b border-[rgba(182,145,97,0.12)]">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/5 transition-colors"
            >
                <div className={cn(
                    'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
                    allDone && failed === 0 ? 'bg-emerald-400/15 text-emerald-400' :
                    allDone && failed > 0 ? 'bg-red-400/15 text-red-400' :
                    'bg-[#c9a474]/15 text-[#c9a474]',
                )}>
                    {!allDone ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : failed > 0 ? (
                        <AlertCircle className="w-3.5 h-3.5" />
                    ) : (
                        <Check className="w-3.5 h-3.5" />
                    )}
                </div>
                <span className="flex-1 text-left text-xs font-semibold text-white/90">
                    Tasks
                </span>
                <span className={cn(
                    'text-[10px] font-medium tabular-nums',
                    allDone && failed === 0 ? 'text-emerald-400' :
                    failed > 0 ? 'text-red-400' :
                    'text-white/50',
                )}>
                    {completed}/{total}
                </span>
                <ChevronDown className={cn(
                    'w-3.5 h-3.5 text-white/40 transition-transform duration-200',
                    !isExpanded && '-rotate-90',
                )} />
            </button>

            {/* Task list */}
            {isExpanded && (
                <div className="px-4 pb-3 space-y-0.5 animate-slide-up">
                    {tasks.map((task) => (
                        <div
                            key={task.id}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg"
                        >
                            {/* Status indicator */}
                            <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                {task.status === 'running' ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#c9a474]" />
                                ) : task.status === 'completed' ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : task.status === 'failed' ? (
                                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                ) : (
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                )}
                            </div>
                            {/* Description */}
                            <span className={cn(
                                'text-[11px] truncate',
                                task.status === 'completed' ? 'text-white/50' :
                                task.status === 'running' ? 'text-white/90' :
                                task.status === 'failed' ? 'text-red-400/80' :
                                'text-white/40',
                            )}>
                                {task.description}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
