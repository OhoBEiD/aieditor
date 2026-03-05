'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone, RefreshCw, Loader2, ExternalLink, AlertCircle, Terminal as TerminalIcon, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui';
import { useWebContainer } from '@/hooks/useWebContainer';
import { Terminal } from './Terminal';

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
        spawn,
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
            idle: { color: 'bg-[#a89d8e]', text: 'Idle' },
            booting: { color: 'bg-yellow-400 animate-pulse', text: 'Booting...' },
            mounting: { color: 'bg-yellow-400 animate-pulse', text: 'Mounting files...' },
            installing: { color: 'bg-blue-400 animate-pulse', text: 'Installing npm packages...' },
            starting: { color: 'bg-blue-400 animate-pulse', text: 'Starting server...' },
            running: { color: 'bg-green-400', text: 'Running' },
            error: { color: 'bg-red-400', text: error || 'Error' },
        };

        const config = statusConfig[status];

        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#d6cfc9] shadow-sm rounded-lg">
                <div className={cn('w-2 h-2 rounded-full', config.color)} />
                <span className="text-xs text-[#4a3f32]">{config.text}</span>
            </div>
        );
    }, [status, error]);

    // Device dimensions
    const dimensions = deviceMode === 'desktop'
        ? { width: '100%', height: '100%' }
        : { width: '390px', height: '844px' };

    return (
        <div className={cn('flex flex-col h-full bg-[#f2efed]', className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#d6cfc9]">
                <div className="flex items-center gap-2">
                    {StatusIndicator}
                </div>

                <div className="flex items-center gap-2">
                    {/* Device toggle */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeviceMode('desktop')}
                        className={cn(deviceMode === 'desktop' && 'bg-[#d6cfc9] text-[#2c2418]')}
                    >
                        <Monitor className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeviceMode('mobile')}
                        className={cn(deviceMode === 'mobile' && 'bg-[#d6cfc9] text-[#2c2418]')}
                    >
                        <Smartphone className="h-4 w-4" />
                    </Button>

                    {/* Terminal toggle */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={cn(showTerminal && 'bg-[#d6cfc9] text-[#2c2418]')}
                    >
                        <TerminalIcon className="h-4 w-4" />
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
            <div className="flex-1 relative flex flex-col overflow-hidden">
                {/* Preview area - always takes full height now, terminal overlays it */}
                <div className="w-full h-full flex items-center justify-center bg-[#e6e0dd] overflow-hidden">
                    {status === 'error' ? (
                        <div className="flex flex-col items-center justify-center gap-4 text-red-500">
                            <AlertCircle className="h-12 w-12" />
                            <div className="text-center">
                                <p className="font-medium">Failed to start preview</p>
                                <p className="text-sm text-[#7a6f60] mt-1">{error}</p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => repoUrl && initFromGitHub(repoUrl, githubToken)}
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Retry
                            </Button>
                        </div>
                    ) : status === 'booting' || status === 'installing' ? (
                        <div className="flex flex-col items-center justify-center gap-4">
                            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                            <div className="text-center">
                                <p className="font-medium text-[#2c2418]">
                                    {status === 'booting' ? 'Starting WebContainer...' : 'Installing dependencies...'}
                                </p>
                                <p className="text-sm text-[#7a6f60] mt-1">
                                    {status === 'booting'
                                        ? 'Booting Node.js in your browser'
                                        : 'Running npm install'
                                    }
                                </p>
                            </div>
                        </div>
                    ) : previewUrl ? (
                        <div
                            className="relative bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300 ease-out"
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
                        <div className="flex flex-col items-center justify-center gap-4 text-[#a89d8e]">
                            <FolderOpen className="h-12 w-12" />
                            <p>No project loaded</p>
                        </div>
                    )}
                </div>

                {/* Terminal Drawer - Fixed at bottom */}
                {showTerminal && (
                    <div className="absolute bottom-0 left-0 right-0 h-72 z-20 border-t border-[#d6cfc9] bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom duration-300">
                        <Terminal
                            onTerminalReady={async (term: any) => {
                                try {
                                    const shell = await spawn('jsh', [], {
                                        env: {
                                            TERMINAL: 'xterm-256color',
                                        },
                                    });

                                    // Pipe shell output to process
                                    shell.output.pipeTo(
                                        new WritableStream({
                                            write(data) {
                                                term.write(data);
                                            },
                                        })
                                    );

                                    // Pipe terminal input to shell
                                    const input = shell.input.getWriter();
                                    term.onData((data: string) => {
                                        input.write(data);
                                    });

                                    // Start with a clean prompt
                                    // term.write('\r\nWelcome to WebContainer Shell\r\n\r\n');

                                } catch (e) {
                                    console.error('Failed to spawn shell:', e);
                                    term.write('\r\nFailed to spawn shell\r\n');
                                }
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
