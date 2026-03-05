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
        case 'simple': return 'text-emerald-600 bg-emerald-50';
        case 'moderate': return 'text-amber-600 bg-amber-50';
        case 'complex': return 'text-rose-500 bg-rose-50';
        default: return 'text-[#84745b] bg-[#d6cfc9]/30';
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
            <div className="relative px-4 py-3 bg-gradient-to-r from-[#b69161]/15 via-[#d6cfc9]/20 to-[#b69161]/10 backdrop-blur-md border border-[#b69161]/15 rounded-t-2xl">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#b69161]/20 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-[#b69161]" />
                    </div>
                    <span className="text-xs font-semibold text-[#2c2418] tracking-wide uppercase">
                        Choose an approach
                    </span>
                </div>
                {researchSummary && (
                    <p className="mt-1.5 text-[11px] text-[#84745b] leading-relaxed line-clamp-2">
                        {researchSummary}
                    </p>
                )}
            </div>

            {/* Options */}
            <div className="border-x border-[#b69161]/15 bg-white/60 backdrop-blur-sm divide-y divide-[#b69161]/8">
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
                                isChosen && 'bg-[#b69161]/8',
                                isHovered && !isSelected && 'bg-[#b69161]/5',
                            )}
                        >
                            {/* Main option row */}
                            <button
                                onClick={() => {
                                    if (!isSelected && onSelect) {
                                        onSelect(option.id);
                                    }
                                }}
                                onMouseEnter={() => setHoveredId(option.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                disabled={isSelected}
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
                                                ? 'border-[#b69161]/60 bg-[#b69161]/10'
                                                : 'border-[#d6cfc9] bg-white',
                                    )}>
                                        {isChosen && <Check className="w-3 h-3 text-white" />}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={cn(
                                                'text-sm font-semibold transition-colors',
                                                isChosen ? 'text-[#b69161]' : 'text-[#2c2418]',
                                            )}>
                                                {option.title}
                                            </span>
                                            {isRecommended && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#b69161]/15 text-[#b69161]">
                                                    <Sparkles className="w-2.5 h-2.5" />
                                                    Recommended
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-[#84745b] mt-0.5 leading-relaxed">
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
                                            <span className="inline-flex items-center gap-1 text-[10px] text-[#84745b]">
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
                                        className="mt-1 p-1 rounded-md hover:bg-[#b69161]/10 transition-colors"
                                    >
                                        <ChevronRight className={cn(
                                            'w-3.5 h-3.5 text-[#84745b] transition-transform duration-200',
                                            isExpanded && 'rotate-90',
                                        )} />
                                    </button>
                                </div>
                            </button>

                            {/* Expanded details */}
                            {isExpanded && (
                                <div className="px-4 pb-3 pl-12 animate-slide-up">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Pros</p>
                                            <ul className="space-y-0.5">
                                                {option.pros.map((pro, i) => (
                                                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#4a3f32]">
                                                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                                                        {pro}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-wider mb-1">Cons</p>
                                            <ul className="space-y-0.5">
                                                {option.cons.map((con, i) => (
                                                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#4a3f32]">
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
                'px-4 py-2.5 border border-t-0 border-[#b69161]/15 rounded-b-2xl',
                isSelected ? 'bg-[#b69161]/8' : 'bg-gradient-to-r from-[#b69161]/8 via-transparent to-[#b69161]/5',
            )}>
                {isSelected ? (
                    <p className="text-[10px] text-[#b69161] font-medium flex items-center gap-1.5">
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
                            <span className="text-[10px] text-[#b69161] font-medium">
                                Select an approach to continue
                            </span>
                        </div>
                        {recommendationReason && (
                            <span className="text-[9px] text-[#84745b] max-w-[55%] truncate">
                                Recommended: Option {recommendation}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
