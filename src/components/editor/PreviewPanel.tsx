'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone, RefreshCw, X, Loader2, ExternalLink, AlertCircle, Download, Github, Terminal as TerminalIcon, Code, Eye } from 'lucide-react';
import { Button } from '@/components/ui';
import Image from 'next/image';
import { gsap } from 'gsap';
import dynamic from 'next/dynamic';
import { useWebContainer } from '@/hooks/useWebContainer';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

// Dynamic imports for SSR safety
const Terminal = dynamic(() => import('./Terminal').then(mod => mod.Terminal), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center text-gray-400">Loading terminal...</div>
});

const CodeView = dynamic(() => import('./CodeView').then(mod => mod.CodeView), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center bg-[#1e1e1e] text-gray-400">Loading editor...</div>
});

type DeviceMode = 'desktop' | 'mobile';

interface PreviewPanelProps {
    previewUrl?: string;
    className?: string;
    onExitPreview?: () => void;
    onDeploy?: () => void;
    onFixError?: (errorMessage: string) => void;
    hasChanges?: boolean;
    isDeploying?: boolean;
    isLoading?: boolean;
    refreshKey?: number;
    availablePages?: string[];
    repoUrl?: string;
    projectId?: string;
    // External file selection (from chat panel clicking on file names)
    externalSelectedFile?: string | null;
}

export function PreviewPanel({
    previewUrl,
    className,
    onExitPreview,
    onDeploy,
    onFixError,
    hasChanges = false,
    isDeploying = false,
    isLoading = false,
    refreshKey = 0,
    availablePages = [],
    repoUrl,
    externalSelectedFile,
    projectId
}: PreviewPanelProps) {
    const router = useRouter();
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSyncToGithub = async () => {
        if (!projectId) return;
        try {
            setIsSyncing(true);
            const { data: { session } } = await supabase.auth.getSession();
            let token = session?.provider_token;

            // If no provider token in session, check if we have one in DB (optional fallback)
            // For now, rely on session or prompt
            if (!token) {
                // Simple prompt for MVP as requested "user later syncs"
                // Ideally we'd trigger OAuth flow, but keeping it simple/robust
                const promptToken = window.prompt("To sync, please enter a GitHub Personal Access Token (repo scope):");
                if (!promptToken) {
                    setIsSyncing(false);
                    return;
                }
                token = promptToken;
            }

            const response = await fetch('/api/projects/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    githubToken: token,
                    repoName: `automate-project-${Date.now()}` // Default name, user can rename later
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Sync failed');
            }

            const data = await response.json();
            console.log('Sync success:', data.repoUrl);

            // Refresh to update UI with new repoUrl
            router.refresh();
            // Force reload active project from DB? The parent component should handle this via router refresh
            window.location.reload();

        } catch (error: any) {
            console.error('Sync error:', error);
            alert(`Failed to sync: ${error.message}`);
        } finally {
            setIsSyncing(false);
        }
    };
    const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
    const [iframeKey, setIframeKey] = useState(0);
    const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
    const [retryCount, setRetryCount] = useState(0);
    const [currentPage, setCurrentPage] = useState('/');
    const [showPageSelector, setShowPageSelector] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [isServerReady, setIsServerReady] = useState(false);
    const [serverCheckCount, setServerCheckCount] = useState(0);
    const [drawerType, setDrawerType] = useState<'supabase' | 'github' | null>(null);
    const [showTerminal, setShowTerminal] = useState(false);
    const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

    // Auto-switch to code view when a file is selected from chat
    useEffect(() => {
        if (externalSelectedFile) {
            setViewMode('code');
        }
    }, [externalSelectedFile]);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const iframeContainerRef = useRef<HTMLDivElement>(null);
    const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const prevRefreshKey = useRef(refreshKey);
    const healthCheckRef = useRef<NodeJS.Timeout | null>(null);
    const MAX_RETRIES = 3;

    // Get spawn, listFiles, readFile from WebContainer for terminal and code view
    const { spawn, listFiles, readFile, writeFile } = useWebContainer();

    // Desktop iframe target resolution
    const DESKTOP_WIDTH = 1920;
    const DESKTOP_HEIGHT = 1080;


    // Mobile iframe target resolution
    const MOBILE_WIDTH = 390;
    const MOBILE_HEIGHT = 844;

    // Track container size for scaling
    useEffect(() => {
        const container = iframeContainerRef.current;
        if (!container) return;

        const updateSize = () => {
            const rect = container.getBoundingClientRect();
            setContainerSize({ width: rect.width, height: rect.height });
        };

        updateSize();

        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
    }, []);

    // Calculate scale factor for desktop mode
    const desktopScale = containerSize.width > 0 && containerSize.height > 0
        ? Math.min(containerSize.width / DESKTOP_WIDTH, containerSize.height / DESKTOP_HEIGHT)
        : 1;

    // Calculate scale factor for mobile mode
    const mobileScale = containerSize.width > 0 && containerSize.height > 0
        ? Math.min(containerSize.width / MOBILE_WIDTH, containerSize.height / MOBILE_HEIGHT)
        : 1;

    // Listen for build errors from iframe
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Only accept messages from the preview domain if set, but log everything for debug
            if (previewUrl && !event.origin.includes(new URL(previewUrl).hostname)) {
                // console.log('[Preview Debug] Ignoring message from different origin:', event.origin);
                // return; // Don't return yet, let's see what we get
            }

            // DEBUG: Log all messages
            // console.log('[Preview Debug] Received message:', event.data);

            // Check for Next.js build errors
            if (event.data?.type === 'webpack-error' || event.data?.type === 'build-error' || event.data?.type === 'turbopack-error') {
                const errorMessage = event.data.message || event.data.error || 'Build error occurred';
                setBuildError(errorMessage);
            } else if (event.data?.type === 'build-ok') {
                // Clear error when build is successful
                setBuildError(null);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [previewUrl]);

    // Periodically check for errors in iframe content
    useEffect(() => {
        if (!previewUrl || loadState !== 'loaded') return;

        const checkForErrors = () => {
            try {
                const iframe = iframeRef.current;
                if (iframe?.contentDocument) {
                    const iframeDoc = iframe.contentDocument;

                    // Check for various Next.js error indicators

                    // Method 1: Check known selectors
                    const errorOverlay = iframeDoc.querySelector('nextjs-portal') ||
                        iframeDoc.querySelector('[data-nextjs-dialog-overlay]') ||
                        iframeDoc.querySelector('#__next-build-error') ||
                        iframeDoc.querySelector('[data-nextjs-toast]');

                    // Method 2: Check text content (works if not in Shadow DOM)
                    const bodyText = iframeDoc.body?.textContent || '';
                    const hasBuildErrorText = bodyText.includes('Build Error') ||
                        bodyText.includes('Failed to compile') ||
                        bodyText.includes('Conflicting app and page');

                    // Method 3: Scan all body children for Shadow Roots (Next.js 13/14 method)
                    let shadowErrorText = '';
                    if (!errorOverlay && !hasBuildErrorText) {
                        const children = Array.from(iframeDoc.body?.children || []);
                        for (const child of children) {
                            if (child.shadowRoot) {
                                const shadowText = child.shadowRoot.textContent || '';
                                if (shadowText.includes('Build Error') ||
                                    shadowText.includes('Failed to compile') ||
                                    shadowText.includes('Conflicting app and page')) {
                                    shadowErrorText = shadowText;
                                    break;
                                }
                            }
                        }
                    }

                    if (errorOverlay || hasBuildErrorText || shadowErrorText) {
                        let errorText = shadowErrorText; // Prioritize shadow text if found

                        if (!errorText && errorOverlay) {
                            if (errorOverlay.shadowRoot) {
                                errorText = errorOverlay.shadowRoot.textContent || '';
                            }
                            if (!errorText) {
                                errorText = errorOverlay.textContent || '';
                            }
                        }

                        if (!errorText && hasBuildErrorText) {
                            errorText = bodyText;
                        }

                        // Default message if we detected an overlay/shadow-root but couldn't get text
                        if ((errorOverlay || shadowErrorText) && !errorText.trim()) {
                            errorText = "Build error detected. Please check the preview for details.";
                        }

                        if (errorText.length > 0) {
                            const lines = errorText.split('\n').filter(line => line.trim());
                            const errorMessage = lines.slice(0, 20).join('\n');
                            setBuildError(errorMessage);
                        }
                    } else {
                        setBuildError(null);
                    }
                }
            } catch (e) {
                // Ignore cross-origin errors
            }
        };

        // Check every 2 seconds
        const interval = setInterval(checkForErrors, 2000);
        return () => clearInterval(interval);
    }, [previewUrl, loadState]);

    // Build URL with cache busting
    const getFullPreviewUrl = useCallback(() => {
        if (!previewUrl) return '';
        const baseUrl = previewUrl.replace(/[?#].*$/, '');
        return `${baseUrl}${currentPage}?_v=${iframeKey}&_t=${Date.now()}`;
    }, [previewUrl, currentPage, iframeKey]);

    // With WebContainers, server runs in browser - no health check needed
    // Just set ready immediately when we have a URL
    useEffect(() => {
        if (!previewUrl) {
            setIsServerReady(false);
            return;
        }

        // Clear any existing health check
        if (healthCheckRef.current) {
            clearInterval(healthCheckRef.current);
            healthCheckRef.current = null;
        }

        // For WebContainers (or any URL after fly.io removal), set ready immediately
        console.log('[Preview] Setting server ready for:', previewUrl);
        setIsServerReady(true);
        setServerCheckCount(0);
    }, [previewUrl]);

    // Health check removed - using WebContainers now

    // Refresh iframe when refreshKey changes (triggered after AI file operations)
    useEffect(() => {
        if (refreshKey !== prevRefreshKey.current && refreshKey > 0) {
            console.log('[Preview] RefreshKey changed, triggering iframe refresh:', refreshKey);
            prevRefreshKey.current = refreshKey;
            // Small delay to allow HMR to process file changes
            setTimeout(() => {
                setLoadState('loading');
                setIframeKey(prev => prev + 1);
            }, 300);
        }
    }, [refreshKey]);

    // Also refresh when previewUrl changes (with cache buster)
    useEffect(() => {
        if (previewUrl && previewUrl.includes('_refresh=')) {
            console.log('[Preview] URL has refresh param, triggering iframe refresh');
            setLoadState('loading');
            setIframeKey(prev => prev + 1);
        }
    }, [previewUrl]);

    const handleIframeLoad = () => {
        console.log('[Preview] Iframe loaded successfully (Event)');
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
        }
        setLoadState('loaded');
        setRetryCount(0);

        // CRITICAL FIX: If iframe loads, server IS ready. Override any failed health checks.
        setIsServerReady(true);
        if (healthCheckRef.current) clearInterval(healthCheckRef.current);

        // Suppress WebSocket HMR errors inside the iframe (only works for same-origin)

        // Note: This will fail silently for cross-origin iframes due to CORS
        try {
            const iframe = iframeRef.current;
            if (iframe?.contentWindow) {
                const iframeWindow = iframe.contentWindow as any;
                const originalError = iframeWindow.console?.error;
                if (originalError) {
                    iframeWindow.console.error = (...args: any[]) => {
                        const message = args[0]?.toString() || '';
                        // Filter out WebSocket and HMR errors
                        if (
                            message.includes('WebSocket connection') ||
                            message.includes('Invalid frame header') ||
                            message.includes('_next/webpack-hmr') ||
                            message.includes('[HMR]')
                        ) {
                            return; // Suppress these errors
                        }
                        originalError.apply(iframeWindow.console, args);
                    };
                }
            }
        } catch (e) {
            // Silently fail - CORS prevents accessing cross-origin iframe console
            // This is expected and not an error
        }

        // Try to detect build errors from iframe content
        try {
            const iframe = iframeRef.current;
            if (iframe?.contentDocument) {
                const iframeDoc = iframe.contentDocument;

                // DEBUG: Check what we can access
                console.log('[Preview Debug] Accessing iframe content...');

                // Check for various Next.js error indicators
                // Method 1: Check known selectors
                const errorOverlay = iframeDoc.querySelector('nextjs-portal') ||
                    iframeDoc.querySelector('[data-nextjs-dialog-overlay]') ||
                    iframeDoc.querySelector('#__next-build-error') ||
                    iframeDoc.querySelector('[data-nextjs-toast]');

                // Method 2: Check text content (works if not in Shadow DOM)
                const bodyText = iframeDoc.body?.textContent || '';
                const hasBuildErrorText = bodyText.includes('Build Error') ||
                    bodyText.includes('Failed to compile') ||
                    bodyText.includes('Conflicting app and page');

                // Method 3: Scan all body children for Shadow Roots (Next.js 13/14 method)
                let shadowErrorText = '';
                if (!errorOverlay && !hasBuildErrorText) {
                    const children = Array.from(iframeDoc.body?.children || []);
                    console.log(`[Preview Debug] Scanning ${children.length} body children`);

                    for (const child of children) {
                        if (child.shadowRoot) {
                            console.log('[Preview Debug] Found shadow root on', child.tagName);
                            const shadowText = child.shadowRoot.textContent || '';
                            if (shadowText.includes('Build Error') ||
                                shadowText.includes('Failed to compile') ||
                                shadowText.includes('Conflicting app and page')) {
                                shadowErrorText = shadowText;
                                break;
                            } else {
                                console.log('[Preview Debug] Shadow content length:', shadowText.length);
                            }
                        }
                    }
                } else {
                    console.log('[Preview Debug] Found overlay or text in body');
                }

                if (errorOverlay || hasBuildErrorText || shadowErrorText) {
                    let errorText = shadowErrorText; // Prioritize shadow text if found

                    if (!errorText && errorOverlay) {
                        if (errorOverlay.shadowRoot) {
                            errorText = errorOverlay.shadowRoot.textContent || '';
                        }
                        if (!errorText) {
                            errorText = errorOverlay.textContent || '';
                        }
                    }

                    if (!errorText && hasBuildErrorText) {
                        errorText = bodyText;
                    }

                    // Default message if we detected an overlay/shadow-root but couldn't get text
                    if ((errorOverlay || shadowErrorText) && !errorText.trim()) {
                        errorText = "Build error detected. Please check the preview for details.";
                    }

                    if (errorText.length > 0) {
                        const lines = errorText.split('\n').filter(line => line.trim());
                        const errorMessage = lines.slice(0, 20).join('\n');
                        setBuildError(errorMessage);
                    }
                } else {
                    setBuildError(null);
                }
            }
        } catch (e) {
            // Cross-origin issues or other errors - ignore
            console.log('[Preview Debug] Error checking content (likely CORS):', e);
        }
    };

    const handleIframeError = () => {
        console.log('[Preview] Iframe error');
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
        }
        handleRetry();
    };

    const handleRetry = () => {
        if (retryCount < MAX_RETRIES) {
            console.log(`[Preview] Retry ${retryCount + 1}/${MAX_RETRIES}`);
            setRetryCount(prev => prev + 1);
            setLoadState('loading');
            // Wait a bit before retrying
            setTimeout(() => {
                setIframeKey(prev => prev + 1);
            }, 2000);
        } else {
            console.log('[Preview] Max retries reached, showing error');
            setLoadState('error');
        }
    };

    const handleManualRefresh = () => {
        console.log('[Preview] Manual refresh');
        setLoadState('loading');
        setRetryCount(0);
        setIframeKey(prev => prev + 1);
    };

    const handlePageChange = (page: string) => {
        setCurrentPage(page);
        setShowPageSelector(false);
        setLoadState('loading');
        setRetryCount(0);
        setIframeKey(prev => prev + 1);
    };

    const handleDownloadZip = () => {
        if (!repoUrl) return;
        // Convert GitHub repo URL to zip download URL
        // https://github.com/user/repo -> https://github.com/user/repo/archive/refs/heads/main.zip
        const zipUrl = `${repoUrl}/archive/refs/heads/main.zip`;
        window.open(zipUrl, '_blank');
        setShowGithubDropdown(false);
    };

    const logoRef = useRef<HTMLDivElement>(null);
    const drawerRef = useRef<HTMLDivElement>(null);

    // Close drawer when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
                setDrawerType(null);
            }
        };
        if (drawerType) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [drawerType]);

    // Logo animation for loading state
    useEffect(() => {
        if ((isLoading || loadState === 'loading') && logoRef.current) {
            const ctx = gsap.context(() => {
                gsap.fromTo(logoRef.current,
                    {
                        scale: 0.9,
                        opacity: 0.7,
                    },
                    {
                        scale: 1.1,
                        opacity: 1,
                        duration: 0.8,
                        repeat: -1,
                        yoyo: true,
                        ease: 'power2.inOut'
                    }
                );
            }, logoRef);

            return () => ctx.revert();
        }
    }, [isLoading, loadState]);

    return (
        <div className={cn('flex flex-col h-full', className)}>
            {/* Toolbar - Floating Transparent Glass */}
            <div className="relative z-[9999] flex items-center justify-between px-4 py-3 backdrop-blur-xl bg-white/30 border border-white/20 rounded-2xl mx-6 mt-6 mb-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] active:scale-[0.99] transition-all duration-300">
                {/* Left - Exit & View Toggle */}
                <div className="flex items-center gap-3">
                    {onExitPreview && (
                        <button
                            onClick={onExitPreview}
                            className="flex items-center justify-center p-2 rounded-xl text-gray-700 bg-white/40 border border-white/20 hover:bg-white/60 hover:text-gray-900 transition-all shadow-sm"
                            title="Exit Preview"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}

                    {/* View Mode Toggle - Preview / Code (Moved to left) */}
                    <div className="flex items-center p-1 rounded-xl bg-white/40 border border-white/20 shadow-sm">
                        <button
                            onClick={() => setViewMode('preview')}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all text-sm',
                                viewMode === 'preview'
                                    ? 'bg-white text-purple-600 shadow-sm font-medium'
                                    : 'text-gray-500 hover:text-gray-900'
                            )}
                            title="Preview"
                        >
                            <Eye className="w-4 h-4" />
                            <span className="hidden sm:inline">Preview</span>
                        </button>
                        <button
                            onClick={() => setViewMode('code')}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all text-sm',
                                viewMode === 'code'
                                    ? 'bg-white text-purple-600 shadow-sm font-medium'
                                    : 'text-gray-500 hover:text-gray-900'
                            )}
                            title="Code"
                        >
                            <Code className="w-4 h-4" />
                            <span className="hidden sm:inline">Code</span>
                        </button>
                    </div>
                </div>

                {/* Center - Page Selector, Device Toggle & Refresh */}
                <div className="flex items-center gap-3">
                    {/* Page Selector */}
                    {availablePages.length > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => setShowPageSelector(!showPageSelector)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm bg-white/40 border border-white/20 hover:bg-white/60 transition-all shadow-sm"
                                title="Select Page"
                            >
                                <span className="text-xs font-medium text-gray-900">{currentPage}</span>
                            </button>

                            {showPageSelector && (
                                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-[10000] w-64 max-h-96 overflow-y-auto bg-white/90 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl p-2">
                                    <div className="text-xs font-semibold text-gray-500 px-2 py-1 mb-1">
                                        Available Pages
                                    </div>
                                    {availablePages.map((page) => (
                                        <button
                                            key={page}
                                            onClick={() => handlePageChange(page)}
                                            className={cn(
                                                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                                                currentPage === page
                                                    ? 'bg-purple-500 text-white shadow-md'
                                                    : 'hover:bg-black/5 text-gray-900'
                                            )}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Device Toggle */}
                    <div className="flex items-center p-1 rounded-xl bg-white/40 border border-white/20 shadow-sm">
                        <button
                            onClick={() => setDeviceMode('desktop')}
                            className={cn(
                                'p-1.5 rounded-lg transition-all',
                                deviceMode === 'desktop' && viewMode === 'preview'
                                    ? 'bg-white text-purple-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900'
                            )}
                            title="Desktop"
                            disabled={viewMode === 'code'}
                        >
                            <Monitor className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setDeviceMode('mobile')}
                            className={cn(
                                'p-1.5 rounded-lg transition-all',
                                deviceMode === 'mobile' && viewMode === 'preview'
                                    ? 'bg-white text-purple-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900'
                            )}
                            title="Mobile"
                            disabled={viewMode === 'code'}
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-1 bg-white/40 border border-white/20 rounded-xl p-1 shadow-sm">
                        {/* Fix Error Button */}
                        {onFixError && buildError && (
                            <button
                                onClick={() => onFixError(`Please fix the following build error:\n\n${buildError}`)}
                                className="p-1.5 rounded-lg transition-all flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 bg-red-50/50"
                                title="Fix Build Error"
                            >
                                <AlertCircle className="w-4 h-4 animate-pulse" />
                                <span className="text-xs font-medium">Fix Error</span>
                            </button>
                        )}

                        <button
                            onClick={handleManualRefresh}
                            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white transition-all"
                            title="Refresh"
                            disabled={loadState === 'loading'}
                        >
                            <RefreshCw className={cn("w-4 h-4", loadState === 'loading' && "animate-spin")} />
                        </button>

                        {/* Terminal Toggle */}
                        <button
                            onClick={() => setShowTerminal(!showTerminal)}
                            className={cn(
                                "p-1.5 rounded-lg transition-all",
                                showTerminal
                                    ? "text-purple-600 bg-purple-100 hover:bg-purple-200"
                                    : "text-gray-600 hover:text-gray-900 hover:bg-white"
                            )}
                            title={showTerminal ? "Hide Terminal" : "Show Terminal"}
                        >
                            <TerminalIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Right - Supabase, GitHub (drawers), Deploy */}
                <div className="relative flex items-center gap-2" ref={drawerRef}>
                    {/* Supabase icon - opens drawer */}
                    <button
                        onClick={() => setDrawerType(drawerType === 'supabase' ? null : 'supabase')}
                        className={cn(
                            "p-2 rounded-lg bg-white/40 border border-white/20 hover:bg-white/60 transition-all shadow-sm flex items-center justify-center",
                            drawerType === 'supabase' && "bg-emerald-100 border-emerald-200 ring-1 ring-emerald-200"
                        )}
                        title="Supabase"
                    >
                        <Image src="/supabase-logo.png" alt="Supabase" width={18} height={18} className="object-contain" />
                    </button>

                    {/* GitHub icon - opens drawer (Sync to GitHub or repo actions) */}
                    <button
                        onClick={() => setDrawerType(drawerType === 'github' ? null : 'github')}
                        className={cn(
                            "p-2 rounded-lg bg-white/40 border border-white/20 hover:bg-white/60 transition-all shadow-sm flex items-center justify-center",
                            drawerType === 'github' && "bg-gray-100 border-gray-200 ring-1 ring-gray-200"
                        )}
                        title={repoUrl ? "GitHub Repository" : "Sync to GitHub"}
                    >
                        <Github className="w-4 h-4 text-gray-700" />
                    </button>

                    {/* Expandable drawer - slides in from right of icons */}
                    {drawerType && (
                        <div
                            className={cn(
                                "absolute right-0 top-full mt-2 flex flex-col overflow-hidden rounded-xl border bg-white/95 shadow-2xl backdrop-blur-xl z-[10000] border-white/20",
                                drawerType === 'supabase' ? "w-64" : "w-56"
                            )}
                            style={{
                                animation: 'previewDrawerIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
                                transformOrigin: 'top right',
                            }}
                        >
                            <style>{`
                                @keyframes previewDrawerIn {
                                    from {
                                        opacity: 0;
                                        transform: scale(0.92) translateX(8px);
                                    }
                                    to {
                                        opacity: 1;
                                        transform: scale(1) translateX(0);
                                    }
                                }
                            `}</style>

                            {drawerType === 'supabase' && (
                                <>
                                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                        <Image src="/supabase-logo.png" alt="" width={20} height={20} className="object-contain shrink-0" />
                                        <span className="font-semibold text-gray-900">Supabase</span>
                                    </div>
                                    <div className="p-3 space-y-1">
                                        <a
                                            href="https://supabase.com/dashboard"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                                            onClick={() => setDrawerType(null)}
                                        >
                                            Dashboard
                                        </a>
                                        <a
                                            href="https://supabase.com/docs"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                                            onClick={() => setDrawerType(null)}
                                        >
                                            Documentation
                                        </a>
                                        <p className="px-3 py-2 text-xs text-gray-500">
                                            Connect your project to Supabase for auth, database, and storage.
                                        </p>
                                    </div>
                                </>
                            )}

                            {drawerType === 'github' && (
                                <>
                                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                        <Github className="w-5 h-5 text-gray-700" />
                                        <span className="font-semibold text-gray-900">GitHub</span>
                                    </div>
                                    <div className="p-2">
                                        {repoUrl ? (
                                            <>
                                                <a
                                                    href={repoUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors group"
                                                    onClick={() => setDrawerType(null)}
                                                >
                                                    <Github className="w-4 h-4 text-gray-600 group-hover:text-gray-900" />
                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                                        View Repository
                                                    </span>
                                                </a>
                                                <button
                                                    onClick={() => { handleDownloadZip(); setDrawerType(null); }}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors group"
                                                >
                                                    <Download className="w-4 h-4 text-gray-600 group-hover:text-gray-900" />
                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                                        Download ZIP
                                                    </span>
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => { handleSyncToGithub(); setDrawerType(null); }}
                                                disabled={isSyncing}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSyncing ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                                                ) : (
                                                    <Github className="w-4 h-4 text-gray-600 group-hover:text-gray-900" />
                                                )}
                                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                                    {isSyncing ? 'Syncing...' : 'Sync to GitHub'}
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Deploy Button */}
                    {onDeploy && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onDeploy}
                            disabled={!hasChanges || isDeploying}
                            leftIcon={isDeploying ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                            className={cn(
                                "shadow-lg active:scale-95 transition-all text-white border-0",
                                isDeploying ? "bg-purple-400" : "bg-purple-500 hover:bg-purple-600 shadow-purple-500/20"
                            )}
                        >
                            {isDeploying ? 'Deploying...' : 'Deploy'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
                {/* Code View */}
                {viewMode === 'code' ? (
                    <CodeView
                        listFiles={listFiles}
                        readFile={readFile}
                        writeFile={async (path, content) => { await writeFile(path, content); }}
                        className="w-full h-full"
                        externalSelectedFile={externalSelectedFile}
                    />
                ) : (
                    /* Preview View */
                    <div
                        ref={iframeContainerRef}
                        className={cn(
                            'overflow-hidden transition-all duration-500 ease-out w-full h-full',
                            (isLoading || loadState === 'loading' || loadState === 'error')
                                ? 'bg-transparent'
                                : ''
                        )}
                    >
                        {/* Loading overlay - Show while waiting for AI OR while server is starting up */}
                        {(isLoading || (previewUrl && (!isServerReady || loadState === 'loading'))) && (
                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-transparent">
                                <div ref={logoRef} className="mb-6">
                                    <Image
                                        src="/automatelogo.png"
                                        alt="AutoMate"
                                        width={80}
                                        height={80}
                                        className="drop-shadow-2xl object-contain"
                                    />
                                </div>
                                <p className="text-gray-900 text-sm font-medium drop-shadow-sm">
                                    {!previewUrl ? 'Waiting for AI...' : (!isServerReady ? 'Building your site...' : 'Loading preview...')}
                                </p>
                                {!previewUrl && (
                                    <p className="text-gray-600 text-xs mt-2 drop-shadow-sm">
                                        AI is creating your content
                                    </p>
                                )}
                                {previewUrl && !isServerReady && (
                                    <p className="text-gray-600 text-xs mt-2 drop-shadow-sm">
                                        Starting preview server...
                                    </p>
                                )}
                                {previewUrl && isServerReady && retryCount > 0 && (
                                    <p className="text-gray-700 text-xs mt-2 drop-shadow-sm">
                                        Retry {retryCount}/{MAX_RETRIES}
                                    </p>
                                )}
                                {/* Progress bar - only show when building */}
                                {previewUrl && !isServerReady && (
                                    <div className="mt-4 w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse"
                                            style={{
                                                width: `${Math.min((serverCheckCount / 15) * 100, 95)}%`,
                                                transition: 'width 0.5s ease-out'
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error state - Only show on error */}
                        {loadState === 'error' && previewUrl && (
                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm">
                                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                                <p className="text-gray-900 font-semibold mb-2">Preview Server Not Ready</p>
                                <p className="text-gray-600 text-sm mb-2 text-center px-8 max-w-md">
                                    The preview server is still starting up or stopped.
                                </p>
                                <p className="text-gray-500 text-xs mb-6 text-center px-8 max-w-md">
                                    Send a message to the AI to trigger changes, or manually refresh after a few seconds.
                                </p>
                                <button
                                    onClick={handleManualRefresh}
                                    className="px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 shadow-md"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Retry Preview
                                </button>
                            </div>
                        )}

                        {previewUrl ? (
                            <div className={cn(
                                "relative w-full h-full flex items-center justify-center",
                                (!isServerReady || loadState === 'loading' || loadState === 'error') && "invisible"
                            )}>
                                {/* Desktop View */}
                                <div
                                    className="absolute inset-0 flex items-center justify-center p-4"
                                    style={{
                                        opacity: deviceMode === 'desktop' ? 1 : 0,
                                        transform: deviceMode === 'desktop' ? 'scale(1)' : 'scale(0.98)',
                                        pointerEvents: deviceMode === 'desktop' ? 'auto' : 'none',
                                        overflow: 'hidden',
                                        transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        willChange: 'opacity, transform',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: '16px',
                                            overflow: 'hidden',
                                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                                        }}
                                    >
                                        <iframe
                                            ref={deviceMode === 'desktop' ? iframeRef : undefined}
                                            key={`desktop-${iframeKey}`}
                                            src={getFullPreviewUrl()}
                                            style={{
                                                width: '111.11%',
                                                height: '111.11%',
                                                transform: 'scale(0.9)',
                                                transformOrigin: 'top left',
                                                border: 'none',
                                            }}
                                            title="Preview Desktop"
                                            onLoad={deviceMode === 'desktop' ? handleIframeLoad : undefined}
                                            onError={deviceMode === 'desktop' ? handleIframeError : undefined}
                                        />
                                    </div>
                                </div>

                                {/* Mobile View */}
                                <div
                                    className="absolute inset-0 flex items-center justify-center"
                                    style={{
                                        opacity: deviceMode === 'mobile' ? 1 : 0,
                                        transform: deviceMode === 'mobile' ? 'scale(1)' : 'scale(0.98)',
                                        pointerEvents: deviceMode === 'mobile' ? 'auto' : 'none',
                                        transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        willChange: 'opacity, transform',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: `${MOBILE_WIDTH * mobileScale}px`,
                                            height: `${MOBILE_HEIGHT * mobileScale}px`,
                                            borderRadius: `${40 * mobileScale}px`,
                                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                                            overflow: 'hidden',
                                            position: 'relative',
                                        }}
                                    >
                                        <iframe
                                            ref={deviceMode === 'mobile' ? iframeRef : undefined}
                                            key={`mobile-${iframeKey}`}
                                            src={getFullPreviewUrl()}
                                            style={{
                                                width: `${MOBILE_WIDTH}px`,
                                                height: `${MOBILE_HEIGHT}px`,
                                                transform: `scale(${mobileScale})`,
                                                transformOrigin: 'top left',
                                                border: 'none',
                                                borderRadius: '40px',
                                            }}
                                            title="Preview Mobile"
                                            onLoad={deviceMode === 'mobile' ? handleIframeLoad : undefined}
                                            onError={deviceMode === 'mobile' ? handleIframeError : undefined}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : !isLoading ? (
                            /* Only show empty state when NOT loading - otherwise the loading overlay handles it */
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <Monitor className="w-16 h-16 mb-4 opacity-20" />
                                <p className="text-sm font-medium text-gray-700">Preview not available</p>
                                <p className="text-xs mt-1 text-gray-500">Send a message to start preview</p>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>

            {/* Terminal Drawer - Fixed at bottom of preview */}
            {showTerminal && (
                <div className="absolute bottom-0 left-0 right-0 h-72 z-[100] border-t border-gray-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom duration-300">
                    <Terminal
                        onTerminalReady={async (term: any) => {
                            try {
                                const shell = await spawn('jsh', [], {
                                    env: {
                                        TERMINAL: 'xterm-256color',
                                    },
                                });

                                // Pipe shell output to terminal
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
                            } catch (e) {
                                console.error('Failed to spawn shell:', e);
                                term.write('\r\nFailed to spawn shell\r\n');
                            }
                        }}
                    />
                </div>
            )}
        </div>
    );
}
