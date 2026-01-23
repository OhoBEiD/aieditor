'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Check, AlertCircle, ChevronDown, ChevronRight, Brain, Wrench, FileCode, Search, Globe, Layout, Palette, Terminal, Zap, ExternalLink } from 'lucide-react';

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
    onFileClick?: (filePath: string) => void;
}

// Extract file path from step text (e.g., "Writing Button.tsx" -> "Button.tsx")
function extractFileName(text: string): string | null {
    if (!text) return null;

    // Common patterns: "Writing filename.tsx", "Reading filename.ts", "Modifying filename.tsx"
    const patterns = [
        /(?:Writing|Creating|Reading|Modifying|Deleting)\s+([^\s]+\.\w+)/i,
        /([^\s]+\.(?:tsx?|jsx?|css|scss|json|md|html|vue|svelte))/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1];
    }

    return null;
}

// Parse text and make file names clickable
function renderTextWithFileLink(
    text: string,
    onFileClick?: (filePath: string) => void
): React.ReactNode {
    if (!onFileClick) return text;

    const fileName = extractFileName(text);
    if (!fileName) return text;

    const parts = text.split(fileName);
    if (parts.length !== 2) return text;

    return (
        <>
            {parts[0]}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onFileClick(fileName);
                }}
                className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 hover:underline font-medium"
            >
                {fileName}
                <ExternalLink className="w-2.5 h-2.5" />
            </button>
            {parts[1]}
        </>
    );
}

// Streaming text animation component with auto-scroll (Cursor-style)
function StreamingText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [displayedText, setDisplayedText] = useState('');
    const [showCursor, setShowCursor] = useState(true);
    const targetTextRef = useRef(text);
    const displayedIndexRef = useRef(0);

    // Update target text when prop changes
    useEffect(() => {
        targetTextRef.current = text;

        // If not streaming, show all immediately
        if (!isStreaming) {
            setDisplayedText(text);
            displayedIndexRef.current = text.length;
            setShowCursor(false);
        }
    }, [text, isStreaming]);

    // Typing animation - only runs when streaming
    useEffect(() => {
        if (!isStreaming) return;

        const target = targetTextRef.current;

        // If we haven't displayed everything yet
        if (displayedIndexRef.current < target.length) {
            // Type multiple characters at once for speed
            const charsToAdd = Math.min(5, target.length - displayedIndexRef.current);
            const timer = setTimeout(() => {
                displayedIndexRef.current += charsToAdd;
                setDisplayedText(target.slice(0, displayedIndexRef.current));
            }, 8);
            return () => clearTimeout(timer);
        }
    }, [isStreaming, displayedText]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (containerRef.current && isStreaming) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [displayedText, isStreaming]);

    // Cursor blink
    useEffect(() => {
        if (!isStreaming) {
            setShowCursor(false);
            return;
        }
        const timer = setInterval(() => setShowCursor(prev => !prev), 530);
        return () => clearInterval(timer);
    }, [isStreaming]);

    // Split displayed text into lines for rendering
    const lines = displayedText.split('\n');

    return (
        <div
            ref={containerRef}
            className="relative overflow-y-auto scroll-smooth"
        >
            {lines.map((line, i) => (
                <div
                    key={i}
                    className="leading-relaxed"
                    style={{
                        animation: isStreaming && i === lines.length - 1
                            ? 'none'
                            : 'fadeSlideIn 0.1s ease-out'
                    }}
                >
                    {line || '\u00A0'}
                    {i === lines.length - 1 && isStreaming && (
                        <span
                            className={cn(
                                "inline-block w-[2px] h-[14px] bg-blue-500 ml-0.5 align-middle rounded-sm transition-opacity duration-100",
                                showCursor ? "opacity-100" : "opacity-30"
                            )}
                        />
                    )}
                </div>
            ))}
            {displayedText === '' && isStreaming && (
                <div className="flex items-center gap-1 text-gray-400">
                    <span className={cn(
                        "inline-block w-[2px] h-[14px] bg-blue-500 rounded-sm transition-opacity duration-100",
                        showCursor ? "opacity-100" : "opacity-30"
                    )} />
                </div>
            )}
            <style jsx>{`
                @keyframes fadeSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(2px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}

export function ThinkingSteps({ steps, isComplete = false, thinking = [], onFileClick }: ThinkingStepsProps) {
    // Always start expanded, and stay expanded even after completion (for review)
    const [isExpanded, setIsExpanded] = useState(true);
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
    // Use a ref to avoid setState loops when steps are streaming rapidly
    const previousRunningIndexRef = useRef<number | null>(null);
    const lastAutoExpandedPlanningRef = useRef<number | null>(null);

    // Find currently running step
    const runningStepIndex = steps.findIndex((step, idx) =>
        (step.status === 'running' || step.status === 'pending') && idx === steps.length - 1
    );

    // Auto-expand running step and collapse previous when a new step starts
    useEffect(() => {
        if (runningStepIndex === -1) return;

        const prevRunning = previousRunningIndexRef.current;
        if (prevRunning === runningStepIndex) return;

        setExpandedSteps(prev => {
            // Only update state if something actually changes (prevents max update depth)
            const next = new Set(prev);
            let changed = false;

            if (prevRunning !== null && next.has(prevRunning)) {
                next.delete(prevRunning);
                changed = true;
            }
            if (!next.has(runningStepIndex)) {
                next.add(runningStepIndex);
                changed = true;
            }

            return changed ? next : prev;
        });

        previousRunningIndexRef.current = runningStepIndex;
    }, [runningStepIndex]);

    // Auto-expand planning steps when they start running (show live plan streaming)
    useEffect(() => {
        steps.forEach((step, index) => {
            const toolName = (step.tool_name || step.toolName || '').toLowerCase();
            const isPlanning = toolName === 'planning';
            const hasPlanContent = step.details?.content && typeof step.details.content === 'string' && step.details.content.trim().length > 0;
            const isRunning = step.status === 'running' || step.status === 'pending';
            const isComplete = step.status === 'complete';
            
            // Auto-expand planning steps when they start (for live streaming) or when they complete
            if (isPlanning && (isRunning || isComplete) && hasPlanContent && lastAutoExpandedPlanningRef.current !== index) {
                setExpandedSteps(prev => {
                    if (prev.has(index)) return prev; // Already expanded
                    const next = new Set(prev);
                    next.add(index);
                    return next;
                });
                lastAutoExpandedPlanningRef.current = index;
            }
        });
    }, [steps]);

    // DON'T collapse steps when complete - keep them visible for review
    // Removed the collapse-on-complete effect

    // Auto-expand the planning step once it completes (so users can see the plan in the panel)
    useEffect(() => {
        // Find latest completed planning step with meaningful details
        const planningIndex = [...steps]
            .map((s, idx) => ({ s, idx }))
            .reverse()
            .find(({ s }) => {
                const toolName = (s.tool_name || s.toolName || '').toLowerCase();
                const hasDetails =
                    (typeof s.details === 'string' && s.details.trim() !== '' && s.details !== '{}') ||
                    (s.details && typeof s.details === 'object' && Object.keys(s.details).length > 0);
                return toolName === 'planning' && s.status === 'complete' && hasDetails;
            })?.idx;

        if (planningIndex === undefined) return;
        if (lastAutoExpandedPlanningRef.current === planningIndex) return;

        // Expand the planning step by default
        setExpandedSteps(prev => {
            if (prev.has(planningIndex)) return prev;
            const next = new Set(prev);
            next.add(planningIndex);
            return next;
        });
        lastAutoExpandedPlanningRef.current = planningIndex;
    }, [steps]);

    // Auto-expand when new thinking starts, and keep expanded when complete (so user can review)
    useEffect(() => {
        if (steps.length > 0 || thinking.length > 0) {
            setIsExpanded(true);
        }
    }, [steps.length, thinking.length]);

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
        const name = (toolName || '').toLowerCase();

        if (name === 'planning') return <Layout className="w-3 h-3 text-purple-500" />;
        if (name === 'classifying' || name === 'thinking') return <Brain className="w-3 h-3 text-blue-500" />;
        if (name.includes('search') || name.includes('grep')) return <Search className="w-3 h-3 text-amber-500" />;
        if (name.includes('write') || name.includes('create')) return <FileCode className="w-3 h-3 text-green-500" />;
        if (name.includes('read') || name.includes('view')) return <FileCode className="w-3 h-3 text-blue-400" />;
        if (name.includes('modify') || name.includes('replace')) return <Zap className="w-3 h-3 text-orange-500" />;
        if (name.includes('image')) return <Palette className="w-3 h-3 text-pink-500" />;
        if (name.includes('terminal') || name.includes('command') || name.includes('run')) return <Terminal className="w-3 h-3 text-slate-600" />;
        if (name.includes('web') || name.includes('fetch')) return <Globe className="w-3 h-3 text-cyan-500" />;

        return <Wrench className="w-3 h-3 text-gray-400" />;
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
                        <span className="text-xs font-semibold text-gray-900">
                            {isComplete ? 'Task Complete' : 'Agent Working...'}
                        </span>
                        <span className="text-xs text-gray-500">
                            {steps.length} step{steps.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500">
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
                        <span className="text-xs text-gray-900 font-medium">
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
                                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                    <Brain className="w-3 h-3" />
                                    <span>Agent Thinking</span>
                                </div>
                                <div className="pl-4 space-y-1 text-xs text-gray-600 bg-slate-100/50 rounded-lg p-2 font-mono max-h-32 overflow-y-auto">
                                    {thinking.map((thought, i) => (
                                        <div key={i} className="leading-relaxed">
                                            {thought}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Steps list */}
                        <div className="space-y-1">
                            {steps
                                .filter(step => {
                                    const toolName = (step.tool_name || step.toolName || '').toLowerCase();
                                    // Keep all steps including completion step
                                    return toolName !== 'generate_image';
                                })
                                .map((step, index) => {
                                    // Support both old format (text/toolName) and new Supabase format (message/tool_name)
                                    const stepText = step.message || step.text || 'Processing...';
                                    const stepToolName = step.tool_name || step.toolName;

                                    // Handle details display logic
                                    let stepDetails: string | undefined;
                                    if (typeof step.details === 'string') {
                                        stepDetails = step.details;
                                    } else if (step.details && step.details.content) {
                                        stepDetails = step.details.content;
                                    } else if (step.details && Object.keys(step.details).length > 0) {
                                        stepDetails = JSON.stringify(step.details, null, 2);
                                    }

                                    // Hide detail toggle if it's just an empty object string or null
                                    const hasMeaningfulDetails = stepDetails && stepDetails !== '{}';
                                    const isStepExpanded = expandedSteps.has(index);

                                    return (
                                        <div key={step.id || index} className="group">
                                            <div
                                                className={cn(
                                                    'flex items-start gap-2 text-xs transition-all duration-200 p-1.5 rounded-lg',
                                                    hasMeaningfulDetails && 'hover:bg-slate-100/70'
                                                )}
                                            >
                                                {/* Expand arrow - only show if has details */}
                                                <button
                                                    onClick={() => hasMeaningfulDetails && toggleStep(index)}
                                                    className={cn(
                                                        'flex-shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center rounded transition-colors',
                                                        hasMeaningfulDetails && 'hover:bg-slate-200 cursor-pointer',
                                                        !hasMeaningfulDetails && 'opacity-0'
                                                    )}
                                                    disabled={!hasMeaningfulDetails}
                                                >
                                                    {isStepExpanded ? (
                                                        <ChevronDown className="w-3 h-3 text-gray-500" />
                                                    ) : (
                                                        <ChevronRight className="w-3 h-3 text-gray-500" />
                                                    )}
                                                </button>

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
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {stepToolName && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/70 text-gray-500">
                                                                {getToolIcon(stepToolName)}
                                                                <span className="font-mono text-[10px]">{stepToolName}</span>
                                                            </span>
                                                        )}
                                                        <span className={cn(
                                                            'text-gray-600',
                                                            index === steps.length - 1 && !isComplete && 'text-gray-900 font-medium'
                                                        )}>
                                                            {renderTextWithFileLink(stepText, onFileClick)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expanded details for this step */}
                                            {hasMeaningfulDetails && isStepExpanded && stepDetails && (
                                                <div className="ml-9 mt-1 p-2 bg-slate-100 rounded-lg text-xs font-mono text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-200">
                                                    <StreamingText
                                                        text={stepDetails}
                                                        isStreaming={step.status === 'running' || step.status === 'pending'}
                                                    />
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
                <span className="font-mono text-gray-500 bg-slate-200 px-1.5 py-0.5 rounded">
                    {toolName}
                </span>
            )}
            <span className="text-gray-600">{text}</span>
        </div>
    );
}
