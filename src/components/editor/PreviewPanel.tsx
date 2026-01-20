'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone, RefreshCw, X, Loader2, ExternalLink, AlertCircle, Download, Github } from 'lucide-react';
import { Button } from '@/components/ui';
import Image from 'next/image';
import { gsap } from 'gsap';

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
    repoUrl
}: PreviewPanelProps) {
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
    const [showGithubDropdown, setShowGithubDropdown] = useState(false);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const iframeContainerRef = useRef<HTMLDivElement>(null);
    const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const prevRefreshKey = useRef(refreshKey);
    const healthCheckRef = useRef<NodeJS.Timeout | null>(null);
    const MAX_RETRIES = 3;

    // Desktop iframe target resolution
    const DESKTOP_WIDTH = 1920;
    const DESKTOP_HEIGHT = 1080;

    // Suppress WebSocket errors in the iframe console (HMR connection errors)
    useEffect(() => {
        const originalError = console.error;
        console.error = (...args) => {
            // Filter out WebSocket HMR errors
            const message = args[0]?.toString() || '';
            if (
                message.includes('WebSocket connection') ||
                message.includes('Invalid frame header') ||
                message.includes('_next/webpack-hmr')
            ) {
                return; // Suppress these errors
            }
            originalError.apply(console, args);
        };

        return () => {
            console.error = originalError;
        };
    }, []);

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

    // Health check polling - ping preview URL until it responds with 200
    useEffect(() => {
        if (!previewUrl) {
            setIsServerReady(false);
            return;
        }

        // Clear any existing health check
        if (healthCheckRef.current) {
            clearInterval(healthCheckRef.current);
        }

        const checkServerHealth = async () => {
            try {
                // Try a regular fetch first (fastest if CORS allowed or same origin)
                // Use a short timeout to fail fast
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

                try {
                    const response = await fetch(previewUrl, {
                        method: 'HEAD',
                        mode: 'no-cors', // Allow cross-origin without CORS headers
                        cache: 'no-store',
                        signal: controller.signal
                    });

                    // In no-cors mode, we accept any response as "server is alive"
                    // If the server was down, fetch would throw (e.g. connection refused)
                    setIsServerReady(true);
                    setServerCheckCount(0);
                    if (healthCheckRef.current) clearInterval(healthCheckRef.current);
                    return;
                } catch (e) {
                    // Fetch failed, server likely down or network error
                } finally {
                    clearTimeout(timeoutId);
                }

            } catch (error) {
                setServerCheckCount(prev => prev + 1);
                console.log(`[Preview] Server check failed (attempt ${serverCheckCount + 1}):`, error);
            }
        };

        // Initial check
        setIsServerReady(false);
        setServerCheckCount(0);
        checkServerHealth();

        // Poll every 1000ms (faster 1s polling)
        healthCheckRef.current = setInterval(checkServerHealth, 1000);

        return () => {
            if (healthCheckRef.current) {
                clearInterval(healthCheckRef.current);
            }
        };
    }, [previewUrl]);

    // ... (reset load state effect) ...

    // ... (refresh key effect) ...

    // ... (timeout effect) ...

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
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowGithubDropdown(false);
            }
        };

        if (showGithubDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showGithubDropdown]);

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
                {/* Left - Exit Preview */}
                <div className="flex items-center">
                    {onExitPreview && (
                        <button
                            onClick={onExitPreview}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-gray-700 bg-white/40 border border-white/20 hover:bg-white/60 hover:text-gray-900 transition-all shadow-sm"
                        >
                            <X className="w-4 h-4" />
                            Exit Preview
                        </button>
                    )}
                </div>

                {/* Center - Page Selector, Device Toggle & Refresh */}
                <div className="flex items-center gap-3">
                    {/* Page Selector - Show if we have any pages */}
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
                                deviceMode === 'desktop'
                                    ? 'bg-white text-purple-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900'
                            )}
                            title="Desktop"
                        >
                            <Monitor className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setDeviceMode('mobile')}
                            className={cn(
                                'p-1.5 rounded-lg transition-all',
                                deviceMode === 'mobile'
                                    ? 'bg-white text-purple-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900'
                            )}
                            title="Mobile"
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-1 bg-white/40 border border-white/20 rounded-xl p-1 shadow-sm">
                        {/* Fix Error Button - Only show when a build error is detected */}
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

                        {previewUrl && (
                            <a
                                href={previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white transition-all"
                                title="Open in new tab"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        )}
                    </div>
                </div>

                {/* Right - GitHub & Deploy */}
                <div className="flex items-center gap-2">
                    {/* GitHub Dropdown */}
                    {repoUrl && (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setShowGithubDropdown(!showGithubDropdown)}
                                className="p-2 rounded-lg text-gray-700 bg-white/40 border border-white/20 hover:bg-white/60 transition-all shadow-sm"
                                title="GitHub Repository"
                            >
                                <Github className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu with Animation */}
                            {showGithubDropdown && (
                                <div
                                    className="absolute right-0 top-full mt-2 w-56 bg-white/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl overflow-hidden z-[10000] animate-in fade-in slide-in-from-top-2 duration-200"
                                    style={{
                                        animation: 'slideDown 0.2s ease-out'
                                    }}
                                >
                                    <style jsx>{`
                                        @keyframes slideDown {
                                            from {
                                                opacity: 0;
                                                transform: translateY(-8px);
                                            }
                                            to {
                                                opacity: 1;
                                                transform: translateY(0);
                                            }
                                        }
                                    `}</style>

                                    <div className="p-2">
                                        {/* View Repo */}
                                        <a
                                            href={repoUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors group"
                                            onClick={() => setShowGithubDropdown(false)}
                                        >
                                            <Github className="w-4 h-4 text-gray-600 group-hover:text-gray-900" />
                                            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                                View Repository
                                            </span>
                                        </a>

                                        {/* Download ZIP */}
                                        <button
                                            onClick={handleDownloadZip}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors group"
                                        >
                                            <Download className="w-4 h-4 text-gray-600 group-hover:text-gray-900" />
                                            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                                Download ZIP
                                            </span>
                                        </button>
                                    </div>
                                </div>
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
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Monitor className="w-16 h-16 mb-4 opacity-20" />
                            <p className="text-sm font-medium text-gray-700">Preview not available</p>
                            <p className="text-xs mt-1 text-gray-500">Send a message to start preview</p>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}
