'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChatSelector } from '@/components/chat/ChatSelector';
import { ChatPanel } from '@/components/chat/ChatPanel';
import type { ExecutorMode } from '@/components/chat/MessageInput';
import { PreviewPanel } from '@/components/editor/PreviewPanel';
import { DeploymentSettings } from '@/components/settings/DeploymentSettings';
import { supabase } from '@/lib/supabase/client';
import { applyChanges, rollbackChanges } from '@/lib/n8n/client';
import { useThinkingSteps } from '@/hooks/useThinkingSteps';
import type { ThinkingStep } from '@/components/chat/ThinkingSteps';
import { cn } from '@/lib/utils';
import { Bot, X, Settings, MessageSquare } from 'lucide-react';
import { LandingPage } from '@/components/landing/LandingPage';
import { gsap } from 'gsap';
import Image from 'next/image';

// Configuration - Can be overridden by active project
const DEFAULT_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

// Loading Screen Component with Animated Logo
function LoadingScreen() {
    const logoRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

            // Logo reveal with shine effect
            tl.fromTo(logoRef.current,
                {
                    scale: 0.8,
                    opacity: 0,
                    rotation: -10
                },
                {
                    scale: 1,
                    opacity: 1,
                    rotation: 0,
                    duration: 1.2,
                    ease: 'back.out(1.7)'
                }
            )
                // Shine effect on logo
                .to(logoRef.current, {
                    filter: 'brightness(1.4)',
                    duration: 0.4,
                    yoyo: true,
                    repeat: 1
                }, '-=0.4');

        }, logoRef);

        return () => ctx.revert();
    }, []);

    return (
        <div className="h-screen w-full relative overflow-hidden flex items-center justify-center">
            {/* Animated SVG Background */}
            <svg
                className="absolute inset-0 w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 1920 1080"
                preserveAspectRatio="xMidYMid slice"
            >
                <defs>
                    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="80" />
                    </filter>

                    <radialGradient id="blob1" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#6366f1;#8b5cf6;#ec4899;#6366f1" dur="8s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0">
                            <animate attributeName="stop-color" values="#6366f1;#8b5cf6;#ec4899;#6366f1" dur="8s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>

                    <radialGradient id="blob2" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#8b5cf6;#ec4899;#f59e0b;#8b5cf6" dur="10s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0">
                            <animate attributeName="stop-color" values="#8b5cf6;#ec4899;#f59e0b;#8b5cf6" dur="10s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>

                    <radialGradient id="blob3" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#ec4899" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#ec4899;#f59e0b;#10b981;#ec4899" dur="12s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#ec4899" stopOpacity="0">
                            <animate attributeName="stop-color" values="#ec4899;#f59e0b;#10b981;#ec4899" dur="12s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>

                    <radialGradient id="blob4" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#f59e0b;#10b981;#06b6d4;#f59e0b" dur="9s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0">
                            <animate attributeName="stop-color" values="#f59e0b;#10b981;#06b6d4;#f59e0b" dur="9s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>

                    <radialGradient id="blob5" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#10b981;#06b6d4;#6366f1;#10b981" dur="11s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0">
                            <animate attributeName="stop-color" values="#10b981;#06b6d4;#6366f1;#10b981" dur="11s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>
                </defs>

                <rect width="100%" height="100%" fill="#ffffff" />

                <g filter="url(#blur)">
                    <ellipse cx="20%" cy="35%" rx="450" ry="380" fill="url(#blob1)">
                        <animate attributeName="cx" values="20%;35%;15%;20%" dur="15s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="35%;50%;30%;35%" dur="12s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="450;480;450" dur="10s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="380;410;380" dur="11s" repeatCount="indefinite" />
                    </ellipse>

                    <ellipse cx="75%" cy="45%" rx="420" ry="350" fill="url(#blob2)">
                        <animate attributeName="cx" values="75%;65%;80%;75%" dur="18s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="45%;60%;40%;45%" dur="14s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="420;450;420" dur="12s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="350;380;350" dur="13s" repeatCount="indefinite" />
                    </ellipse>

                    <ellipse cx="50%" cy="65%" rx="480" ry="400" fill="url(#blob3)">
                        <animate attributeName="cx" values="50%;55%;45%;50%" dur="16s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="65%;55%;70%;65%" dur="11s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="480;510;480" dur="14s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="400;430;400" dur="15s" repeatCount="indefinite" />
                    </ellipse>

                    <ellipse cx="30%" cy="70%" rx="400" ry="330" fill="url(#blob4)">
                        <animate attributeName="cx" values="30%;40%;25%;30%" dur="17s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="70%;60%;75%;70%" dur="13s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="400;430;400" dur="11s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="330;360;330" dur="12s" repeatCount="indefinite" />
                    </ellipse>

                    <ellipse cx="80%" cy="25%" rx="380" ry="320" fill="url(#blob5)">
                        <animate attributeName="cx" values="80%;70%;85%;80%" dur="14s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="25%;35%;20%;25%" dur="16s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="380;410;380" dur="13s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="320;350;320" dur="14s" repeatCount="indefinite" />
                    </ellipse>
                </g>
            </svg>

            {/* Animated Logo */}
            <div ref={logoRef} className="relative z-10">
                <Image
                    src="/automatelogo.png"
                    alt="AutoMate"
                    width={120}
                    height={120}
                    className="drop-shadow-2xl object-contain"
                />
            </div>
        </div>
    );
}

// Types
interface ChatSession {
    id: string;
    client_id: string;
    title: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface Message {
    id: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}

interface RequestContext {
    requestId: string;
    status: 'preview_ready' | 'applied' | 'rolled_back';
    previewUrl: string;
    prUrl: string;
    messageId: string;
}

interface Project {
    id: string;
    siteKey: string;
    name: string;
    repoUrl: string;
    previewSubdomain: string;
}

export default function Home() {
    const [showPreview, setShowPreview] = useState(false);
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    // Active project state - replaces hardcoded DEMO_CLIENT_ID
    const [activeProject, setActiveProject] = useState<Project | null>(null);
    const activeProjectId = activeProject?.id || DEFAULT_CLIENT_ID; // Use UUID id for database queries

    // Thinking steps state - Live updates from Supabase
    const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
    const { steps: liveThinkingSteps, isSubscribed } = useThinkingSteps(currentRequestId);
    const [agentThinking, setAgentThinking] = useState<string[]>([]); // Real thinking from n8n
    const [isStreaming, setIsStreaming] = useState(false);

    // Helper to add message without duplicates
    const addMessage = useCallback((newMsg: Message) => {
        setMessages(prev => {
            // Check if message already exists
            if (prev.some(m => m.id === newMsg.id)) {
                return prev;
            }
            return [...prev, newMsg];
        });
    }, []);
    const [isSending, setIsSending] = useState(false);
    const [isClient, setIsClient] = useState(false);
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);

    // n8n workflow state
    const [previewUrl, setPreviewUrl] = useState<string | undefined>();
    const [requestContexts, setRequestContexts] = useState<Map<string, RequestContext>>(new Map());
    const [isDeploying, setIsDeploying] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
    const [availablePages, setAvailablePages] = useState<string[]>(['/']);

    // Settings view toggle
    const [showSettings, setShowSettings] = useState(false);

    // Executor mode - user selection for Fast vs Thinking
    const [executorMode, setExecutorMode] = useState<ExecutorMode>('thinking');

    // Abort controller for canceling requests
    const abortControllerRef = useRef<AbortController | null>(null);

    // Current request ID for stopping n8n execution
    const currentRequestIdRef = useRef<string | null>(null);

    // No inactivity timeout - preview stays running until page closes or preview mode is off

    // Start the preview server
    const startPreview = useCallback(async (projectOverride?: Project) => {
        const project = projectOverride || activeProject;
        console.log('[Preview] startPreview called with:', project);

        if (!project) {
            console.warn('[Preview] No project provided');
            return;
        }

        // Use siteKey if available, otherwise fall back to id
        const effectiveSiteKey = project.siteKey || project.id;
        if (!effectiveSiteKey) {
            console.error('[Preview] Project has no siteKey or id:', project);
            return;
        }

        setIsPreviewLoading(true);
        // DON'T set preview URL here - wait for AI response to avoid showing 502 errors
        // The URL will be set by handleSendMessage after AI responds
        console.log('[Preview] Starting preview server, waiting for orchestrator...');

        // Get GitHub token for detecting pages and orchestrator
        // Fallback to system token for email-only users
        const SYSTEM_GITHUB_TOKEN = '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';
        let token: string | undefined;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            token = session?.provider_token || undefined;
            if (!token && session?.user) {
                // Try fetching from DB - Use maybeSingle() to avoid 406 triggers on strict cardinatlity errors
                const { data: dbToken } = await supabase.from('github_tokens' as any).select('access_token').eq('user_id', session.user.id).limit(1).maybeSingle();
                if (dbToken) token = dbToken.access_token;
            }
        } catch (e) {
            console.warn('Failed to get token for preview:', e);
        }

        // Use system token as fallback if no user token
        if (!token) {
            console.log('[Preview] Using system GitHub token as fallback');
            token = SYSTEM_GITHUB_TOKEN;
        }

        try {
            const targetSiteId = effectiveSiteKey;
            const targetRepoUrl = project.repoUrl;

            console.log('[Preview] Starting for:', {
                targetSiteId,
                targetRepoUrl,
                hasToken: !!token,
                tokenPrefix: token?.substring(0, 10) + '...',
                project
            });

            const requestBody = {
                siteId: targetSiteId,
                repoUrl: targetRepoUrl,
                gitToken: token
            };
            console.log('[Preview] Sending to orchestrator:', { ...requestBody, gitToken: requestBody.gitToken ? '***' : undefined });

            // Retry logic for orchestrator call (handles race condition with new repo creation)
            let response: Response | null = null;
            let lastError: Error | null = null;
            const maxRetries = 3;

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    response = await fetch('https://preview-orchestrator.fly.dev/preview/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody),
                    });

                    if (response.ok) {
                        break; // Success, exit retry loop
                    }

                    // Try to get error details - handle both JSON and text responses
                    let errorData: { error?: string; message?: string; raw?: string } = {};
                    try {
                        const text = await response.text();
                        try {
                            errorData = JSON.parse(text);
                        } catch {
                            errorData = { raw: text.substring(0, 500) }; // Capture raw text if not JSON
                        }
                    } catch {
                        errorData = { raw: 'Failed to read response body' };
                    }
                    // Use warn instead of error for retryable attempts to avoid Next.js error overlay
                    if (response.status === 500 && attempt < maxRetries - 1) {
                        console.warn(`[Preview] Orchestrator error (attempt ${attempt + 1}/${maxRetries}), will retry:`, response.status, errorData);
                        const delay = (attempt + 1) * 2000; // 2s, 4s, 6s
                        console.log(`[Preview] Retrying in ${delay / 1000}s...`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }

                    // Final attempt or non-retryable error - log as error
                    console.error(`[Preview] Orchestrator error (final):`, response.status, errorData);

                    // Non-retryable error or max retries reached
                    setShowPreview(true);
                    const errorMessage = errorData.error || errorData.message || errorData.raw || response.statusText || `HTTP ${response.status}`;
                    throw new Error(`Failed to start preview: ${errorMessage}`);
                } catch (err) {
                    if (err instanceof Error && err.message.startsWith('Failed to start preview:')) {
                        throw err; // Re-throw our own errors
                    }
                    lastError = err instanceof Error ? err : new Error(String(err));
                    if (attempt < maxRetries - 1) {
                        const delay = (attempt + 1) * 2000;
                        console.log(`[Preview] Network error, retrying in ${delay / 1000}s...`, err);
                        await new Promise(r => setTimeout(r, delay));
                    }
                }
            }

            if (!response?.ok) {
                throw lastError || new Error('Failed to start preview after retries');
            }

            const data = await response.json();
            if (data.status === 'ready' || data.status === 'starting') {
                setPreviewUrl(data.previewUrl || `https://${targetSiteId}.preview.automatelb.com`);
                setShowPreview(true); // Ensure we switch to Editor view

                // Detect available pages from repo
                detectAvailablePages(targetRepoUrl, token);
            }
        } catch (err) {
            console.error('Failed to start preview:', err);
            // Still switch to preview view so user can see the error state
            setShowPreview(true);
        } finally {
            setIsPreviewLoading(false);
        }
    }, [supabase]);

    // Detect available pages from the repository
    const detectAvailablePages = async (repoUrl: string, token?: string) => {
        try {
            // Parse owner/repo from URL
            const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
            if (!match) return;
            const [, owner, repo] = match;

            const headers: HeadersInit = {
                'Accept': 'application/vnd.github+json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`, { headers });

            if (!response.ok) {
                console.log('[Preview] Failed to fetch repo tree:', response.status);
                return;
            }

            const data = await response.json();

            if (data.tree) {
                const pages: string[] = ['/'];

                // Detect Next.js App Router pages
                data.tree.forEach((file: any) => {
                    if (file.type === 'blob' && file.path.match(/^(app|src\/app)\/.+\/page\.(tsx|jsx|js|ts)$/)) {
                        const pagePath = file.path
                            .replace(/^(app|src\/app)/, '')
                            .replace(/\/page\.(tsx|jsx|js|ts)$/, '')
                            || '/';
                        if (!pages.includes(pagePath)) {
                            pages.push(pagePath);
                        }
                    }

                    // Detect Next.js Pages Router
                    if (file.type === 'blob' && file.path.match(/^(pages|src\/pages)\/.+\.(tsx|jsx|js|ts)$/)) {
                        const pagePath = file.path
                            .replace(/^(pages|src\/pages)/, '')
                            .replace(/\.(tsx|jsx|js|ts)$/, '')
                            .replace(/\/index$/, '')
                            || '/';
                        if (!pagePath.startsWith('/_') && !pagePath.startsWith('/api/') && !pages.includes(pagePath)) {
                            pages.push(pagePath);
                        }
                    }
                });

                // Sort pages alphabetically
                pages.sort();
                setAvailablePages(pages);
            }
        } catch (error) {
            console.error('Failed to detect pages:', error);
        }
    };

    // Exit preview and stop orchestrator
    const handleExitPreview = useCallback(async () => {
        setShowPreview(false);
        setPreviewUrl(undefined);
        // Clear preview URL from localStorage when exiting
        localStorage.removeItem('previewUrl');

        // Stop the preview server
        try {
            await fetch('https://preview-orchestrator.fly.dev/preview/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: activeProjectId })
            });
            console.log('[Preview] Preview server stopped');
        } catch (err) {
            console.error('[Preview] Failed to stop preview server:', err);
        }
    }, []);

    // Stop preview when page unloads
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Note: This is best-effort, may not always fire (e.g., PC shutdown)
            navigator.sendBeacon?.('https://preview-orchestrator.fly.dev/preview/stop', JSON.stringify({ siteId: activeProjectId }));
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // Suppress preview iframe WebSocket HMR errors (these are harmless noise from the preview server)
    useEffect(() => {
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalLog = console.log;

        const shouldSuppress = (message: string) => {
            return message.includes('WebSocket connection') ||
                message.includes('Invalid frame header') ||
                message.includes('_next/webpack-hmr') ||
                message.includes('[HMR] connected') ||
                message.includes('failed: Invalid frame header');
        };

        console.error = (...args: any[]) => {
            const message = args[0]?.toString() || '';
            if (shouldSuppress(message)) return;
            originalError.apply(console, args);
        };

        console.warn = (...args: any[]) => {
            const message = args[0]?.toString() || '';
            if (shouldSuppress(message)) return;
            originalWarn.apply(console, args);
        };

        console.log = (...args: any[]) => {
            const message = args[0]?.toString() || '';
            if (shouldSuppress(message)) return;
            originalLog.apply(console, args);
        };

        return () => {
            console.error = originalError;
            console.warn = originalWarn;
            console.log = originalLog;
        };
    }, []);

    // Define loadSessions function before useEffect hooks that use it
    const loadSessions = useCallback(async () => {
        setIsLoadingSessions(true);
        try {
            const { data, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('client_id', activeProjectId)
                .eq('is_active', true)
                .order('updated_at', { ascending: false });

            if (error) throw error;

            const typedData = (data || []) as ChatSession[];
            setSessions(typedData);

            // Auto-select: prefer localStorage last session, then first session
            if (typedData.length > 0 && !activeSessionId) {
                const lastSessionId = localStorage.getItem('lastActiveSessionId');
                const sessionExists = typedData.some(s => s.id === lastSessionId);
                if (lastSessionId && sessionExists) {
                    setActiveSessionId(lastSessionId);
                } else {
                    setActiveSessionId(typedData[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to load sessions:', err);
        } finally {
            setIsLoadingSessions(false);
        }
    }, [activeProjectId, activeSessionId]);

    // Auto-start preview when showPreview is true
    // Always start preview for active project to ensure server is running
    useEffect(() => {
        if (isClient && showPreview && !isPreviewLoading && activeProject && !previewUrl) {
            // Start preview if we don't have a preview URL yet
            // The server will be provisioned if needed
            console.log('[Preview] Auto-starting preview on load...');
            startPreview();
        }
    }, [isClient, showPreview, isPreviewLoading, activeProject?.id, previewUrl]);

    // Fix hydration + restore preferences + restore active project
    useEffect(() => {
        setIsClient(true);

        // Restore active project first
        let hasActiveProject = false;
        try {
            const savedProject = localStorage.getItem('activeProject');
            if (savedProject) {
                const parsedProject = JSON.parse(savedProject);
                console.log('[App] Restoring active project:', parsedProject);
                setActiveProject(parsedProject);
                hasActiveProject = true;
            }
        } catch (e) {
            console.error('Failed to restore active project:', e);
        }

        // Only restore preview mode if there's an active project
        const savedShowPreview = localStorage.getItem('showPreview');
        if (savedShowPreview === 'true' && hasActiveProject) {
            setShowPreview(true);
        } else {
            // Default to landing page for first-time visitors or when no project
            setShowPreview(false);
        }

        const savedPanelOpen = localStorage.getItem('isPanelOpen');
        if (savedPanelOpen !== null) {
            setIsPanelOpen(savedPanelOpen === 'true');
        }
        // Restore preview URL from localStorage
        const savedPreviewUrl = localStorage.getItem('previewUrl');
        if (savedPreviewUrl) {
            setPreviewUrl(savedPreviewUrl);
        } else if (hasActiveProject) {
            // Fallback: generate preview URL from active project siteKey
            try {
                const savedProject = localStorage.getItem('activeProject');
                if (savedProject) {
                    const parsedProject = JSON.parse(savedProject);
                    const effectiveSiteKey = parsedProject.siteKey || parsedProject.id;
                    if (effectiveSiteKey) {
                        const fallbackUrl = `https://${effectiveSiteKey}.preview.automatelb.com`;
                        console.log('[App] No saved preview URL, using fallback:', fallbackUrl);
                        setPreviewUrl(fallbackUrl);
                    }
                }
            } catch (e) {
                console.error('Failed to generate fallback preview URL:', e);
            }
        }



        // Restore active request state (for page refresh during AI thinking)
        try {
            const savedActiveRequest = localStorage.getItem('activeRequest');
            if (savedActiveRequest) {
                const parsed = JSON.parse(savedActiveRequest);
                const startedAt = new Date(parsed.startedAt).getTime();
                const now = Date.now();
                const maxAge = 5 * 60 * 1000; // 5 minutes

                if (now - startedAt < maxAge) {
                    // Request is still fresh, restore state
                    console.log('[App] Restoring active request:', parsed);
                    setCurrentRequestId(parsed.requestId);
                    setIsSending(true);
                    setIsStreaming(true);
                } else {
                    // Request is stale, clear it
                    console.log('[App] Clearing stale active request');
                    localStorage.removeItem('activeRequest');
                }
            }
        } catch (e) {
            console.error('Failed to restore active request:', e);
            localStorage.removeItem('activeRequest');
        }
    }, []);

    // Load sessions on mount
    useEffect(() => {
        if (isClient) {
            loadSessions();
        }
    }, [isClient, loadSessions]);

    // Reload sessions when active project changes
    useEffect(() => {
        if (isClient && activeProject) {
            console.log('[App] Active project changed, reloading sessions for:', activeProject.id);
            loadSessions();
        }
    }, [isClient, activeProject?.id, loadSessions]);

    // Save preview preferences & active project to localStorage
    useEffect(() => {
        if (isClient) {
            localStorage.setItem('showPreview', String(showPreview));
            localStorage.setItem('isPanelOpen', String(isPanelOpen));

            // Save preview URL when it changes
            if (previewUrl) {
                localStorage.setItem('previewUrl', previewUrl);
            }

            // Save active project (or clear if null/undefined? No, only save truthy to persist)
            if (activeProject) {
                console.log('[App] Saving active project:', activeProject);
                localStorage.setItem('activeProject', JSON.stringify(activeProject));
            }
        }
    }, [isClient, showPreview, isPanelOpen, previewUrl, activeProject, executorMode]);

    // Load messages when session changes + persist to localStorage
    // Skip loading when actively sending to preserve optimistic UI
    useEffect(() => {
        if (isClient && activeSessionId && !isSending) {
            loadMessages(activeSessionId);
            localStorage.setItem('lastActiveSessionId', activeSessionId);
        } else if (!activeSessionId && !isSending) {
            setMessages([]);
        }
    }, [isClient, activeSessionId, isSending]);

    const loadMessages = async (sessionId: string) => {
        setIsLoadingMessages(true);
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setMessages((data || []) as Message[]);

            // Restore request contexts from message metadata
            const contexts = new Map<string, RequestContext>();
            (data || []).forEach((msg: Message) => {
                if (msg.role === 'assistant' && msg.metadata?.requestId) {
                    contexts.set(msg.id, {
                        requestId: msg.metadata.requestId as string,
                        status: (msg.metadata.status as 'preview_ready' | 'applied' | 'rolled_back') || 'preview_ready',
                        previewUrl: msg.metadata.previewUrl as string || '',
                        prUrl: msg.metadata.prUrl as string || '',
                        messageId: msg.id,
                    });
                }
            });
            setRequestContexts(contexts);
        } catch (err) {
            console.error('Failed to load messages:', err);
        } finally {
            setIsLoadingMessages(false);
        }
    };

    const handleNewChat = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('chat_sessions')
                .insert({
                    client_id: activeProjectId,
                    title: 'New Chat',
                    is_active: true,
                })
                .select()
                .single();

            if (error) throw error;

            const newSession = data as ChatSession;
            setSessions(prev => [newSession, ...prev]);
            setActiveSessionId(newSession.id);
            setMessages([]);
            setPreviewUrl(undefined);
            setRequestContexts(new Map());
        } catch (err) {
            console.error('Failed to create chat:', err);
        }
    }, []);

    const handleDeleteChat = useCallback(async (sessionId: string) => {
        try {
            // Soft delete - set is_active to false
            await supabase
                .from('chat_sessions')
                .update({ is_active: false })
                .eq('id', sessionId);

            // Remove from local state
            setSessions(prev => prev.filter(s => s.id !== sessionId));

            // If deleted the active session, switch to first available
            if (activeSessionId === sessionId) {
                const remaining = sessions.filter(s => s.id !== sessionId);
                if (remaining.length > 0) {
                    setActiveSessionId(remaining[0].id);
                } else {
                    setActiveSessionId(null);
                    setMessages([]);
                }
            }
        } catch (err) {
            console.error('Failed to delete chat:', err);
        }
    }, [activeSessionId, sessions]);

    const handleRenameChat = useCallback(async (sessionId: string, newTitle: string) => {
        try {
            await supabase
                .from('chat_sessions')
                .update({ title: newTitle, updated_at: new Date().toISOString() })
                .eq('id', sessionId);

            // Update local state
            setSessions(prev => prev.map(s =>
                s.id === sessionId ? { ...s, title: newTitle } : s
            ));
        } catch (err) {
            console.error('Failed to rename chat:', err);
        }
    }, []);

    // Handle stop button - abort the current request and stop n8n execution
    const handleStop = useCallback(async () => {
        // Abort the fetch request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        // Stop the n8n execution via orchestrator
        if (currentRequestIdRef.current) {
            try {
                console.log(`Stopping n8n execution for request ${currentRequestIdRef.current}...`);
                await fetch('https://preview-orchestrator.fly.dev/execution/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: currentRequestIdRef.current })
                });
                console.log('N8n execution stop request sent');
            } catch (err) {
                console.error('Failed to stop n8n execution:', err);
            }
            currentRequestIdRef.current = null;
        }

        // Add "Stopped by user" message
        if (activeSessionId) {
            try {
                const { data: stopMsg } = await supabase
                    .from('messages')
                    .insert({
                        session_id: activeSessionId,
                        role: 'assistant',
                        content: '🛑 **Message stopped by user**',
                    })
                    .select()
                    .single();

                if (stopMsg) addMessage(stopMsg as Message);
            } catch (err) {
                console.error('Failed to add stop message:', err);
            }
        }

        // Reset all UI state
        setIsSending(false);
        setIsStreaming(false);
        setCurrentRequestId(null); // Clear thinking steps subscription
        setAgentThinking([]);
        localStorage.removeItem('activeRequest'); // Clear saved request state

        console.log('Request stopped by user');
    }, [activeSessionId, addMessage]);

    const handleSendMessage = useCallback(async (content: string, image?: File, projectOverride?: Project) => {
        if (!content.trim() && !image) return;

        // Auto-stop previous request if running
        if (abortControllerRef.current) {
            console.log('[App] Aborting previous request for new message...');
            abortControllerRef.current.abort();
            // Fire-and-forget stop signal to backend
            if (currentRequestIdRef.current) {
                fetch('https://preview-orchestrator.fly.dev/execution/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: currentRequestIdRef.current })
                }).catch(e => console.error('Failed to ignore-stop:', e));
            }
        }

        // Use override if provided (during project creation), otherwise use current state
        const targetProject = projectOverride || activeProject;
        const targetSiteId = targetProject?.siteKey || DEFAULT_CLIENT_ID;

        // Set isSending FIRST to prevent useEffect from clearing messages
        setIsSending(true);
        setIsStreaming(true);

        // Optimistic UI: Add message immediate (fix for image latency)
        const optimisticId = 'temp-' + Date.now();
        const optimisticMsg: any = {
            id: optimisticId,
            session_id: activeSessionId || 'temp-session',
            role: 'user',
            content: content.trim() || 'Sent an image',
            created_at: new Date().toISOString(),
            metadata: image ? { image: URL.createObjectURL(image) } : undefined
        };
        addMessage(optimisticMsg);

        // Convert image to base64 if provided
        let imageData: string | undefined;
        if (image) {
            imageData = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(image);
            });
        }

        // Create session if none exists
        let sessionId = activeSessionId;

        // If switching projects (override provided), force new session creation
        if (projectOverride) {
            sessionId = null;
        }

        if (!sessionId) {
            try {
                const { data, error } = await supabase
                    .from('chat_sessions')
                    .insert({
                        client_id: targetProject?.id, // Use UUID (Project ID), not Site Key
                        title: (content || 'Image message').slice(0, 40) + (content.length > 40 ? '...' : ''),
                        is_active: true,
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('[DEBUG] Session insert error:', error);
                    throw error;
                }

                const newSession = data as ChatSession;
                setSessions(prev => [newSession, ...prev]);
                // setActiveSessionId(newSession.id); // Defer to avoid flicker
                sessionId = newSession.id;
            } catch (err) {
                console.error('Failed to create session:', err);
                return;
            }
        }

        // Generate requestId for this request
        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        setCurrentRequestId(requestId);
        currentRequestIdRef.current = requestId;

        // Save active request to localStorage (survives page refresh)
        localStorage.setItem('activeRequest', JSON.stringify({
            requestId,
            sessionId,
            startedAt: new Date().toISOString(),
        }));

        // Clear previous thinking steps
        setAgentThinking([]);

        // Create new abort controller for this request
        abortControllerRef.current = new AbortController();

        try {
            // Save user message with image metadata if present
            const { data: userMsg, error: userError } = await supabase
                .from('messages')
                .insert({
                    session_id: sessionId,
                    role: 'user',
                    content: content.trim() || 'Sent an image',
                    metadata: imageData ? { image: imageData } : undefined,
                    executor_mode: executorMode, // Save the user-selected mode
                })
                .select()
                .single();

            if (userError) throw userError;
            // addMessage(userMsg as Message); // Optimistically added already

            // Update active session (deferred)
            if (!activeSessionId && sessionId) {
                setActiveSessionId(sessionId);
            }

            // Update session title if first message
            if (messages.length === 0) {
                const title = content.slice(0, 40) + (content.length > 40 ? '...' : '');
                await supabase
                    .from('chat_sessions')
                    .update({ title, updated_at: new Date().toISOString() })
                    .eq('id', sessionId);
                setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
            }

            // Call /api/chat endpoint (which routes to n8n)
            try {
                // DEBUG: Log the executorMode value
                console.log('🎯 Sending executorMode:', executorMode, 'Type:', typeof executorMode);

                // Fetch real user ID for the request
                const { data: { user } } = await supabase.auth.getUser();
                const targetSiteId = targetProject?.siteKey || DEFAULT_CLIENT_ID;

                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        siteId: targetSiteId,
                        conversationId: sessionId,
                        userId: user?.id || targetSiteId, // Real User ID
                        message: content.trim(),
                        image: imageData, // Pass image for AI vision analysis
                        requestId, // Pass requestId for live thinking
                        executorMode, // Pass executor mode (auto, fast, thinking)
                    }),
                    signal: abortControllerRef.current.signal,
                });

                const result = await response.json();
                console.log('N8N Response:', result);

                // Store real thinking from n8n (if provided)
                if (result.thinking?.length > 0) {
                    setAgentThinking(result.thinking);
                }

                // Clear thinking steps after completion
                setTimeout(() => {
                    setCurrentRequestId(null); // Stop live subscription
                    setAgentThinking([]);
                    setIsStreaming(false);
                    localStorage.removeItem('activeRequest'); // Clear saved request state
                }, 3000);

                // Format and save AI response
                const aiContent = result.summary || 'Changes processed.';

                const { data: aiMsg, error: aiError } = await supabase
                    .from('messages')
                    .insert({
                        session_id: sessionId,
                        role: 'assistant',
                        content: aiContent,
                        metadata: {
                            requestId: result.requestId,
                            status: result.status || 'pending',
                            previewUrl: result.previewUrl,
                            diff: result.diff,
                            filesChanged: result.filesChanged,
                            warnings: result.warnings,
                        },
                        executor_mode: executorMode, // Save the mode used for this response
                    })
                    .select()
                    .single();

                if (aiError) throw aiError;
                addMessage(aiMsg as Message);

                // Store context
                setRequestContexts(prev => new Map(prev).set(aiMsg.id, {
                    requestId: result.requestId,
                    status: result.status || 'preview_ready',
                    previewUrl: result.previewUrl || '',
                    prUrl: '',
                    messageId: aiMsg.id,
                }));

                // Update preview - HMR will handle the refresh automatically
                if (result.previewUrl) {
                    // Extract base URL without query params
                    const baseUrl = result.previewUrl.split('?')[0].split('#')[0];
                    console.log('Setting preview URL:', baseUrl);
                    setPreviewUrl(baseUrl);

                    // Always trigger preview start/refresh after AI responds
                    console.log('[Preview] AI response received - ensuring preview is running...');
                    startPreview();

                    console.log('Changes pushed to preview server - HMR will update automatically');
                } else {
                    console.warn('No preview URL in result:', result);
                    // Still try to start preview using the active project
                    if (activeProject) {
                        console.log('[Preview] No previewUrl in result, starting with active project...');
                        startPreview();
                    }
                }
            } catch (apiError) {
                // Ignore abort errors
                if (apiError instanceof Error && apiError.name === 'AbortError') {
                    console.log('Request flow aborted');
                    // Do not show error message for cancellations
                    setIsSending(false);
                    return;
                }

                // Stop streaming on error
                setCurrentRequestId(null);
                setIsStreaming(false);
                localStorage.removeItem('activeRequest'); // Clear saved request state

                // Save error message
                const errorContent = `❌ **Error:** ${apiError instanceof Error ? apiError.message : 'Failed to process request'}`;
                const { data: errorMsg } = await supabase
                    .from('messages')
                    .insert({
                        session_id: sessionId,
                        role: 'assistant',
                        content: errorContent,
                    })
                    .select()
                    .single();

                if (errorMsg) {
                    setMessages(prev => [...prev, errorMsg as Message]);
                }
            }
        } catch (err) {
            console.error('Failed to send message:', err);
            // Cleanup thinking on error
            setCurrentRequestId(null);
            setIsStreaming(false);
            localStorage.removeItem('activeRequest'); // Clear saved request state
        } finally {
            setIsSending(false);
        }
    }, [activeSessionId, messages.length]);

    const handleRevert = useCallback(async (messageId: string) => {
        const context = requestContexts.get(messageId);
        if (!context) {
            console.log('No context found for message:', messageId);
            return;
        }

        try {
            const response = await rollbackChanges({
                siteId: activeProjectId,
                requestId: context.requestId,
                userId: activeProjectId,
            });

            // Update context
            setRequestContexts(prev => {
                const updated = new Map(prev);
                updated.set(messageId, { ...context, status: 'rolled_back' });
                return updated;
            });

            // Save confirmation message
            if (activeSessionId) {
                const { data: revertMsg } = await supabase
                    .from('messages')
                    .insert({
                        session_id: activeSessionId,
                        role: 'assistant',
                        content: `✅ **Changes reverted successfully!**\n\nRevert commit: \`${response.revertCommitSha?.substring(0, 7) || 'N/A'}\``,
                    })
                    .select()
                    .single();

                if (revertMsg) addMessage(revertMsg as Message);
            }
        } catch (err) {
            console.error('Failed to revert:', err);

            if (activeSessionId) {
                const { data: errorMsg } = await supabase
                    .from('messages')
                    .insert({
                        session_id: activeSessionId,
                        role: 'assistant',
                        content: `❌ **Revert failed:** ${err instanceof Error ? err.message : 'Unknown error'}`,
                    })
                    .select()
                    .single();

                if (errorMsg) addMessage(errorMsg as Message);
            }
        }
    }, [requestContexts, activeSessionId, addMessage]);

    const handleDeploy = useCallback(async () => {
        const pendingContext = Array.from(requestContexts.values())
            .filter(ctx => ctx.status === 'preview_ready')
            .pop();

        if (!pendingContext) {
            console.log('No pending changes to deploy');
            return;
        }

        setIsDeploying(true);
        try {
            const response = await applyChanges({
                siteId: activeProjectId,
                requestId: pendingContext.requestId,
                userId: activeProjectId,
            });

            // Update context
            setRequestContexts(prev => {
                const updated = new Map(prev);
                updated.set(pendingContext.messageId, { ...pendingContext, status: 'applied' });
                return updated;
            });

            // Save confirmation
            if (activeSessionId) {
                const { data: deployMsg } = await supabase
                    .from('messages')
                    .insert({
                        session_id: activeSessionId,
                        role: 'assistant',
                        content: `🚀 **Deployed successfully!**\n\nCommit: \`${response.commitSha?.substring(0, 7) || 'N/A'}\``,
                    })
                    .select()
                    .single();

                if (deployMsg) addMessage(deployMsg as Message);
            }
        } catch (err) {
            console.error('Failed to deploy:', err);
        } finally {
            setIsDeploying(false);
        }
    }, [requestContexts, activeSessionId, addMessage]);

    // Create a new project from a message
    const createNewProject = useCallback(async (initialMessage: string) => {
        // Don't manage isSending here - handleSendMessage will manage it
        try {
            // Get session to retrieve provider token
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            const providerToken = session?.provider_token;

            // Sync GitHub token if available
            if (user && providerToken) {
                await supabase.from('github_tokens' as any).upsert({
                    user_id: user.id,
                    access_token: providerToken
                });
            }

            const response = await fetch('/api/projects/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initialMessage,
                    userId: user?.id
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('[Project] Creation failed:', errorData);

                // Show error message to user
                alert(`Failed to create project: ${errorData.error || 'Unknown error'}. Please try again.`);
                return;
            }

            const data = await response.json();
            console.log('[Project] Created:', data.project);

            // Set as active project and switch to preview view
            setActiveProject(data.project);
            // Set preview URL immediately from project siteKey - ensures preview shows while orchestrator starts
            const effectiveSiteKey = data.project.siteKey || data.project.id;
            if (effectiveSiteKey) {
                setPreviewUrl(`https://${effectiveSiteKey}.preview.automatelb.com`);
                console.log('[Project] Set immediate preview URL:', effectiveSiteKey);
            }
            setShowPreview(true); // Switch from LandingPage to Editor view
            setActiveSessionId(null); // Clear active session to force new chat for new project
            setMessages([]); // Clear messages for fresh start
            setSessions([]); // Clear sessions list for new project
            setRequestContexts(new Map()); // Clear request contexts

            // Send the initial message to the AI IMMEDIATELY to show it in UI
            // handleSendMessage will manage isSending state
            // We don't await this because we want to start preview in parallel/after
            handleSendMessage(initialMessage, undefined, data.project);

            // Show preview panel but DON'T set URL yet - wait for AI response
            // This prevents showing 502 errors before the AI creates content
            setShowPreview(true);
            console.log('[Project] Preview panel visible, waiting for AI to respond before loading preview...');
        } catch (error) {
            console.error('[Project] Creation error:', error);

            // Show error to user
            const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
            alert(`Error creating project: ${errorMessage}. Please try again.`);
        }
    }, [startPreview, handleSendMessage]);

    // Import an existing GitHub repo
    const importGitHubRepo = useCallback(async (repoUrl: string) => {
        setIsSending(true);
        try {
            // Get session to retrieve provider token
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            const providerToken = session?.provider_token;

            // Sync GitHub token if available
            if (user && providerToken) {
                await supabase.from('github_tokens' as any).upsert({
                    user_id: user.id,
                    access_token: providerToken
                });
            }

            const response = await fetch('/api/projects/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repoUrl,
                    userId: user?.id
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('[Project] Import failed:', errorData);
                throw new Error(errorData.error || 'Import failed');
            }

            const data = await response.json();
            console.log('[Project] Imported:', data.project);

            // Set as active project
            setActiveProject(data.project);
            setActiveSessionId(null);
            setMessages([]);

            // Start preview for the imported project immediately
            await startPreview(data.project);
        } catch (error) {
            console.error('[Project] Import error:', error);
            throw error;
        } finally {
            setIsSending(false);
        }
    }, [startPreview]);

    const hasPendingChanges = Array.from(requestContexts.values()).some(
        ctx => ctx.status === 'preview_ready'
    );

    if (!isClient) {
        return (
            <LoadingScreen />
        );
    }

    return (
        <div className="h-screen overflow-hidden relative">
            {/* Global SVG Background */}
            <svg
                className="absolute inset-0 w-full h-full z-0"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 1920 1080"
                preserveAspectRatio="xMidYMid slice"
            >
                <defs>
                    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="80" />
                    </filter>

                    <radialGradient id="blob1" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#6366f1;#8b5cf6;#ec4899;#6366f1" dur="8s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0">
                            <animate attributeName="stop-color" values="#6366f1;#8b5cf6;#ec4899;#6366f1" dur="8s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>

                    <radialGradient id="blob2" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#8b5cf6;#ec4899;#f59e0b;#8b5cf6" dur="10s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0">
                            <animate attributeName="stop-color" values="#8b5cf6;#ec4899;#f59e0b;#8b5cf6" dur="10s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>

                    <radialGradient id="blob3" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#ec4899" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#ec4899;#f59e0b;#10b981;#ec4899" dur="12s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#ec4899" stopOpacity="0">
                            <animate attributeName="stop-color" values="#ec4899;#f59e0b;#10b981;#ec4899" dur="12s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>

                    <radialGradient id="blob4" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#f59e0b;#10b981;#06b6d4;#f59e0b" dur="9s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0">
                            <animate attributeName="stop-color" values="#f59e0b;#10b981;#06b6d4;#f59e0b" dur="9s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>

                    <radialGradient id="blob5" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.9">
                            <animate attributeName="stop-color" values="#10b981;#06b6d4;#6366f1;#10b981" dur="11s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0">
                            <animate attributeName="stop-color" values="#10b981;#06b6d4;#6366f1;#10b981" dur="11s" repeatCount="indefinite" />
                        </stop>
                    </radialGradient>
                </defs>

                <rect width="100%" height="100%" fill="#ffffff" />

                <g filter="url(#blur)">
                    <ellipse cx="20%" cy="35%" rx="450" ry="380" fill="url(#blob1)">
                        <animate attributeName="cx" values="20%;35%;15%;20%" dur="15s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="35%;50%;30%;35%" dur="12s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="450;480;450" dur="10s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="380;410;380" dur="11s" repeatCount="indefinite" />
                    </ellipse>

                    <ellipse cx="75%" cy="45%" rx="420" ry="350" fill="url(#blob2)">
                        <animate attributeName="cx" values="75%;65%;80%;75%" dur="18s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="45%;60%;40%;45%" dur="14s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="420;450;420" dur="12s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="350;380;350" dur="13s" repeatCount="indefinite" />
                    </ellipse>

                    <ellipse cx="50%" cy="65%" rx="480" ry="400" fill="url(#blob3)">
                        <animate attributeName="cx" values="50%;55%;45%;50%" dur="16s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="65%;55%;70%;65%" dur="11s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="480;510;480" dur="14s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="400;430;400" dur="15s" repeatCount="indefinite" />
                    </ellipse>

                    <ellipse cx="30%" cy="70%" rx="400" ry="330" fill="url(#blob4)">
                        <animate attributeName="cx" values="30%;40%;25%;30%" dur="17s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="70%;60%;75%;70%" dur="13s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="400;430;400" dur="11s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="330;360;330" dur="12s" repeatCount="indefinite" />
                    </ellipse>

                    <ellipse cx="80%" cy="25%" rx="380" ry="320" fill="url(#blob5)">
                        <animate attributeName="cx" values="80%;70%;85%;80%" dur="14s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="25%;35%;20%;25%" dur="16s" repeatCount="indefinite" />
                        <animate attributeName="rx" values="380;410;380" dur="13s" repeatCount="indefinite" />
                        <animate attributeName="ry" values="320;350;320" dur="14s" repeatCount="indefinite" />
                    </ellipse>
                </g>
            </svg>

            {showPreview ? (
                <div className="flex h-full relative z-10 p-4 gap-4">
                    {/* Side Panel - Floating Liquid Glass */}
                    <div className={cn(
                        'flex flex-col backdrop-blur-xl bg-white/30 border border-white/20 transition-all duration-300 ease-in-out rounded-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]',
                        isPanelOpen ? 'w-[360px] opacity-100' : 'w-0 opacity-0 overflow-hidden p-0 border-0'
                    )}>
                        {/* Header */}
                        <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between border-b border-white/10">
                            {showSettings ? (
                                <span className="text-sm font-medium text-gray-900/80">Settings</span>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Image
                                        src="/automatelogo.png"
                                        alt="AutoMate"
                                        width={24}
                                        height={24}
                                        className="object-contain opacity-90"
                                    />
                                    <span className="text-sm font-bold text-gray-900/90 tracking-tight" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                                        AutoMate
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className={cn(
                                        'p-2 rounded-xl transition-all duration-200',
                                        showSettings
                                            ? 'bg-blue-500/90 text-white shadow-md'
                                            : 'text-gray-600 hover:text-gray-900 hover:bg-white/40'
                                    )}
                                    title={showSettings ? 'Back to Chat' : 'Settings'}
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Conditional Content */}
                        {showSettings ? (
                            /* Settings View */
                            <div className="flex-1 overflow-y-auto">
                                <DeploymentSettings />
                            </div>
                        ) : (
                            /* Chat View */
                            <>
                                {/* Chat Selector */}
                                <div className="flex-shrink-0 px-3 py-2">
                                    <ChatSelector
                                        sessions={sessions as any}
                                        activeSessionId={activeSessionId}
                                        onSelectSession={setActiveSessionId}
                                        onNewChat={handleNewChat}
                                        onDeleteChat={handleDeleteChat}
                                        onRenameChat={handleRenameChat}
                                    />
                                </div>
                                {/* Chat */}
                                <div className="flex-1 overflow-hidden">
                                    <ChatPanel
                                        messages={messages as any}
                                        onSendMessage={handleSendMessage}
                                        onRevert={handleRevert}
                                        onStop={handleStop}
                                        isLoading={isSending}
                                        isLoadingMessages={isLoadingMessages}
                                        isStreaming={isStreaming}
                                        thinkingSteps={liveThinkingSteps}
                                        agentThinking={agentThinking}
                                        executorMode={executorMode}
                                        onModeChange={setExecutorMode}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Preview - No borders, transparent */}
                    <div className="flex-1 border-0 mr-4">
                        <PreviewPanel
                            previewUrl={previewUrl}
                            onExitPreview={handleExitPreview}
                            onDeploy={handleDeploy}
                            onFixError={(errorMessage) => handleSendMessage(errorMessage)}
                            hasChanges={hasPendingChanges}
                            isDeploying={isDeploying}
                            availablePages={availablePages}
                            isLoading={isPreviewLoading}
                            refreshKey={previewRefreshKey}
                            repoUrl={activeProject?.repoUrl}
                        />
                    </div>
                </div>
            ) : (
                <LandingPage
                    onSendMessage={async (content: string) => {
                        // Start preview first
                        await startPreview();
                        // Then send the message
                        handleSendMessage(content);
                    }}
                    onCreateProject={createNewProject}
                    onImportRepo={importGitHubRepo}
                    onOpenPreview={(project?: Project) => {
                        // When opening a recent project, set it as active and switch to Editor view
                        if (project) {
                            setActiveProject(project);
                            // Set preview URL immediately from project's siteKey
                            const effectiveSiteKey = project.siteKey || project.id;
                            if (effectiveSiteKey) {
                                setPreviewUrl(`https://${effectiveSiteKey}.preview.automatelb.com`);
                            }
                        }
                        setShowPreview(true);
                        // Start the preview server in the background
                        startPreview(project);
                    }}
                    isLoading={isPreviewLoading || isSending}
                    executorMode={executorMode}
                    onModeChange={setExecutorMode}
                />
            )}
        </div>
    );
}

function formatAIResponse(response: { summary: string; diff: string; prUrl: string; warnings: string[] }): string {
    const parts: string[] = [];

    // Show summary (bold effect handled by CSS)
    if (response.summary) {
        parts.push(response.summary);
    } else {
        parts.push('Changes ready');
    }

    // Show warnings
    if (response.warnings && response.warnings.length > 0) {
        parts.push(`⚠️ ${response.warnings.join(' • ')}`);
    }

    // Show PR link if available
    if (response.prUrl) {
        parts.push(`📝 View PR: ${response.prUrl}`);
    }

    return parts.join('\n\n');
}
