'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Check, AlertCircle, ChevronDown, ChevronRight, Brain, Wrench, FileCode, Search, Globe } from 'lucide-react';

export interface ThinkingStep {
    id?: string;
    text?: string | null;
    message?: string | null; // Supabase format
    status: 'pending' | 'running' | 'complete' | 'error';
    type?: 'thinking' | 'tool' | 'result';
    details?: string | any; // Can be string or JSON object
    toolName?: string | null;
    tool_name?: string | null; // Supabase format
    created_at?: string;
}

interface ThinkingStepsProps {
    steps: ThinkingStep[];
    isComplete?: boolean;
    thinking?: string[];
}

export function ThinkingSteps({ steps, isComplete = false, thinking = [] }: ThinkingStepsProps) {
    // Auto-expand when agent is working, collapse when complete
    const [isExpanded, setIsExpanded] = useState(!isComplete);
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

    // Auto-expand when new thinking starts
    React.useEffect(() => {
        if (!isComplete && (steps.length > 0 || thinking.length > 0)) {
            setIsExpanded(true);
        }
    }, [isComplete, steps.length, thinking.length]);

    if (steps.length === 0 && thinking.length === 0) return null;

    const toggleStep = (index: number) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const getToolIcon = (toolName?: string) => {
        if (!toolName) return <Wrench className="w-3 h-3" />;
        if (toolName.includes('search') || toolName.includes('grep')) return <Search className="w-3 h-3" />;
        if (toolName.includes('file') || toolName.includes('write') || toolName.includes('read')) return <FileCode className="w-3 h-3" />;
        if (toolName.includes('web') || toolName.includes('fetch')) return <Globe className="w-3 h-3" />;
        return <Wrench className="w-3 h-3" />;
    };

    return (
        <div className="p-3">
            <div className="space-y-2 p-3 bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-xl shadow-sm">
                {/* Header with expand toggle */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between gap-2 hover:bg-slate-100/50 rounded-lg p-1 -m-1 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        {!isComplete ? (
                            <div className="relative">
                                <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[var(--accent-primary)] rounded-full animate-pulse" />
                            </div>
                        ) : (
                            <Check className="w-4 h-4 text-green-500" />
                        )}
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                            {isComplete ? 'Task Complete' : 'Agent Working...'}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                            {steps.length} step{steps.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-[var(--text-muted)]">
                        <span className="text-xs">
                            {isExpanded ? 'Hide details' : 'Show details'}
                        </span>
                        {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                        )}
                    </div>
                </button>

                {/* Current step indicator (always visible) */}
                {!isComplete && (
                    <div className="flex items-center gap-2 pl-1 mt-2">
                        <Loader2 className="w-3 h-3 animate-spin text-[var(--accent-primary)]" />
                        <span className="text-xs text-[var(--text-primary)] font-medium">
                            {steps.length > 0
                                ? (steps[steps.length - 1]?.text || steps[steps.length - 1]?.message || 'Processing...')
                                : thinking.length > 0
                                    ? 'Agent thinking...'
                                    : 'Processing...'}
                        </span>
                    </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-slate-200/50 pt-3">
                        {/* Thinking section */}
                        {thinking.length > 0 && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                                    <Brain className="w-3 h-3" />
                                    <span>Agent Thinking</span>
                                </div>
                                <div className="pl-4 space-y-1 text-xs text-[var(--text-secondary)] bg-slate-100/50 rounded-lg p-2 font-mono max-h-32 overflow-y-auto">
                                    {thinking.map((thought, i) => (
                                        <div key={i} className="leading-relaxed">
                                            {thought}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Steps list */}
                        <div className="space-y-1.5">
                            {steps.map((step, index) => {
                                // Support both old format (text/toolName) and new Supabase format (message/tool_name)
                                const stepText = step.message || step.text || 'Processing...';
                                const stepToolName = step.tool_name || step.toolName;
                                const stepDetails = typeof step.details === 'string'
                                    ? step.details
                                    : step.details
                                        ? JSON.stringify(step.details, null, 2)
                                        : undefined;

                                return (
                                    <div key={step.id || index} className="group">
                                        <button
                                            onClick={() => stepDetails && toggleStep(index)}
                                            className={cn(
                                                'w-full flex items-start gap-2 text-xs transition-all duration-200 p-1.5 rounded-lg',
                                                stepDetails && 'hover:bg-slate-100/70 cursor-pointer',
                                                !stepDetails && 'cursor-default'
                                            )}
                                        >
                                            {/* Status icon */}
                                            <div className="flex-shrink-0 mt-0.5">
                                                {(step.status === 'pending' || step.status === 'running') && index === steps.length - 1 ? (
                                                    <Loader2 className="w-3 h-3 animate-spin text-[var(--accent-primary)]" />
                                                ) : step.status === 'error' ? (
                                                    <AlertCircle className="w-3 h-3 text-red-500" />
                                                ) : (
                                                    <Check className="w-3 h-3 text-green-500" />
                                                )}
                                            </div>

                                            {/* Step content */}
                                            <div className="flex-1 text-left">
                                                <div className="flex items-center gap-1.5">
                                                    {stepToolName && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/70 text-[var(--text-muted)]">
                                                            {getToolIcon(stepToolName)}
                                                            <span className="font-mono text-[10px]">{stepToolName}</span>
                                                        </span>
                                                    )}
                                                    <span className={cn(
                                                        'text-[var(--text-secondary)]',
                                                        index === steps.length - 1 && !isComplete && 'text-[var(--text-primary)] font-medium'
                                                    )}>
                                                        {stepText}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Expand icon */}
                                            {stepDetails && (
                                                <div className="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                                                    {expandedSteps.has(index) ? (
                                                        <ChevronDown className="w-3 h-3" />
                                                    ) : (
                                                        <ChevronRight className="w-3 h-3" />
                                                    )}
                                                </div>
                                            )}
                                        </button>

                                        {/* Expanded details for this step */}
                                        {stepDetails && expandedSteps.has(index) && (
                                            <div className="ml-5 mt-1 p-2 bg-slate-100 rounded-lg text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto">
                                                {stepDetails}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Compact version for inline display
export function ThinkingIndicator({ text = 'Thinking...', toolName }: { text?: string; toolName?: string }) {
    return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-100 to-blue-50 rounded-full text-xs">
            <div className="relative">
                <Brain className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full animate-pulse" />
            </div>
            {toolName && (
                <span className="font-mono text-[var(--text-muted)] bg-slate-200 px-1.5 py-0.5 rounded">
                    {toolName}
                </span>
            )}
            <span className="text-[var(--text-secondary)]">{text}</span>
        </div>
    );
}
