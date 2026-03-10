'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Check, AlertCircle, ChevronDown, Brain, Wrench, FileCode, Search, Globe, Layout, Zap, Settings2, File, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
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

// --- Step classification helpers ---

const PHASE_TOOLS = new Set(['thinking', 'classifying', 'exploring', 'planning', 'replanning', 'routing', 'verifying', 'replan', 'executing']);
const TASK_TOOLS = new Set(['task_start', 'task_started', 'task_complete', 'task_completed', 'task_failed']);
const BUILD_TOOLS = new Set(['build_check', 'build_fix', 'build_validation', 'validate_build', 'fix_write', 'fix_edit', 'fix_read', 'fix_search']);
const LOOKUP_TOOLS = new Set(['list_files', 'grep_search', 'glob_search', 'check_syntax', 'repo_map']);
const QUALITY_TOOLS = new Set(['quality_check', 'test_gen', 'brain_save']);
const COMPLETE_TOOLS = new Set(['complete']);

function getStepCategory(step: ThinkingStep): string {
    const name = (step.tool_name || step.toolName || '').toLowerCase();
    if (PHASE_TOOLS.has(name)) return 'phase';
    if (TASK_TOOLS.has(name)) return 'task';
    if (BUILD_TOOLS.has(name)) return 'build';
    if (LOOKUP_TOOLS.has(name)) return 'lookup';
    if (QUALITY_TOOLS.has(name)) return 'quality';
    if (COMPLETE_TOOLS.has(name)) return 'complete';
    if (name.includes('write') || name.includes('create') || name.includes('modify') || name.includes('replace') || name.includes('edit') || name.includes('delete') || name.includes('read')) return 'file';
    return 'other';
}

function extractFileName(text: string): string | null {
    if (!text) return null;
    const patterns = [
        /(?:Writing|Creating|Reading|Modifying|Deleting|Fixing)\s+([^\s]+\.\w+)/i,
        /([^\s]+\.(?:tsx?|jsx?|css|scss|json|md|html|vue|svelte))/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1];
    }
    return null;
}

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
    if (additions === 0 && deletions === 0 && content.length > 10) {
        additions = Math.min(lines.length, 20);
    }
    return additions > 0 || deletions > 0 ? { additions, deletions } : null;
}

// --- Grouping logic ---

interface GroupedItem {
    type: 'phase' | 'file_group' | 'task_group' | 'build_group' | 'quality' | 'complete' | 'lookup_group';
    steps: ThinkingStep[];
    files?: { name: string; step: ThinkingStep; additions: number; deletions: number }[];
    completed?: number;
    total?: number;
    failed?: number;
    buildStatus?: 'passed' | 'failed' | 'running';
    issueCount?: number;
}

function groupSteps(steps: ThinkingStep[]): GroupedItem[] {
    const groups: GroupedItem[] = [];
    let currentFileSteps: ThinkingStep[] = [];
    let currentTaskSteps: ThinkingStep[] = [];
    let currentBuildSteps: ThinkingStep[] = [];
    let currentLookupSteps: ThinkingStep[] = [];

    const flushFiles = () => {
        if (currentFileSteps.length === 0) return;
        const fileMap = new Map<string, { name: string; step: ThinkingStep; additions: number; deletions: number }>();
        for (const step of currentFileSteps) {
            const text = step.message || step.text || '';
            const name = extractFileName(text);
            if (name) {
                const stats = extractDiffStats(step) || { additions: 0, deletions: 0 };
                const existing = fileMap.get(name);
                if (!existing || stats.additions > 0 || stats.deletions > 0) {
                    fileMap.set(name, { name, step, additions: stats.additions, deletions: stats.deletions });
                }
            }
        }
        groups.push({
            type: 'file_group',
            steps: currentFileSteps,
            files: Array.from(fileMap.values()),
        });
        currentFileSteps = [];
    };

    const flushTasks = () => {
        if (currentTaskSteps.length === 0) return;
        let completed = 0, total = 0, failed = 0;
        for (const s of currentTaskSteps) {
            const name = (s.tool_name || s.toolName || '').toLowerCase();
            if (name.includes('start')) total++;
            if (name.includes('complete')) completed++;
            if (name.includes('failed')) { failed++; total++; }
        }
        groups.push({ type: 'task_group', steps: currentTaskSteps, completed, total, failed });
        currentTaskSteps = [];
    };

    const flushBuild = () => {
        if (currentBuildSteps.length === 0) return;
        const lastStep = currentBuildSteps[currentBuildSteps.length - 1];
        const msg = (lastStep.message || lastStep.text || '').toLowerCase();
        let buildStatus: 'passed' | 'failed' | 'running' = 'running';
        let issueCount = 0;
        if (msg.includes('passed') || lastStep.status === 'complete') buildStatus = 'passed';
        else if (lastStep.status === 'error' || msg.includes('could not') || msg.includes('remaining')) {
            buildStatus = 'failed';
            const match = msg.match(/(\d+)\s*issues?\s*remaining/);
            if (match) issueCount = parseInt(match[1]);
        }
        groups.push({ type: 'build_group', steps: currentBuildSteps, buildStatus, issueCount });
        currentBuildSteps = [];
    };

    const flushLookups = () => {
        if (currentLookupSteps.length === 0) return;
        groups.push({ type: 'lookup_group', steps: currentLookupSteps });
        currentLookupSteps = [];
    };

    for (const step of steps) {
        const cat = getStepCategory(step);
        if (cat === 'hidden') continue;

        if (cat === 'file') {
            flushTasks(); flushBuild(); flushLookups();
            currentFileSteps.push(step);
        } else if (cat === 'task') {
            flushFiles(); flushBuild(); flushLookups();
            currentTaskSteps.push(step);
        } else if (cat === 'build') {
            flushFiles(); flushTasks(); flushLookups();
            currentBuildSteps.push(step);
        } else if (cat === 'lookup') {
            flushFiles(); flushTasks(); flushBuild();
            currentLookupSteps.push(step);
        } else {
            flushFiles(); flushTasks(); flushBuild(); flushLookups();
            if (cat === 'phase' || cat === 'quality' || cat === 'complete') {
                groups.push({ type: cat as any, steps: [step] });
            }
        }
    }

    flushFiles(); flushTasks(); flushBuild(); flushLookups();
    return groups;
}

// --- Phase metadata ---

function getPhaseInfo(toolName: string): { icon: React.ReactNode; badge: string; iconBg: string; iconColor: string } {
    const name = toolName.toLowerCase();
    if (name === 'thinking' || name === 'classifying')
        return { icon: <Brain className="w-3.5 h-3.5" />, badge: 'THINKING', iconBg: 'bg-[#c9a474]/15', iconColor: 'text-[#c9a474]' };
    if (name === 'exploring')
        return { icon: <Search className="w-3.5 h-3.5" />, badge: 'EXPLORING', iconBg: 'bg-amber-400/10', iconColor: 'text-amber-400' };
    if (name === 'planning' || name === 'replanning' || name === 'replan')
        return { icon: <Layout className="w-3.5 h-3.5" />, badge: 'PLANNING', iconBg: 'bg-blue-400/10', iconColor: 'text-blue-400' };
    if (name === 'executing')
        return { icon: <Zap className="w-3.5 h-3.5" />, badge: 'EXECUTING', iconBg: 'bg-amber-400/10', iconColor: 'text-amber-400' };
    if (name === 'verifying')
        return { icon: <ShieldCheck className="w-3.5 h-3.5" />, badge: 'VERIFYING', iconBg: 'bg-emerald-400/10', iconColor: 'text-emerald-400' };
    if (name === 'routing')
        return { icon: <Globe className="w-3.5 h-3.5" />, badge: 'ROUTING', iconBg: 'bg-violet-400/10', iconColor: 'text-violet-400' };
    return { icon: <Settings2 className="w-3.5 h-3.5" />, badge: toolName.toUpperCase(), iconBg: 'bg-[#c9a474]/15', iconColor: 'text-[#c9a474]' };
}

// --- Streaming text ---

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
                <div className="flex items-center gap-1">
                    <span className={cn(
                        "inline-block w-[2px] h-[14px] bg-[#b69161] rounded-sm transition-opacity duration-100",
                        showCursor ? "opacity-100" : "opacity-30"
                    )} />
                </div>
            )}
        </div>
    );
}

// --- Reusable StepCard matching ArtifactCard design ---

function StepCard({
    icon,
    iconBg,
    iconColor,
    title,
    badge,
    badgeColor,
    isExpanded,
    onToggle,
    status,
    hasContent = true,
    children,
}: {
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    title: string;
    badge?: string;
    badgeColor?: string;
    isExpanded: boolean;
    onToggle: () => void;
    status?: 'running' | 'complete' | 'error' | 'pending';
    hasContent?: boolean;
    children?: React.ReactNode;
}) {
    const isRunning = status === 'running' || status === 'pending';

    return (
        <div className="rounded-xl overflow-hidden dark-glass-subtle">
            <button
                onClick={hasContent ? onToggle : undefined}
                className={cn(
                    'w-full flex items-center gap-2.5 px-3.5 py-2.5 transition-colors',
                    hasContent && 'hover:bg-white/5 cursor-pointer',
                    !hasContent && 'cursor-default',
                )}
            >
                <div className={cn(
                    'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
                    status === 'complete' ? 'bg-emerald-400/15 text-emerald-400' :
                    status === 'error' ? 'bg-red-400/15 text-red-400' :
                    `${iconBg} ${iconColor}`,
                )}>
                    {isRunning
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : status === 'complete'
                            ? <Check className="w-3.5 h-3.5" />
                            : status === 'error'
                                ? <AlertCircle className="w-3.5 h-3.5" />
                                : icon}
                </div>
                <span className="flex-1 text-left text-xs font-semibold text-white/90 truncate">
                    {title}
                </span>
                {badge && (
                    <span className={cn('text-[9px] uppercase tracking-wider font-medium', badgeColor || 'text-white/40')}>
                        {badge}
                    </span>
                )}
                {hasContent && (
                    <ChevronDown className={cn(
                        'w-3.5 h-3.5 text-white/40 transition-transform duration-200',
                        isExpanded && 'rotate-180',
                    )} />
                )}
            </button>
            {hasContent && isExpanded && children && (
                <div className="px-3.5 pb-3 border-t border-[rgba(182,145,97,0.12)] pt-2.5 animate-slide-up">
                    {children}
                </div>
            )}
        </div>
    );
}

// --- Main component ---

export function ThinkingSteps({ steps, isComplete = false, thinking = [], onFileClick }: ThinkingStepsProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    const [expandedPlanIndex, setExpandedPlanIndex] = useState<number | null>(null);

    useEffect(() => {
        if (steps.length > 0 || thinking.length > 0) setIsExpanded(true);
    }, [steps.length, thinking.length]);

    const grouped = groupSteps(steps);

    // Auto-expand planning steps that have content
    useEffect(() => {
        grouped.forEach((group, idx) => {
            if (group.type === 'phase') {
                const step = group.steps[0];
                const toolName = (step.tool_name || step.toolName || '').toLowerCase();
                if (toolName === 'planning' && step.details?.content && expandedPlanIndex !== idx) {
                    setExpandedGroups(prev => {
                        const next = new Set(prev);
                        next.add(idx);
                        return next;
                    });
                    setExpandedPlanIndex(idx);
                }
            }
        });
    }, [grouped.length]);

    if (steps.length === 0 && thinking.length === 0) return null;

    const toggleGroup = (index: number) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const lastStep = steps[steps.length - 1];
    const isLastRunning = lastStep && (lastStep.status === 'running' || lastStep.status === 'pending');

    return (
        <div className="px-4 py-2">
            {/* Outer header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 py-1 group"
            >
                <span className="text-xs font-medium text-[#b69161]">
                    {!isComplete && isLastRunning ? (
                        <span className="flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {grouped.length} step{grouped.length !== 1 ? 's' : ''}
                        </span>
                    ) : (
                        `${grouped.length} step${grouped.length !== 1 ? 's' : ''}`
                    )}
                </span>
                <ChevronDown className={cn(
                    "w-3 h-3 text-white/40 transition-transform",
                    !isExpanded && "-rotate-90"
                )} />
            </button>

            {isExpanded && (
                <div className="mt-2 space-y-2">
                    {/* Thinking section */}
                    {thinking.length > 0 && (
                        <StepCard
                            icon={<Brain className="w-3.5 h-3.5" />}
                            iconBg="bg-[#b69161]/10"
                            iconColor="text-[#b69161]"
                            title="Thinking..."
                            badge="THINKING"
                            isExpanded={true}
                            onToggle={() => {}}
                            status="running"
                        >
                            <div className="text-[11px] text-white/70 font-mono max-h-24 overflow-y-auto">
                                {thinking.map((thought, i) => (
                                    <div key={i} className="leading-relaxed">{thought}</div>
                                ))}
                            </div>
                        </StepCard>
                    )}

                    {/* Grouped steps */}
                    {grouped.map((group, gIdx) => {
                        const isGroupExpanded = expandedGroups.has(gIdx);

                        // --- Phase / Quality / Complete ---
                        if (group.type === 'phase' || group.type === 'quality' || group.type === 'complete') {
                            const step = group.steps[0];
                            const stepText = step.message || step.text || 'Processing...';
                            const toolName = (step.tool_name || step.toolName || '');

                            let stepDetails: string | undefined;
                            if (typeof step.details === 'string') stepDetails = step.details;
                            else if (step.details?.content) stepDetails = step.details.content;
                            else if (step.details && Object.keys(step.details).length > 0) stepDetails = JSON.stringify(step.details, null, 2);
                            const hasMeaningfulDetails = stepDetails && stepDetails !== '{}';

                            // Get phase-specific styling
                            let icon: React.ReactNode;
                            let badge: string;
                            let iconBg: string;
                            let iconColor: string;

                            if (group.type === 'quality') {
                                icon = <Sparkles className="w-3.5 h-3.5" />;
                                badge = 'QUALITY';
                                iconBg = 'bg-amber-400/10';
                                iconColor = 'text-amber-400';
                            } else if (group.type === 'complete') {
                                icon = <Check className="w-3.5 h-3.5" />;
                                badge = 'DONE';
                                iconBg = 'bg-emerald-400/10';
                                iconColor = 'text-emerald-400';
                            } else {
                                const info = getPhaseInfo(toolName);
                                icon = info.icon;
                                badge = info.badge;
                                iconBg = info.iconBg;
                                iconColor = info.iconColor;
                            }

                            return (
                                <StepCard
                                    key={gIdx}
                                    icon={icon}
                                    iconBg={iconBg}
                                    iconColor={iconColor}
                                    title={stepText}
                                    badge={badge}
                                    isExpanded={isGroupExpanded}
                                    onToggle={() => toggleGroup(gIdx)}
                                    status={step.status}
                                    hasContent={!!hasMeaningfulDetails}
                                >
                                    {hasMeaningfulDetails && stepDetails && (
                                        <div className="text-[11px] font-mono text-white/70 whitespace-pre-wrap max-h-48 overflow-y-auto">
                                            <StreamingText
                                                text={stepDetails}
                                                isStreaming={step.status === 'running' || step.status === 'pending'}
                                            />
                                        </div>
                                    )}
                                </StepCard>
                            );
                        }

                        // --- File operations group ---
                        if (group.type === 'file_group') {
                            const files = group.files || [];
                            const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
                            const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
                            const anyRunning = group.steps.some(s => s.status === 'running' || s.status === 'pending');

                            const diffBadge = [
                                totalAdditions > 0 ? `+${totalAdditions}` : '',
                                totalDeletions > 0 ? `-${totalDeletions}` : '',
                            ].filter(Boolean).join(' ');

                            return (
                                <StepCard
                                    key={gIdx}
                                    icon={<FileCode className="w-3.5 h-3.5" />}
                                    iconBg="bg-emerald-400/10"
                                    iconColor="text-emerald-400"
                                    title={`${files.length} file${files.length !== 1 ? 's' : ''}`}
                                    badge={diffBadge || undefined}
                                    badgeColor={totalDeletions > 0 ? 'text-white/40' : 'text-emerald-400'}
                                    isExpanded={isGroupExpanded}
                                    onToggle={() => toggleGroup(gIdx)}
                                    status={anyRunning ? 'running' : 'complete'}
                                >
                                    <div className="space-y-0.5">
                                        {files.map((file, fIdx) => (
                                            <button
                                                key={fIdx}
                                                onClick={() => onFileClick?.(file.name)}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-left"
                                            >
                                                <StepFileIcon fileName={file.name} />
                                                <span className="text-[11px] text-white/70 truncate flex-1">{file.name}</span>
                                                {(file.additions > 0 || file.deletions > 0) && (
                                                    <span className="flex items-center gap-1 shrink-0">
                                                        {file.additions > 0 && <span className="text-[10px] font-medium text-emerald-600">+{file.additions}</span>}
                                                        {file.deletions > 0 && <span className="text-[10px] font-medium text-red-500">-{file.deletions}</span>}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </StepCard>
                            );
                        }

                        // --- Task group ---
                        if (group.type === 'task_group') {
                            const { completed = 0, total = 0, failed = 0 } = group;
                            const anyRunning = group.steps.some(s => s.status === 'running' || s.status === 'pending');
                            const allDone = completed + failed >= total;

                            const title = anyRunning
                                ? `Running tasks (${completed}/${total})`
                                : `Completed ${completed}/${total} tasks`;
                            const badge = failed > 0 ? `${failed} FAILED` : `${completed}/${total}`;

                            return (
                                <StepCard
                                    key={gIdx}
                                    icon={<Zap className="w-3.5 h-3.5" />}
                                    iconBg="bg-amber-400/10"
                                    iconColor="text-amber-400"
                                    title={title}
                                    badge={badge}
                                    badgeColor={failed > 0 ? 'text-red-400' : 'text-white/40'}
                                    isExpanded={isGroupExpanded}
                                    onToggle={() => toggleGroup(gIdx)}
                                    status={anyRunning ? 'running' : allDone && failed === 0 ? 'complete' : 'error'}
                                >
                                    <div className="space-y-0.5">
                                        {group.steps.filter(s => {
                                            const n = (s.tool_name || s.toolName || '').toLowerCase();
                                            return n.includes('start');
                                        }).map((s, tIdx) => {
                                            const text = s.message || s.text || '';
                                            return (
                                                <div key={tIdx} className="flex items-center gap-2 px-2 py-1 text-[11px] text-white/70">
                                                    <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                                                    <span className="truncate">{text}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </StepCard>
                            );
                        }

                        // --- Build validation group ---
                        if (group.type === 'build_group') {
                            const { buildStatus = 'running', issueCount = 0 } = group;
                            const anyRunning = group.steps.some(s => s.status === 'running' || s.status === 'pending');

                            let title = 'Build validation';
                            if (buildStatus === 'passed') title = 'Build validation passed';
                            else if (buildStatus === 'failed' && issueCount > 0) title = `Build validation — ${issueCount} issue${issueCount !== 1 ? 's' : ''} remaining`;
                            else if (buildStatus === 'failed') title = 'Build validation — could not auto-fix';

                            const badge = anyRunning ? 'RUNNING' : buildStatus === 'passed' ? 'PASSED' : 'FAILED';
                            const badgeColor = buildStatus === 'passed' ? 'text-emerald-400' : buildStatus === 'failed' ? 'text-red-400' : 'text-white/40';

                            return (
                                <StepCard
                                    key={gIdx}
                                    icon={<ShieldCheck className="w-3.5 h-3.5" />}
                                    iconBg={buildStatus === 'passed' ? 'bg-emerald-400/10' : buildStatus === 'failed' ? 'bg-red-400/10' : 'bg-[#c9a474]/15'}
                                    iconColor={buildStatus === 'passed' ? 'text-emerald-400' : buildStatus === 'failed' ? 'text-red-400' : 'text-[#c9a474]'}
                                    title={title}
                                    badge={badge}
                                    badgeColor={badgeColor}
                                    isExpanded={isGroupExpanded}
                                    onToggle={() => toggleGroup(gIdx)}
                                    status={anyRunning ? 'running' : buildStatus === 'passed' ? 'complete' : 'error'}
                                >
                                    <div className="space-y-0.5">
                                        {group.steps.map((s, bIdx) => {
                                            const text = s.message || s.text || '';
                                            return (
                                                <div key={bIdx} className="flex items-center gap-2 px-2 py-1 text-[11px] text-white/70">
                                                    {s.status === 'error' ? (
                                                        <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                                                    ) : s.status === 'running' || s.status === 'pending' ? (
                                                        <Loader2 className="w-3 h-3 animate-spin text-[#b69161] shrink-0" />
                                                    ) : (
                                                        <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                                    )}
                                                    <span className="truncate">{text}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </StepCard>
                            );
                        }

                        // Lookup group — hidden
                        if (group.type === 'lookup_group') return null;

                        return null;
                    })}
                </div>
            )}
        </div>
    );
}

// Compact indicator
export function ThinkingIndicator({ text = 'Thinking...', toolName }: { text?: string; toolName?: string }) {
    return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl dark-glass-subtle text-xs">
            <div className="w-5 h-5 rounded-lg bg-[#c9a474]/15 flex items-center justify-center">
                <Brain className="w-3 h-3 text-[#c9a474]" />
            </div>
            {toolName && (
                <span className="font-mono text-white/40 text-[10px]">{toolName}</span>
            )}
            <span className="text-white/60">{text}</span>
        </div>
    );
}
