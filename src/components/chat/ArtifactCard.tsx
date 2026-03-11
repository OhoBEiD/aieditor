'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    ListChecks, Eye, BarChart3, Camera, Brain, GitCompare,
    ChevronDown, Check, X, AlertTriangle, FileCode
} from 'lucide-react';
import type { Artifact, ArtifactType } from '@/lib/ai/artifacts/types';

const artifactMeta: Record<ArtifactType, { icon: React.ReactNode; color: string; bg: string }> = {
    plan: { icon: <ListChecks className="w-3.5 h-3.5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
    component_preview: { icon: <Eye className="w-3.5 h-3.5" />, color: 'text-violet-600', bg: 'bg-violet-50' },
    quality_report: { icon: <BarChart3 className="w-3.5 h-3.5" />, color: 'text-amber-600', bg: 'bg-amber-50' },
    screenshot: { icon: <Camera className="w-3.5 h-3.5" />, color: 'text-teal-600', bg: 'bg-teal-50' },
    test_result: { icon: <ListChecks className="w-3.5 h-3.5" />, color: 'text-green-600', bg: 'bg-green-50' },
    brain_update: { icon: <Brain className="w-3.5 h-3.5" />, color: 'text-purple-600', bg: 'bg-purple-50' },
    diff: { icon: <FileCode className="w-3.5 h-3.5" />, color: 'text-[#b69161]', bg: 'bg-[#b69161]/10' },
    branch_comparison: { icon: <GitCompare className="w-3.5 h-3.5" />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    proposal: { icon: <ListChecks className="w-3.5 h-3.5" />, color: 'text-[#b69161]', bg: 'bg-[#b69161]/10' },
};

interface ArtifactCardProps {
    artifact: Artifact;
}

export function ArtifactCard({ artifact }: ArtifactCardProps) {
    const [expanded, setExpanded] = useState(false);
    const meta = artifactMeta[artifact.type] || artifactMeta.diff;

    // Skip plan and test_result artifacts (plan is shown in TaskDrawer, tests removed)
    if (artifact.type === 'plan' || artifact.type === 'test_result') return null;

    return (
        <div className="my-2 rounded-xl overflow-hidden border border-[#b69161]/12 bg-white/70 backdrop-blur-sm">
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-[#b69161]/5 transition-colors"
            >
                <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center shrink-0', meta.bg, meta.color)}>
                    {meta.icon}
                </div>
                <span className="flex-1 text-left text-xs font-semibold text-[#2c2418] truncate">
                    {artifact.title}
                </span>
                <span className="text-[9px] text-[#84745b] uppercase tracking-wider font-medium">
                    {artifact.type.replace('_', ' ')}
                </span>
                <ChevronDown className={cn(
                    'w-3.5 h-3.5 text-[#84745b] transition-transform duration-200',
                    expanded && 'rotate-180',
                )} />
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="px-3.5 pb-3 border-t border-[#b69161]/8 pt-2.5 animate-slide-up">
                    {artifact.type === 'quality_report' && <QualityContent data={artifact.data as any} />}
                    {artifact.type === 'branch_comparison' && <BranchContent data={artifact.data as any} />}
                    {artifact.type === 'brain_update' && <BrainContent data={artifact.data as any} />}
                    {artifact.type === 'screenshot' && <ScreenshotContent data={artifact.data as any} />}
                    {(artifact.type === 'diff' || artifact.type === 'component_preview') && (
                        <GenericContent data={artifact.data} />
                    )}
                </div>
            )}
        </div>
    );
}

function QualityContent({ data }: { data: { overall: number; fileScores: Array<{ path: string; score: number; issues: string[] }>; criticalIssues: string[] } }) {
    const color = data.overall >= 8 ? 'text-emerald-600' : data.overall >= 5 ? 'text-amber-600' : 'text-red-500';
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <span className={cn('text-lg font-bold', color)}>{data.overall}/10</span>
                <div className="flex-1 h-1.5 bg-[#d6cfc9]/30 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', data.overall >= 8 ? 'bg-emerald-500' : data.overall >= 5 ? 'bg-amber-500' : 'bg-red-500')}
                         style={{ width: `${data.overall * 10}%` }} />
                </div>
            </div>
            {data.criticalIssues.length > 0 && (
                <div className="space-y-1">
                    {data.criticalIssues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-600">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            {issue}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function BranchContent({ data }: { data: { branches: Array<{ id: number; strategy: string; qualityScore: number; selected: boolean }>; reason: string } }) {
    return (
        <div className="space-y-2">
            {data.branches.map((branch) => (
                <div key={branch.id} className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px]',
                    branch.selected ? 'bg-[#b69161]/10 border border-[#b69161]/20' : 'bg-[#d6cfc9]/20',
                )}>
                    {branch.selected && <Check className="w-3 h-3 text-[#b69161] shrink-0" />}
                    <span className="flex-1 text-[#2c2418] font-medium">{branch.strategy}</span>
                    <span className={cn('font-semibold', branch.qualityScore >= 7 ? 'text-emerald-600' : 'text-amber-600')}>
                        {branch.qualityScore}/10
                    </span>
                </div>
            ))}
            {data.reason && <p className="text-[10px] text-[#84745b] leading-relaxed">{data.reason}</p>}
        </div>
    );
}

function BrainContent({ data }: { data: { entries: Array<{ category: string; content: string; confidence: number }> } }) {
    return (
        <div className="space-y-1.5">
            {data.entries.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 text-[9px] font-medium shrink-0">
                        {entry.category}
                    </span>
                    <span className="text-[#4a3f32] leading-relaxed">{entry.content}</span>
                </div>
            ))}
        </div>
    );
}

function ScreenshotContent({ data }: { data: { passed: boolean; issues: string[]; suggestions: string[] } }) {
    return (
        <div className="space-y-1.5">
            <div className={cn(
                'flex items-center gap-1.5 text-[11px] font-medium',
                data.passed ? 'text-emerald-600' : 'text-amber-600',
            )}>
                {data.passed ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {data.passed ? 'Visual check passed' : 'Visual issues detected'}
            </div>
            {data.issues.map((issue, i) => (
                <p key={i} className="text-[11px] text-[#4a3f32] pl-5">- {issue}</p>
            ))}
        </div>
    );
}

function GenericContent({ data }: { data: Record<string, any> }) {
    return (
        <pre className="text-[10px] text-[#4a3f32] whitespace-pre-wrap overflow-x-auto">
            {JSON.stringify(data, null, 2)}
        </pre>
    );
}
