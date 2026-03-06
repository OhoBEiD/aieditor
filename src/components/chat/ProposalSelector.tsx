'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, ChevronRight, Check, FileCode, Zap, Layers } from 'lucide-react';

interface ProposalOption {
    id: number;
    title: string;
    description: string;
    complexity: string;
    estimatedFiles: number;
    pros: string[];
    cons: string[];
}

interface ProposalSelectorProps {
    options: ProposalOption[];
    recommendation: number;
    recommendationReason: string;
    researchSummary: string;
    onSelect?: (optionId: number) => void;
    selectedId?: number | null;
}

const complexityIcon = (complexity: string) => {
    switch (complexity) {
        case 'simple': return <Zap className="w-3.5 h-3.5" />;
        case 'moderate': return <Layers className="w-3.5 h-3.5" />;
        case 'complex': return <Sparkles className="w-3.5 h-3.5" />;
        default: return <FileCode className="w-3.5 h-3.5" />;
    }
};

const complexityColor = (complexity: string) => {
    switch (complexity) {
        case 'simple': return 'text-emerald-400 bg-emerald-400/10';
        case 'moderate': return 'text-amber-400 bg-amber-400/10';
        case 'complex': return 'text-rose-400 bg-rose-400/10';
        default: return 'text-white/50 bg-white/8';
    }
};

export function ProposalSelector({
    options,
    recommendation,
    recommendationReason,
    researchSummary,
    onSelect,
    selectedId,
}: ProposalSelectorProps) {
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const isSelected = selectedId != null;

    return (
        <div className="my-3 rounded-2xl overflow-hidden">
            {/* Glass header */}
            <div className="relative px-4 py-3 dark-glass rounded-t-2xl">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#c9a474]/15 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-[#c9a474]" />
                    </div>
                    <span className="text-xs font-semibold text-white/95 tracking-wide uppercase">
                        Choose an approach
                    </span>
                </div>
                {researchSummary && (
                    <p className="mt-1.5 text-[11px] text-white/50 leading-relaxed line-clamp-2">
                        {researchSummary}
                    </p>
                )}
            </div>

            {/* Options */}
            <div className="border-x border-[rgba(182,145,97,0.15)] dark-glass-subtle divide-y divide-[rgba(182,145,97,0.12)]">
                {options.map((option) => {
                    const isRecommended = option.id === recommendation;
                    const isHovered = hoveredId === option.id;
                    const isChosen = selectedId === option.id;
                    const isExpanded = expandedId === option.id;

                    return (
                        <div
                            key={option.id}
                            className={cn(
                                'relative transition-all duration-200',
                                isChosen && 'bg-[#c9a474]/10',
                                isHovered && !isSelected && 'bg-white/5',
                            )}
                        >
                            {/* Main option row — uses div to avoid nested button hydration error */}
                            <div
                                role="button"
                                tabIndex={isSelected ? -1 : 0}
                                onClick={() => {
                                    if (!isSelected && onSelect) {
                                        onSelect(option.id);
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if ((e.key === 'Enter' || e.key === ' ') && !isSelected && onSelect) {
                                        e.preventDefault();
                                        onSelect(option.id);
                                    }
                                }}
                                onMouseEnter={() => setHoveredId(option.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                className={cn(
                                    'w-full text-left px-4 py-3 transition-all duration-150',
                                    !isSelected && 'cursor-pointer hover:pl-5',
                                    isSelected && 'cursor-default',
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Selection indicator */}
                                    <div className={cn(
                                        'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200',
                                        isChosen
                                            ? 'border-[#b69161] bg-[#b69161]'
                                            : isHovered && !isSelected
                                                ? 'border-[#c9a474]/60 bg-[#c9a474]/10'
                                                : 'border-[#b69161]/30 bg-transparent',
                                    )}>
                                        {isChosen && <Check className="w-3 h-3 text-white" />}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={cn(
                                                'text-sm font-semibold transition-colors',
                                                isChosen ? 'text-[#dbb98a]' : 'text-white/95',
                                            )}>
                                                {option.title}
                                            </span>
                                            {isRecommended && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#c9a474]/15 text-[#c9a474]">
                                                    <Sparkles className="w-2.5 h-2.5" />
                                                    Recommended
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-white/55 mt-0.5 leading-relaxed">
                                            {option.description}
                                        </p>

                                        {/* Tags row */}
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className={cn(
                                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                                                complexityColor(option.complexity),
                                            )}>
                                                {complexityIcon(option.complexity)}
                                                {option.complexity}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-[10px] text-white/50">
                                                <FileCode className="w-3 h-3" />
                                                ~{option.estimatedFiles} files
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expand toggle */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedId(isExpanded ? null : option.id);
                                        }}
                                        className="mt-1 p-1 rounded-md hover:bg-white/8 transition-colors"
                                    >
                                        <ChevronRight className={cn(
                                            'w-3.5 h-3.5 text-white/40 transition-transform duration-200',
                                            isExpanded && 'rotate-90',
                                        )} />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded details */}
                            {isExpanded && (
                                <div className="px-4 pb-3 pl-12 animate-slide-up">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Pros</p>
                                            <ul className="space-y-0.5">
                                                {option.pros.map((pro, i) => (
                                                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/70">
                                                        <span className="text-emerald-400 mt-0.5 shrink-0">+</span>
                                                        {pro}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider mb-1">Cons</p>
                                            <ul className="space-y-0.5">
                                                {option.cons.map((con, i) => (
                                                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/70">
                                                        <span className="text-rose-400 mt-0.5 shrink-0">-</span>
                                                        {con}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className={cn(
                'px-4 py-2.5 border border-t-0 border-[rgba(182,145,97,0.15)] rounded-b-2xl dark-glass-subtle',
                isSelected && 'bg-[#c9a474]/10',
            )}>
                {isSelected ? (
                    <p className="text-[10px] text-[#c9a474] font-medium flex items-center gap-1.5">
                        <Check className="w-3 h-3" />
                        Option {selectedId} selected — executing...
                    </p>
                ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#b69161] animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-[#b69161] animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-[#b69161] animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-[10px] text-[#c9a474] font-medium">
                                Select an approach to continue
                            </span>
                        </div>
                        {recommendationReason && (
                            <span className="text-[9px] text-white/40 max-w-[55%] truncate">
                                Recommended: Option {recommendation}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export function SelectedProposalBadge({ option, optionId }: { option?: ProposalOption; optionId: number }) {
    return (
        <div className="my-2 flex items-center gap-2.5 px-3 py-2 rounded-xl dark-glass-subtle">
            <div className="w-5 h-5 rounded-full bg-[#b69161] flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-medium text-white/90">
                {option?.title || `Option ${optionId}`}
            </span>
            {option?.complexity && (
                <span className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                    complexityColor(option.complexity),
                )}>
                    {complexityIcon(option.complexity)}
                    {option.complexity}
                </span>
            )}
        </div>
    );
}
