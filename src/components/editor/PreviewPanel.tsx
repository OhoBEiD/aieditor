'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone, RefreshCw, X, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
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
    availablePages = []
}: PreviewPanelProps) {
    const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
    const [iframeKey, setIframeKey] = useState(0);
    const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
    const [retryCount, setRetryCount] = useState(0);
    const [currentPage, setCurrentPage] = useState('/');
    const [showPageSelector, setShowPageSelector] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const prevRefreshKey = useRef(refreshKey);
    const MAX_RETRIES = 3;

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

    // Reset load state when URL changes
    useEffect(() => {
        if (previewUrl) {
            setLoadState('loading');
            setRetryCount(0);
        }
    }, [previewUrl]);

    // Handle refreshKey changes - DON'T reload iframe, HMR handles updates automatically
    useEffect(() => {
        if (refreshKey !== prevRefreshKey.current && refreshKey > 0) {
            prevRefreshKey.current = refreshKey;
            // With direct file writes, Next.js HMR picks up changes automatically
            // No need to reload the iframe - just log for debugging
            console.log('[Preview] Changes detected, HMR should handle update automatically');
            // If we're in error state, try reloading
            if (loadState === 'error') {
                console.log('[Preview] Was in error state, attempting reload...');
                setLoadState('loading');
                setRetryCount(0);
                setIframeKey(prev => prev + 1);
            }
        }
    }, [refreshKey, loadState]);

    // Set loading timeout
    useEffect(() => {
        if (loadState === 'loading' && previewUrl) {
            // Clear any existing timeout
            if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
            }

            // Set new timeout - 30 seconds for initial load
            loadTimeoutRef.current = setTimeout(() => {
                console.log('[Preview] Load timeout reached, retrying...');
                handleRetry();
            }, 30000);
        }

        return () => {
            if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
            }
        };
    }, [loadState, iframeKey, previewUrl]);

    const handleIframeLoad = () => {
        console.log('[Preview] Iframe loaded successfully');
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
        }
        setLoadState('loaded');
        setRetryCount(0);

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

    const logoRef = useRef<HTMLDivElement>(null);

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
            <div className="flex items-center justify-between px-4 py-3 backdrop-blur-xl bg-white/30 border border-white/20 rounded-2xl mx-6 mt-6 mb-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] active:scale-[0.99] transition-all duration-300">
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
                                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-[9999] w-64 max-h-96 overflow-y-auto bg-white/90 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl p-2">
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

                {/* Right - Deploy */}
                <div className="flex items-center">
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
            <div className="flex-1 flex items-start justify-center px-6 pb-6 overflow-hidden relative">
                <div
                    className={cn(
                        'rounded-[2rem] overflow-hidden transition-all duration-500 ease-out ring-1 ring-black/5',
                        (isLoading || loadState === 'loading' || loadState === 'error')
                            ? 'bg-transparent shadow-none border-0 ring-0'
                            : 'bg-white shadow-2xl border-0',
                        deviceMode === 'desktop' ? 'w-full h-full' : 'w-[390px] h-[844px] max-h-full my-auto rounded-[3rem] border-0'
                    )}
                >
                    {/* Loading overlay - Transparent to show SVG background */}
                    {(isLoading || loadState === 'loading') && previewUrl && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center">
                            <div ref={logoRef} className="mb-6">
                                <Image
                                    src="/automatelogo.png"
                                    alt="AutoMate"
                                    width={80}
                                    height={80}
                                    className="drop-shadow-2xl object-contain"
                                />
                            </div>
                            <p className="text-gray-900 text-sm font-medium drop-shadow-sm">Loading preview...</p>
                            {retryCount > 0 && (
                                <p className="text-gray-700 text-xs mt-2 drop-shadow-sm">
                                    Retry {retryCount}/{MAX_RETRIES}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Error state */}
                    {loadState === 'error' && previewUrl && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center">
                            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                            <p className="text-gray-900 font-semibold mb-2">Preview failed to load</p>
                            <p className="text-gray-600 text-sm mb-6 text-center px-8">
                                The preview server might still be starting up. Please try again.
                            </p>
                            <button
                                onClick={handleManualRefresh}
                                className="px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 shadow-md"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Retry
                            </button>
                        </div>
                    )}

                    {previewUrl ? (
                        <iframe
                            ref={iframeRef}
                            key={iframeKey}
                            src={getFullPreviewUrl()}
                            className="w-full h-full border-0"
                            title="Preview"
                            onLoad={handleIframeLoad}
                            onError={handleIframeError}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-white">
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
