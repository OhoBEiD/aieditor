'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
    Undo2,
    Redo2,
    Save,
    Upload,
    History,
    Settings,
    CheckCircle,
    XCircle,
    ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { CodeVersion } from '@/lib/supabase/types';

interface ActionToolbarProps {
    onRevert: () => void;
    onSave: () => void;
    onUploadImage: () => void;
    onViewHistory: () => void;
    hasUnsavedChanges?: boolean;
    isApplied?: boolean;
    recentVersions?: CodeVersion[];
    className?: string;
}

export function ActionToolbar({
    onRevert,
    onSave,
    onUploadImage,
    onViewHistory,
    hasUnsavedChanges = false,
    isApplied = false,
    recentVersions = [],
    className,
}: ActionToolbarProps) {
    const [showVersions, setShowVersions] = React.useState(false);

    return (
        <div
            className={cn(
                'flex items-center justify-between px-4 py-3',
                'border-b border-[var(--border-default)] bg-[var(--bg-secondary)]',
                className
            )}
        >
            {/* Left Actions */}
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRevert}
                    leftIcon={<Undo2 className="w-4 h-4" />}
                >
                    Revert
                </Button>

                <div className="relative">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowVersions(!showVersions)}
                        leftIcon={<History className="w-4 h-4" />}
                        rightIcon={<ChevronDown className="w-3 h-3" />}
                    >
                        History
                    </Button>

                    {/* Versions Dropdown */}
                    {showVersions && (
                        <div
                            className={cn(
                                'absolute top-full left-0 mt-1 w-64 py-2',
                                'bg-[var(--bg-elevated)] border border-[var(--border-default)]',
                                'rounded-lg shadow-lg z-10'
                            )}
                        >
                            {recentVersions.length === 0 ? (
                                <p className="px-4 py-2 text-sm text-[var(--text-muted)]">
                                    No history yet
                                </p>
                            ) : (
                                recentVersions.slice(0, 5).map((version) => (
                                    <button
                                        key={version.id}
                                        className={cn(
                                            'w-full px-4 py-2 text-left text-sm',
                                            'hover:bg-[var(--bg-hover)] transition-colors'
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    'w-2 h-2 rounded-full',
                                                    version.action === 'create' && 'bg-[var(--accent-success)]',
                                                    version.action === 'modify' && 'bg-[var(--accent-warning)]',
                                                    version.action === 'delete' && 'bg-[var(--accent-danger)]'
                                                )}
                                            />
                                            <span className="text-[var(--text-primary)] truncate">
                                                {version.file_path.split('/').pop()}
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                                            {version.change_description || version.action}
                                        </p>
                                    </button>
                                ))
                            )}
                            {recentVersions.length > 5 && (
                                <button
                                    onClick={onViewHistory}
                                    className="w-full px-4 py-2 text-sm text-[var(--accent-primary)] hover:bg-[var(--bg-hover)]"
                                >
                                    View all history
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="w-px h-6 bg-[var(--border-default)] mx-1" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onUploadImage}
                    leftIcon={<Upload className="w-4 h-4" />}
                >
                    Upload
                </Button>
            </div>

            {/* Status & Right Actions */}
            <div className="flex items-center gap-3">
                {/* Status Indicator */}
                {hasUnsavedChanges ? (
                    <div className="flex items-center gap-1.5 text-[var(--accent-warning)]">
                        <div className="w-2 h-2 rounded-full bg-[var(--accent-warning)] animate-pulse" />
                        <span className="text-xs font-medium">Unsaved changes</span>
                    </div>
                ) : isApplied ? (
                    <div className="flex items-center gap-1.5 text-[var(--accent-success)]">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs font-medium">Applied</span>
                    </div>
                ) : null}

                <Button
                    variant="primary"
                    size="sm"
                    onClick={onSave}
                    disabled={!hasUnsavedChanges}
                    leftIcon={<Save className="w-4 h-4" />}
                >
                    Save Changes
                </Button>

                <button
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
