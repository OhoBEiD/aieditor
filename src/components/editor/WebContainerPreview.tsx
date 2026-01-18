'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone, RefreshCw, Loader2, ExternalLink, AlertCircle, Terminal, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui';
import { useWebContainer } from '@/hooks/useWebContainer';

type DeviceMode = 'desktop' | 'mobile';

interface WebContainerPreviewProps {
    repoUrl?: string;
    githubToken?: string;
    className?: string;
    onReady?: () => void;
    onError?: (error: string) => void;
    onFileChange?: (path: string, content: string) => void;
}

export function WebContainerPreview({
    repoUrl,
    githubToken,
    className,
    onReady,
    onError,
    onFileChange,
}: WebContainerPreviewProps) {
    const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
    const [showTerminal, setShowTerminal] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const {
        status,
        previewUrl,
        error,
        boot,
        initFromGitHub,
        writeFile,
        terminalOutput,
    } = useWebContainer({
        repoUrl,
        githubToken,
        onReady: () => onReady?.(),
        onError: (err) => onError?.(err),
    });

    // Initialize from GitHub when repo URL is provided
    useEffect(() => {
        if (repoUrl && status === 'idle') {
            initFromGitHub(repoUrl, githubToken);
        }
    }, [repoUrl, githubToken, status, initFromGitHub]);

    // Expose writeFile for external use (n8n integration)
    const handleExternalWrite = useCallback(async (path: string, content: string) => {
        await writeFile(path, content);
        onFileChange?.(path, content);
    }, [writeFile, onFileChange]);

    // Make writeFile available globally for n8n webhook response handling
    useEffect(() => {
        (window as any).__webcontainer_writeFile = handleExternalWrite;
        return () => {
            delete (window as any).__webcontainer_writeFile;
        };
    }, [handleExternalWrite]);

    // Status indicator component
    const StatusIndicator = useMemo(() => {
        const statusConfig = {
            idle: { color: 'bg-gray-400', text: 'Idle' },
            booting: { color: 'bg-yellow-400 animate-pulse', text: 'Booting...' },
            installing: { color: 'bg-blue-400 animate-pulse', text: 'Installing npm packages...' },
            running: { color: 'bg-green-400', text: 'Running' },
            error: { color: 'bg-red-400', text: error || 'Error' },
        };

        const config = statusConfig[status];

        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/80 rounded-lg">
                <div className={cn('w-2 h-2 rounded-full', config.color)} />
                <span className="text-xs text-gray-300">{config.text}</span>
            </div>
        );
    }, [status, error]);

    // Device dimensions
    const dimensions = deviceMode === 'desktop'
        ? { width: '100%', height: '100%' }
        : { width: '390px', height: '844px' };

    return (
        <div className={cn('flex flex-col h-full bg-gray-950', className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
                <div className="flex items-center gap-2">
                    {StatusIndicator}
                </div>

                <div className="flex items-center gap-2">
                    {/* Device toggle */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeviceMode('desktop')}
                        className={cn(deviceMode === 'desktop' && 'bg-gray-800')}
                    >
                        <Monitor className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeviceMode('mobile')}
                        className={cn(deviceMode === 'mobile' && 'bg-gray-800')}
                    >
                        <Smartphone className="h-4 w-4" />
                    </Button>

                    {/* Terminal toggle */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={cn(showTerminal && 'bg-gray-800')}
                    >
                        <Terminal className="h-4 w-4" />
                    </Button>

                    {/* Open in new tab */}
                    {previewUrl && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(previewUrl, '_blank')}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Preview area */}
                <div className={cn(
                    'flex-1 flex items-center justify-center overflow-hidden',
                    showTerminal && 'flex-[2]'
                )}>
                    {status === 'error' ? (
                        <div className="flex flex-col items-center justify-center gap-4 text-red-400">
                            <AlertCircle className="h-12 w-12" />
                            <div className="text-center">
                                <p className="font-medium">Failed to start preview</p>
                                <p className="text-sm text-gray-400 mt-1">{error}</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => repoUrl && initFromGitHub(repoUrl, githubToken)}
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Retry
                            </Button>
                        </div>
                    ) : status === 'booting' || status === 'installing' ? (
                        <div className="flex flex-col items-center justify-center gap-4">
                            <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
                            <div className="text-center">
                                <p className="font-medium text-white">
                                    {status === 'booting' ? 'Starting WebContainer...' : 'Installing dependencies...'}
                                </p>
                                <p className="text-sm text-gray-400 mt-1">
                                    {status === 'booting'
                                        ? 'Booting Node.js in your browser'
                                        : 'Running npm install'
                                    }
                                </p>
                            </div>
                        </div>
                    ) : previewUrl ? (
                        <div
                            className="relative bg-white rounded-lg overflow-hidden shadow-2xl"
                            style={deviceMode === 'mobile' ? dimensions : { width: '100%', height: '100%' }}
                        >
                            <iframe
                                ref={iframeRef}
                                src={previewUrl}
                                className="w-full h-full border-0"
                                title="Preview"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-4 text-gray-400">
                            <FolderOpen className="h-12 w-12" />
                            <p>No project loaded</p>
                        </div>
                    )}
                </div>

                {/* Terminal panel */}
                {showTerminal && (
                    <div className="flex-1 border-t border-gray-800 bg-black/50 overflow-hidden">
                        <div className="h-full overflow-auto p-3 font-mono text-xs text-green-400">
                            {terminalOutput.length === 0 ? (
                                <span className="text-gray-500">Terminal output will appear here...</span>
                            ) : (
                                terminalOutput.map((line, i) => (
                                    <div key={i} className="whitespace-pre-wrap">{line}</div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
