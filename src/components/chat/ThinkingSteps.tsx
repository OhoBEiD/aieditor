'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Check, AlertCircle, ChevronDown, Brain, Wrench, FileCode, Search, Globe, Layout, Palette, Terminal, Zap, ExternalLink, Settings2, File, RefreshCw, ShieldCheck, Trash2, FolderOpen } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getFileIconUrl } from '@/components/editor/FileTree';

// File icon with fallback
function StepFileIcon({ fileName }: { fileName: string }) {
    const [hasError, setHasError] = React.useState(false);
    const iconUrl = getFileIconUrl(fileName);

    if (hasError) {
        return <File className="w-3.5 h-3.5 text-[#b69161]/60 shrink-0" />;
    }

    return (
        <img
            src={iconUrl}
            alt={fileName}
            className="w-3.5 h-3.5 object-contain shrink-0"
            onError={() => setHasError(true)}
        />
    );
}

export interface ThinkingStep {
    id?: string;
    text?: string | null;
    message?: string | null;
    status: 'pending' | 'running' | 'complete' | 'error';
    type?: 'thinking' | 'tool' | 'result';
    details?: string | any;
    toolName?: string | null;
    tool_name?: string | null;
    created_at?: string;
}

interface ThinkingStepsProps {
    steps: ThinkingStep[];
    isComplete?: boolean;
    thinking?: string[];
    onFileClick?: (filePath: string) => void;
}

// Extract file path from step text
function extractFileName(text: string): string | null {
    if (!text) return null;
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
                onClick={(e) => { e.stopPropagation(); onFileClick(fileName); }}
                className="inline-flex items-center gap-0.5 text-[#b69161] hover:text-[#b69161] hover:underline font-medium"
            >
                {fileName}
                <ExternalLink className="w-2.5 h-2.5" />
            </button>
            {parts[1]}
        </>
    );
}

// Streaming text with cursor
function StreamingText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [displayedText, setDisplayedText] = useState('');
    const [showCursor, setShowCursor] = useState(true);
    const targetTextRef = useRef(text);
    const displayedIndexRef = useRef(0);

    useEffect(() => {
        targetTextRef.current = text;
        if (!isStreaming) {
            setDisplayedText(text);
            displayedIndexRef.current = text.length;
            setShowCursor(false);
        }
    }, [text, isStreaming]);

    useEffect(() => {
        if (!isStreaming) return;
        const target = targetTextRef.current;
        if (displayedIndexRef.current < target.length) {
            const charsToAdd = Math.min(5, target.length - displayedIndexRef.current);
            const timer = setTimeout(() => {
                displayedIndexRef.current += charsToAdd;
                setDisplayedText(target.slice(0, displayedIndexRef.current));
            }, 8);
            return () => clearTimeout(timer);
        }
    }, [isStreaming, displayedText]);

    useEffect(() => {
        if (containerRef.current && isStreaming) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [displayedText, isStreaming]);

    useEffect(() => {
        if (!isStreaming) { setShowCursor(false); return; }
        const timer = setInterval(() => setShowCursor(prev => !prev), 530);
        return () => clearInterval(timer);
    }, [isStreaming]);

    const lines = displayedText.split('\n');

    return (
        <div ref={containerRef} className="relative overflow-y-auto scroll-smooth">
            {lines.map((line, i) => (
                <div key={i} className="leading-relaxed">
                    {line || '\u00A0'}
                    {i === lines.length - 1 && isStreaming && (
                        <span className={cn(
                            "inline-block w-[2px] h-[14px] bg-[#b69161] ml-0.5 align-middle rounded-sm transition-opacity duration-100",
                            showCursor ? "opacity-100" : "opacity-30"
                        )} />
                    )}
                </div>
            ))}
            {displayedText === '' && isStreaming && (
                <div className="flex items-center gap-1 text-[#a89d8e]">
                    <span className={cn(
                        "inline-block w-[2px] h-[14px] bg-[#b69161] rounded-sm transition-opacity duration-100",
                        showCursor ? "opacity-100" : "opacity-30"
                    )} />
                </div>
            )}
        </div>
    );
}

// Check if a step is a file operation
function isFileOperation(step: ThinkingStep): boolean {
    const toolName = (step.tool_name || step.toolName || '').toLowerCase();
    return toolName.includes('write') || toolName.includes('create') || toolName.includes('modify') || toolName.includes('replace') || toolName.includes('read') || toolName.includes('edit') || toolName.includes('delete');
}

// Extract diff-like stats from step details
function extractDiffStats(step: ThinkingStep): { additions: number; deletions: number } | null {
    if (!step.details) return null;
    const content = typeof step.details === 'string' ? step.details : step.details?.content;
    if (!content || typeof content !== 'string') return null;
    const lines = content.split('\n');
    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }
    // If no diff-like content, estimate from content length
    if (additions === 0 && deletions === 0 && content.length > 10) {
        additions = Math.min(lines.length, 20);
    }
    return additions > 0 || deletions > 0 ? { additions, deletions } : null;
}

export function ThinkingSteps({ steps, isComplete = false, thinking = [], onFileClick }: ThinkingStepsProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
    const previousRunningIndexRef = useRef<number | null>(null);
    const lastAutoExpandedPlanningRef = useRef<number | null>(null);

    const runningStepIndex = steps.findIndex((step, idx) =>
        (step.status === 'running' || step.status === 'pending') && idx === steps.length - 1
    );

    useEffect(() => {
        if (runningStepIndex === -1) return;
        const prevRunning = previousRunningIndexRef.current;
        if (prevRunning === runningStepIndex) return;
        setExpandedSteps(prev => {
            const next = new Set(prev);
            let changed = false;
            if (prevRunning !== null && next.has(prevRunning)) { next.delete(prevRunning); changed = true; }
            if (!next.has(runningStepIndex)) { next.add(runningStepIndex); changed = true; }
            return changed ? next : prev;
        });
        previousRunningIndexRef.current = runningStepIndex;
    }, [runningStepIndex]);

    useEffect(() => {
        steps.forEach((step, index) => {
            const toolName = (step.tool_name || step.toolName || '').toLowerCase();
            const isPlanning = toolName === 'planning';
            const hasPlanContent = step.details?.content && typeof step.details.content === 'string' && step.details.content.trim().length > 0;
            const isRunning = step.status === 'running' || step.status === 'pending';
            const isStepComplete = step.status === 'complete';
            if (isPlanning && (isRunning || isStepComplete) && hasPlanContent && lastAutoExpandedPlanningRef.current !== index) {
                setExpandedSteps(prev => {
                    if (prev.has(index)) return prev;
                    const next = new Set(prev);
                    next.add(index);
                    return next;
                });
                lastAutoExpandedPlanningRef.current = index;
            }
        });
    }, [steps]);

    useEffect(() => {
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
        setExpandedSteps(prev => {
            if (prev.has(planningIndex)) return prev;
            const next = new Set(prev);
            next.add(planningIndex);
            return next;
        });
        lastAutoExpandedPlanningRef.current = planningIndex;
    }, [steps]);

    useEffect(() => {
        if (steps.length > 0 || thinking.length > 0) setIsExpanded(true);
    }, [steps.length, thinking.length]);

    if (steps.length === 0 && thinking.length === 0) return null;

    const toggleStep = (index: number) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const getToolIcon = (toolName?: string) => {
        if (!toolName) return <Wrench className="w-3.5 h-3.5" />;
        const name = (toolName || '').toLowerCase();
        // Agent phases
        if (name === 'planning' || name === 'replanning') return <Layout className="w-3.5 h-3.5 text-[#b69161]" />;
        if (name === 'classifying' || name === 'thinking') return <Brain className="w-3.5 h-3.5 text-[#b69161]" />;
        if (name === 'exploring') return <Search className="w-3.5 h-3.5 text-[#d4a843]" />;
        if (name === 'verifying') return <ShieldCheck className="w-3.5 h-3.5 text-[#6b8f71]" />;
        if (name === 'replan') return <RefreshCw className="w-3.5 h-3.5 text-[#b69161]" />;
        // Task progress
        if (name === 'task_start' || name === 'task_started') return <Zap className="w-3.5 h-3.5 text-[#d4a843]" />;
        if (name === 'task_complete' || name === 'task_completed') return <Check className="w-3.5 h-3.5 text-green-400" />;
        if (name === 'task_failed') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
        // File tools
        if (name.includes('search') || name.includes('grep') || name.includes('glob')) return <Search className="w-3.5 h-3.5 text-[#d4a843]" />;
        if (name.includes('write') || name.includes('create')) return <FileCode className="w-3.5 h-3.5 text-green-400" />;
        if (name.includes('edit') || name.includes('modify') || name.includes('replace')) return <Zap className="w-3.5 h-3.5 text-[#b69161]" />;
        if (name.includes('read') || name.includes('view')) return <FileCode className="w-3.5 h-3.5 text-[#b69161]" />;
        if (name.includes('delete')) return <Trash2 className="w-3.5 h-3.5 text-red-400" />;
        if (name.includes('list')) return <FolderOpen className="w-3.5 h-3.5 text-[#a89d8e]" />;
        // Other
        if (name.includes('image')) return <Palette className="w-3.5 h-3.5 text-pink-400" />;
        if (name.includes('terminal') || name.includes('command') || name.includes('run')) return <Terminal className="w-3.5 h-3.5 text-[#7a6f60]" />;
        if (name.includes('web') || name.includes('fetch')) return <Globe className="w-3.5 h-3.5 text-[#b69161]" />;
        return <Settings2 className="w-3.5 h-3.5 text-[#a89d8e]" />;
    };

    const filteredSteps = steps.filter(step => {
        const toolName = (step.tool_name || step.toolName || '').toLowerCase();
        return toolName !== 'generate_image';
    });

    return (
        <div className="px-4 py-2">
            {/* "Called N tools" header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 py-1 group"
            >
                <span className="text-xs font-medium text-[#6b8f71]">
                    {!isComplete ? (
                        <span className="flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Calling {filteredSteps.length} tool{filteredSteps.length !== 1 ? 's' : ''}
                        </span>
                    ) : (
                        `Called ${filteredSteps.length} tool${filteredSteps.length !== 1 ? 's' : ''}`
                    )}
                </span>
                <ChevronDown className={cn(
                    "w-3 h-3 text-[#a89d8e] transition-transform",
                    !isExpanded && "-rotate-90"
                )} />
            </button>

            {/* Expanded: show steps as file cards */}
            {isExpanded && (
                <div className="mt-2 space-y-1.5">
                    {/* Thinking section */}
                    {thinking.length > 0 && (
                        <div className="px-3 py-2 bg-[#d6cfc9]/30 rounded-lg border border-[#b69161]/10">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-[#7a6f60] mb-1">
                                <Brain className="w-3 h-3" />
                                <span>Thinking</span>
                            </div>
                            <div className="text-xs text-[#a89d8e] font-mono max-h-24 overflow-y-auto">
                                {thinking.map((thought, i) => (
                                    <div key={i} className="leading-relaxed">{thought}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step cards */}
                    {filteredSteps.map((step, index) => {
                        const stepText = step.message || step.text || 'Processing...';
                        const stepToolName = step.tool_name || step.toolName;
                        const fileName = extractFileName(stepText);
                        const isFileOp = isFileOperation(step);
                        const diffStats = isFileOp ? extractDiffStats(step) : null;

                        let stepDetails: string | undefined;
                        if (typeof step.details === 'string') {
                            stepDetails = step.details;
                        } else if (step.details && step.details.content) {
                            stepDetails = step.details.content;
                        } else if (step.details && Object.keys(step.details).length > 0) {
                            stepDetails = JSON.stringify(step.details, null, 2);
                        }
                        const hasMeaningfulDetails = stepDetails && stepDetails !== '{}';
                        const isStepExpanded = expandedSteps.has(index);

                        // File operation card
                        if (isFileOp && fileName) {
                            return (
                                <div key={step.id || index}>
                                    <button
                                        onClick={() => hasMeaningfulDetails && toggleStep(index)}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-left",
                                            "bg-transparent border-[#b69161]/10 hover:border-[#b69161]/20 hover:bg-[#d6cfc9]/20"
                                        )}
                                    >
                                        {/* File type icon */}
                                        {(step.status === 'running' || step.status === 'pending') ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#b69161] shrink-0" />
                                        ) : (
                                            <StepFileIcon fileName={fileName} />
                                        )}

                                        {/* File name */}
                                        <span className="text-xs font-medium text-[#b69161]/80 truncate">
                                            {fileName}
                                        </span>

                                        {/* Diff stats */}
                                        {diffStats && (
                                            <span className="ml-auto flex items-center gap-1 shrink-0">
                                                {diffStats.additions > 0 && (
                                                    <span className="text-[10px] font-medium text-green-400">+{diffStats.additions}</span>
                                                )}
                                                {diffStats.deletions > 0 && (
                                                    <span className="text-[10px] font-medium text-red-400">-{diffStats.deletions}</span>
                                                )}
                                            </span>
                                        )}

                                        {/* Expand chevron */}
                                        {hasMeaningfulDetails && (
                                            <ChevronDown className={cn(
                                                "w-3 h-3 text-[#b69161]/40 shrink-0 transition-transform",
                                                !isStepExpanded && "-rotate-90"
                                            )} />
                                        )}
                                    </button>

                                    {/* Expanded code preview */}
                                    {hasMeaningfulDetails && isStepExpanded && stepDetails && (
                                        <div className="mt-1 rounded-lg overflow-hidden border border-[#b69161]/10 bg-[#f2efed] max-h-64 overflow-y-auto">
                                            <SyntaxHighlighter
                                                language="typescript"
                                                style={oneDark}
                                                showLineNumbers
                                                customStyle={{
                                                    margin: 0,
                                                    padding: '10px 12px',
                                                    background: '#f2efed',
                                                    fontSize: '11px',
                                                    lineHeight: '1.5',
                                                }}
                                                lineNumberStyle={{
                                                    color: '#a89d8e',
                                                    fontSize: '10px',
                                                    minWidth: '2em',
                                                    paddingRight: '10px',
                                                }}
                                            >
                                                {stepDetails.slice(0, 3000)}
                                            </SyntaxHighlighter>
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // Non-file step (planning, thinking, etc.)
                        return (
                            <div key={step.id || index}>
                                <div
                                    className={cn(
                                        'flex items-start gap-2 text-xs py-1.5 px-1 rounded-lg transition-colors',
                                        hasMeaningfulDetails && 'cursor-pointer hover:bg-[#d6cfc9]/30'
                                    )}
                                    onClick={() => hasMeaningfulDetails && toggleStep(index)}
                                >
                                    {/* Status */}
                                    <div className="flex-shrink-0 mt-0.5">
                                        {(step.status === 'pending' || step.status === 'running') && index === steps.length - 1 ? (
                                            <Loader2 className="w-3 h-3 animate-spin text-[#b69161]" />
                                        ) : step.status === 'error' ? (
                                            <AlertCircle className="w-3 h-3 text-red-400" />
                                        ) : (
                                            <Check className="w-3 h-3 text-green-400" />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {stepToolName && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#d6cfc9]/30 text-[#7a6f60]">
                                                    {getToolIcon(stepToolName)}
                                                    <span className="font-mono text-[10px]">{stepToolName}</span>
                                                </span>
                                            )}
                                            <span className={cn(
                                                'text-[#7a6f60]',
                                                index === steps.length - 1 && !isComplete && 'text-[#2c2418] font-medium'
                                            )}>
                                                {renderTextWithFileLink(stepText, onFileClick)}
                                            </span>
                                        </div>
                                    </div>

                                    {hasMeaningfulDetails && (
                                        <ChevronDown className={cn(
                                            "w-3 h-3 text-[#a89d8e] shrink-0 mt-0.5 transition-transform",
                                            !isStepExpanded && "-rotate-90"
                                        )} />
                                    )}
                                </div>

                                {/* Expanded detail */}
                                {hasMeaningfulDetails && isStepExpanded && stepDetails && (
                                    <div className="ml-5 mt-1 p-2 bg-[#d6cfc9]/30 rounded-lg text-xs font-mono text-[#7a6f60] whitespace-pre-wrap max-h-48 overflow-y-auto border border-[#b69161]/10">
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
            )}
        </div>
    );
}

// Compact indicator
export function ThinkingIndicator({ text = 'Thinking...', toolName }: { text?: string; toolName?: string }) {
    return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#d6cfc9]/30 rounded-full text-xs border border-[#b69161]/10">
            <div className="relative">
                <Brain className="w-3.5 h-3.5 text-[#b69161]" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#b69161] rounded-full animate-pulse" />
            </div>
            {toolName && (
                <span className="font-mono text-[#a89d8e] bg-[#d6cfc9]/30 px-1.5 py-0.5 rounded">{toolName}</span>
            )}
            <span className="text-[#7a6f60]">{text}</span>
        </div>
    );
}
