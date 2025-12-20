'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
    Monitor,
    Tablet,
    Smartphone,
    Code,
    Eye,
    RefreshCw,
    ExternalLink,
    Maximize2,
} from 'lucide-react';
import { getFileExtension, getLanguageFromExtension } from '@/lib/utils';

type ViewMode = 'preview' | 'code' | 'split';
type DeviceSize = 'desktop' | 'tablet' | 'mobile';

interface CodePreviewProps {
    code: string;
    filePath: string;
    previewUrl?: string;
    className?: string;
}

export function CodePreview({
    code,
    filePath,
    previewUrl,
    className,
}: CodePreviewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('split');
    const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
    const [isFullscreen, setIsFullscreen] = useState(false);

    const language = getLanguageFromExtension(getFileExtension(filePath));

    const deviceWidths = {
        desktop: '100%',
        tablet: '768px',
        mobile: '375px',
    };

    return (
        <div
            className={cn(
                'flex flex-col h-full bg-[var(--bg-primary)]',
                isFullscreen && 'fixed inset-0 z-50',
                className
            )}
        >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-default)] bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-1">
                    {/* View Mode Toggle */}
                    <div className="flex items-center p-1 rounded-lg bg-[var(--bg-tertiary)]">
                        <button
                            onClick={() => setViewMode('preview')}
                            className={cn(
                                'p-1.5 rounded-md transition-colors',
                                viewMode === 'preview'
                                    ? 'bg-[var(--accent-primary)] text-white'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            )}
                            title="Preview"
                        >
                            <Eye className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('code')}
                            className={cn(
                                'p-1.5 rounded-md transition-colors',
                                viewMode === 'code'
                                    ? 'bg-[var(--accent-primary)] text-white'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            )}
                            title="Code"
                        >
                            <Code className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('split')}
                            className={cn(
                                'p-1.5 rounded-md transition-colors',
                                viewMode === 'split'
                                    ? 'bg-[var(--accent-primary)] text-white'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            )}
                            title="Split View"
                        >
                            <div className="w-4 h-4 flex">
                                <div className="w-1/2 h-full border-r border-current" />
                                <div className="w-1/2 h-full" />
                            </div>
                        </button>
                    </div>

                    {/* Device Size Toggle */}
                    {(viewMode === 'preview' || viewMode === 'split') && (
                        <>
                            <div className="w-px h-6 mx-2 bg-[var(--border-default)]" />
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setDeviceSize('desktop')}
                                    className={cn(
                                        'p-1.5 rounded-md transition-colors',
                                        deviceSize === 'desktop'
                                            ? 'text-[var(--accent-primary)]'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                    )}
                                    title="Desktop"
                                >
                                    <Monitor className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setDeviceSize('tablet')}
                                    className={cn(
                                        'p-1.5 rounded-md transition-colors',
                                        deviceSize === 'tablet'
                                            ? 'text-[var(--accent-primary)]'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                    )}
                                    title="Tablet"
                                >
                                    <Tablet className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setDeviceSize('mobile')}
                                    className={cn(
                                        'p-1.5 rounded-md transition-colors',
                                        deviceSize === 'mobile'
                                            ? 'text-[var(--accent-primary)]'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                    )}
                                    title="Mobile"
                                >
                                    <Smartphone className="w-4 h-4" />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <button
                        className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {previewUrl && (
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Open in new tab"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        title="Fullscreen"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Code Panel */}
                {(viewMode === 'code' || viewMode === 'split') && (
                    <div
                        className={cn(
                            'overflow-auto',
                            viewMode === 'split' ? 'w-1/2 border-r border-[var(--border-default)]' : 'w-full'
                        )}
                    >
                        <SyntaxHighlighter
                            language={language}
                            style={oneDark}
                            customStyle={{
                                margin: 0,
                                padding: '16px',
                                background: 'var(--bg-tertiary)',
                                fontSize: '13px',
                                height: '100%',
                            }}
                            showLineNumbers
                            lineNumberStyle={{
                                color: 'var(--text-muted)',
                                paddingRight: '16px',
                            }}
                        >
                            {code || '// No code to display'}
                        </SyntaxHighlighter>
                    </div>
                )}

                {/* Preview Panel */}
                {(viewMode === 'preview' || viewMode === 'split') && (
                    <div
                        className={cn(
                            'flex-1 flex items-start justify-center p-4 bg-[var(--bg-tertiary)] overflow-auto',
                            viewMode === 'split' ? 'w-1/2' : 'w-full'
                        )}
                    >
                        <div
                            className="bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300"
                            style={{ width: deviceWidths[deviceSize], maxWidth: '100%' }}
                        >
                            {previewUrl ? (
                                <iframe
                                    src={previewUrl}
                                    className="w-full h-[600px] border-0"
                                    title="Preview"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-[400px] text-gray-400">
                                    <div className="text-center">
                                        <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p className="text-sm">Preview not available</p>
                                        <p className="text-xs mt-1">Configure preview URL to enable</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
