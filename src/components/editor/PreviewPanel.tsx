'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone, RefreshCw, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';

type DeviceMode = 'desktop' | 'mobile';

interface PreviewPanelProps {
    previewUrl?: string;
    className?: string;
    onExitPreview?: () => void;
    onDeploy?: () => void;
    hasChanges?: boolean;
    isDeploying?: boolean;
}

export function PreviewPanel({
    previewUrl,
    className,
    onExitPreview,
    onDeploy,
    hasChanges = false,
    isDeploying = false
}: PreviewPanelProps) {
    const [deviceMode, setDeviceMode] = React.useState<DeviceMode>('desktop');
    const [key, setKey] = React.useState(0);

    const handleRefresh = () => {
        setKey((prev) => prev + 1);
    };

    return (
        <div className={cn('flex flex-col h-full bg-[var(--bg-primary)]', className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)] bg-[var(--bg-secondary)]">
                {/* Left - Exit Preview */}
                <div className="flex items-center">
                    {onExitPreview && (
                        <button
                            onClick={onExitPreview}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <X className="w-4 h-4" />
                            Exit Preview
                        </button>
                    )}
                </div>

                {/* Center - Device Toggle & Refresh */}
                <div className="flex items-center gap-2">
                    {/* Device Toggle */}
                    <div className="flex items-center p-1 rounded-lg bg-[var(--bg-tertiary)]">
                        <button
                            onClick={() => setDeviceMode('desktop')}
                            className={cn(
                                'p-1.5 rounded-md transition-colors',
                                deviceMode === 'desktop'
                                    ? 'bg-[var(--accent-primary)] text-white'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            )}
                            title="Desktop"
                        >
                            <Monitor className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setDeviceMode('mobile')}
                            className={cn(
                                'p-1.5 rounded-md transition-colors',
                                deviceMode === 'mobile'
                                    ? 'bg-[var(--accent-primary)] text-white'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            )}
                            title="Mobile"
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        onClick={handleRefresh}
                        className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {/* Right - Deploy */}
                <div className="flex items-center">
                    {onDeploy && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onDeploy}
                            disabled={!hasChanges || isDeploying}
                            leftIcon={isDeploying ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                        >
                            {isDeploying ? 'Deploying...' : 'Deploy'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 flex items-start justify-center p-6 bg-[var(--bg-tertiary)] overflow-auto">
                <div
                    className={cn(
                        'bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300',
                        deviceMode === 'desktop' ? 'w-full max-w-5xl h-[80vh]' : 'w-[375px] h-[667px]'
                    )}
                >
                    {previewUrl ? (
                        <iframe
                            key={key}
                            src={previewUrl}
                            className="w-full h-full border-0"
                            title="Preview"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50">
                            <Monitor className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-sm font-medium">Preview not available</p>
                            <p className="text-xs mt-1 opacity-70">Configure your preview URL</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
