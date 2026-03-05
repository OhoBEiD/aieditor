'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChatSelector } from '@/components/chat/ChatSelector';
import { ChatPanel } from '@/components/chat/ChatPanel';
import type { ExecutorMode } from '@/components/chat/MessageInput';
import { PreviewPanel } from '@/components/editor/PreviewPanel';
import { DeploymentSettings } from '@/components/settings/DeploymentSettings';
import { supabase } from '@/lib/supabase/client';

import { useThinkingSteps } from '@/hooks/useThinkingSteps';
import type { ThinkingStep } from '@/components/chat/ThinkingSteps';
import { cn } from '@/lib/utils';
import { Bot, X, Settings, MessageSquare } from 'lucide-react';
import { LandingPage } from '@/components/landing/LandingPage';
import { gsap } from 'gsap';
import Image from 'next/image';
import { useWebContainer } from '@/hooks/useWebContainer';
import { useSupabaseConnection } from '@/hooks/useSupabaseConnection';
import { getSupabaseClientTemplate, getSupabaseEnvTemplate } from '@/lib/webcontainer/supabaseTemplate';
import VantaFogBackground from '@/components/common/VantaFogBackground';
import { useAIChat } from '@/hooks/useAIChat';
import { useContextUsage } from '@/hooks/useContextUsage';

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
            {/* Animated Vanta Fog Background */}
            <VantaFogBackground />

            {/* Animated Logo */}
            <div ref={logoRef} className="relative z-10">
                <Image
                    src="/automatelogo.png"
                    alt="Automate"
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
    branch?: string;
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

    // Thinking steps state - Live updates from Supabase + SSE
    const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
    const { steps: liveThinkingSteps, isSubscribed, refresh: refreshThinkingSteps } = useThinkingSteps(currentRequestId, activeSessionId);
    const [sseThinkingSteps, setSseThinkingSteps] = useState<ThinkingStep[]>([]); // SSE thinking steps
    const [agentThinking, setAgentThinking] = useState<string[]>([]); // Real thinking from n8n
    const [isStreaming, setIsStreaming] = useState(false);

    // Per-message thinking steps map — persists steps after AI finishes
    const [messageStepsMap, setMessageStepsMap] = useState<Record<string, ThinkingStep[]>>({});

    // Merge SSE and Supabase thinking steps
    // If we have SSE steps, use them; otherwise fall back to Supabase steps
    // After completion, keep showing steps from Supabase (they persist)
    const allThinkingSteps = sseThinkingSteps.length > 0
        ? sseThinkingSteps
        : (liveThinkingSteps.length > 0 ? liveThinkingSteps : []);

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
    // Default to 'mastra' (Automate Editor) instead of Claude Code
    const [executorMode, setExecutorMode] = useState<ExecutorMode>('mastra');

    // Cached file context for context usage indicator
    const [cachedFileContext, setCachedFileContext] = useState<Record<string, string>>({});

    // External file selection (from chat panel clicking on file names in thinking steps)
    const [selectedFileFromChat, setSelectedFileFromChat] = useState<string | null>(null);

    // Abort controller for canceling requests
    const abortControllerRef = useRef<AbortController | null>(null);

    // Current request ID for stopping n8n execution
    const currentRequestIdRef = useRef<string | null>(null);

    // WebContainer for in-browser preview (replaces fly.io)
    const {
        status: wcStatus,
        previewUrl: wcPreviewUrl,
        applyFileChanges,
        initFromGitHub,
        getFileContext,
        applyFileOperations,
        runBuild,
        writeFile: wcWriteFile,
        readFile: wcReadFile,
        deleteFile: wcDeleteFile,
        installPackage,
        restartDevServer,
    } = useWebContainer({
        projectId: activeProjectId,
        onReady: (url) => {
            console.log('[WebContainer] Preview ready:', url);
            setPreviewUrl(url);
            setIsPreviewLoading(false);
        },
        onError: (err) => console.error('[WebContainer] Error:', err),
    });

    // Use WebContainer URL if available
    useEffect(() => {
        if (wcPreviewUrl && wcStatus === 'running') {
            setPreviewUrl(wcPreviewUrl);
        }
    }, [wcPreviewUrl, wcStatus]);

    // Stable ref for getFileContext to avoid infinite re-render loops
    const getFileContextRef = useRef(getFileContext);
    getFileContextRef.current = getFileContext;

    // Refresh cached file context when WebContainer is running
    useEffect(() => {
        if (wcStatus !== 'running') return;
        const refresh = async () => {
            try {
                const ctx = await getFileContextRef.current();
                setCachedFileContext(ctx);
            } catch { /* ignore */ }
        };
        refresh();
        const interval = setInterval(refresh, 30_000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wcStatus]);

    // Context usage tracking for the indicator bar
    const contextUsage = useContextUsage({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        fileContext: cachedFileContext,
    });

    // Supabase connection for user's project
    const supabaseConn = useSupabaseConnection(activeProject?.id);

    // When Supabase connection becomes active, inject client files into WebContainer
    const supabaseInjectedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!supabaseConn.isConnected || !supabaseConn.projectUrl || !supabaseConn.anonKey) return;
        if (wcStatus !== 'running') return;
        // Don't re-inject for same project URL
        if (supabaseInjectedRef.current === supabaseConn.projectUrl) return;

        const injectSupabase = async () => {
            try {
                console.log('[Supabase] Injecting client files into WebContainer...');

                // Write .env.local with user's Supabase credentials
                await wcWriteFile('.env.local', getSupabaseEnvTemplate(supabaseConn.projectUrl!, supabaseConn.anonKey!));

                // Write supabase client helper
                await wcWriteFile('src/lib/supabase.ts', getSupabaseClientTemplate());

                // Install @supabase/supabase-js
                await installPackage('@supabase/supabase-js');

                // Restart dev server to pick up new .env.local
                await restartDevServer();

                supabaseInjectedRef.current = supabaseConn.projectUrl;
                console.log('[Supabase] Client files injected successfully');
            } catch (err) {
                console.error('[Supabase] Failed to inject client files:', err);
            }
        };

        injectSupabase();
    }, [supabaseConn.isConnected, supabaseConn.projectUrl, supabaseConn.anonKey, wcStatus, wcWriteFile, installPackage, restartDevServer]);

    // AI Chat hook (Vercel AI SDK) - handles streaming for mastra mode
    const aiChat = useAIChat({
        sessionId: activeSessionId,
        siteId: activeProject?.siteKey || DEFAULT_CLIENT_ID,
        projectId: activeProjectId,
        getFileContext,
        applyFileOperations,
        onRequestIdChange: (id) => setCurrentRequestId(id),
        onBeforeFinish: async (_requestId) => {
            // Query thinking steps directly from Supabase (realtime subscription may lag)
            try {
                const { data: steps } = await supabase
                    .from('thinking_steps')
                    .select('*')
                    .eq('request_id', _requestId)
                    .order('step_number', { ascending: true });
                if (steps && steps.length > 0) {
                    const mapped: ThinkingStep[] = steps.map((s: any) => ({
                        id: s.id,
                        tool_name: s.tool_name,
                        toolName: s.tool_name,
                        status: s.status,
                        message: s.message,
                        details: s.details,
                        created_at: s.created_at,
                    }));
                    const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
                    const msgId = lastAiMsg?.id || _requestId;
                    setMessageStepsMap(prev => ({ ...prev, [msgId]: mapped }));
                }
            } catch (err) {
                console.error('[onBeforeFinish] Failed to query thinking steps:', err);
            }
        },
        onStreamingChange: (streaming) => setIsStreaming(streaming),
        onFileOpsApplied: (count) => {
            console.log(`[AI SDK] ${count} file ops applied`);
            setPreviewRefreshKey(prev => prev + 1);
        },
        supabaseContext: supabaseConn.isConnected ? {
            projectUrl: supabaseConn.projectUrl!,
            schema: supabaseConn.schema,
            hasServiceRoleKey: supabaseConn.hasServiceRoleKey,
        } : null,
    });

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

        // Get GitHub token from user session if available
        let token: string | undefined;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            token = session?.provider_token || undefined;
            if (!token && session?.user) {
                const { data: dbToken } = await supabase.from('github_tokens' as any).select('access_token').eq('user_id', session.user.id).limit(1).maybeSingle();
                if (dbToken) token = dbToken.access_token;
            }
        } catch (e) {
            console.warn('Failed to get token for preview:', e);
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

            // WebContainers mode - skip fly.io orchestrator, just set preview ready
            console.log('[Preview] Using WebContainers - skipping fly.io orchestrator');
            const response = new Response(JSON.stringify({ status: 'ready', previewUrl: null }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response?.ok) {
                throw new Error('Failed to start preview after retries');
            }

            const data = await response.json();
            if (data.status === 'ready' || data.status === 'starting') {
                // Don't set fly.io URL - WebContainer will provide its own URL
                // Just switch to Editor view and let WebContainer boot
                setShowPreview(true);
                console.log('[Preview] Ready for WebContainer - no external URL needed');

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

    // Exit preview - hide panel but keep WebContainer running for instant re-open
    const handleExitPreview = useCallback(async () => {
        setShowPreview(false);
        // Don't clear previewUrl or kill WebContainer - keep server running
        // so reopening the same project is instant
        console.log('[Preview] Preview hidden (WebContainer still running)');
    }, []);

    // No longer need to stop external preview server - WebContainers run in browser


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

    // Auto-start WebContainer preview when showPreview is true
    // If project has repoUrl, pull from GitHub; otherwise use starter template
    const wcInitializedForProjectRef = useRef<string | null>(null);
    const wcInitInProgressRef = useRef(false);

    useEffect(() => {
        // Skip if not ready or already loading
        if (!isClient || !showPreview) return;
        if (!activeProject) return;

        // Skip if initialization is in progress
        if (wcInitInProgressRef.current) {
            console.log('[Preview] Initialization already in progress, skipping');
            return;
        }

        // Skip if we've already initialized for this project AND WebContainer is running
        if (wcInitializedForProjectRef.current === activeProject.id && (previewUrl || wcStatus === 'running')) {
            console.log('[Preview] Already initialized for project:', activeProject.id);
            // Restore preview URL from WebContainer state if we lost it
            if (!previewUrl && wcPreviewUrl) {
                setPreviewUrl(wcPreviewUrl);
            }
            return;
        }

        // If WebContainer is running but for a different project, we need to reload files
        const needsProjectSwitch = wcStatus === 'running' && wcInitializedForProjectRef.current && wcInitializedForProjectRef.current !== activeProject.id;

        console.log('[Preview] Init check - status:', wcStatus, 'project:', activeProject.id, 'prev:', wcInitializedForProjectRef.current, 'needsSwitch:', needsProjectSwitch);

        wcInitInProgressRef.current = true;
        setIsPreviewLoading(true);

        (async () => {
            try {
                // If project has a GitHub repo, pull from it
                const repoUrl = activeProject.repoUrl || '';
                console.log('[Preview] Loading project into WebContainer:', repoUrl ? repoUrl : '(local starter template)');
                // Get GitHub token from localStorage (optional)
                const githubToken = localStorage.getItem('github_token') || undefined;
                await initFromGitHub(repoUrl, githubToken, activeProject.branch || 'main');
                console.log('[Preview] WebContainer project loaded successfully');
                console.log('[Preview] WebContainer started successfully');
                wcInitializedForProjectRef.current = activeProject.id;
            } catch (err: any) {
                console.error('[Preview] Failed to boot WebContainer:', err);
                // If it's a "single instance" error, the container is already running
                // This is expected when switching projects - just mark as initialized
                if (err.message?.includes('single') && err.message?.includes('instance')) {
                    console.log('[Preview] WebContainer already booted (singleton), marking as initialized');
                    wcInitializedForProjectRef.current = activeProject.id;
                    // If we have a preview URL from the previous project, keep it
                    // The files should have been loaded by initFromGitHub or mountFiles
                }
            } finally {
                setIsPreviewLoading(false);
                wcInitInProgressRef.current = false;
            }
        })();
        // Intentionally limiting dependencies to avoid infinite loops
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isClient, showPreview, activeProject?.id]);

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
        // Don't restore previewUrl from localStorage - WebContainer URLs are ephemeral
        // and won't work after page refresh (WebContainer needs to re-boot).
        // The WebContainer will provide a fresh URL via onReady callback when it boots.
        localStorage.removeItem('previewUrl');



        // Restore active request state (for page refresh during AI thinking)
        /* 
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
        */
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

            // Don't save previewUrl to localStorage - it's ephemeral (WebContainer URL)
            // and won't work after page refresh. WebContainer will provide a fresh URL on boot.

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

            // Load thinking steps for each assistant message
            const assistantMsgs = (data || []).filter(
                (m: Message) => m.role === 'assistant' && m.metadata?.requestId
            );
            if (assistantMsgs.length > 0) {
                const stepsMap: Record<string, ThinkingStep[]> = {};
                await Promise.all(
                    assistantMsgs.map(async (msg: Message) => {
                        try {
                            const { data: steps } = await supabase
                                .from('thinking_steps')
                                .select('*')
                                .eq('request_id', msg.metadata!.requestId as string)
                                .order('step_number', { ascending: true });
                            if (steps && steps.length > 0) {
                                stepsMap[msg.id] = steps.map((s: any) => ({
                                    id: s.id,
                                    tool_name: s.tool_name,
                                    toolName: s.tool_name,
                                    status: s.status,
                                    message: s.message,
                                    details: s.details,
                                    created_at: s.created_at,
                                }));
                            }
                        } catch {
                            // Skip failed step loads
                        }
                    })
                );
                if (Object.keys(stepsMap).length > 0) {
                    setMessageStepsMap(stepsMap);
                }
            }
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

    // Handle stop button - abort the current request and stop execution
    const handleStop = useCallback(async () => {
        // 1. Stop AI SDK stream (for mastra mode)
        aiChat.stopGeneration();

        // 2. Abort the fetch request (client-side, for legacy mode)
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        // 2. Set cancellation flag in Supabase (monitored by agents)
        if (activeSessionId) {
            console.log(`[Stop] Cancelling session: ${activeSessionId}`);
            try {
                await supabase
                    .from('chat_sessions')
                    .update({ is_cancelled: true })
                    .eq('id', activeSessionId);
            } catch (err) {
                console.error('[Stop] Failed to set cancellation flag:', err);
            }
        }

        // 3. Clear current request ID
        currentRequestIdRef.current = null;

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

        // Auto-boot preview in parallel with AI generation
        const targetProjectForBoot = projectOverride || activeProject;
        if (!showPreview && targetProjectForBoot) {
            console.log('[Preview] Auto-booting preview on first message');
            setShowPreview(true);
            localStorage.setItem('showPreview', 'true');
        }

        // Auto-stop previous request if running
        if (abortControllerRef.current) {
            console.log('[App] Aborting previous request for new message...');
            abortControllerRef.current.abort();
            // Fire-and-forget stop signal to backend
            if (currentRequestIdRef.current) {
                console.log('[Cleanup] Previous request:', currentRequestIdRef.current);
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

        // Reset cancellation flag and state for new request
        setIsSending(true);
        setIsStreaming(true);
        // Clear SSE thinking steps for new request (they'll be replaced by new ones)
        // But keep liveThinkingSteps from Supabase so old steps remain visible
        setSseThinkingSteps([]);
        setAgentThinking([]);
        // Don't clear currentRequestId here - it will be updated below with the new requestId
        // This keeps old steps visible from Supabase subscription

        if (sessionId) {
            await supabase
                .from('chat_sessions')
                .update({ is_cancelled: false }) // Reset to false for a new request
                .eq('id', sessionId);
        }

        // Create AbortController for this request
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            // Save user message with image metadata if present
            const { data: userMsg, error: userError } = await supabase
                .from('messages')
                .insert({
                    session_id: sessionId,
                    role: 'user',
                    content: content.trim() || 'Sent an image',
                    metadata: imageData ? { image: imageData } : undefined,
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

                // Get file context from WebContainer
                console.log('📂 Reading file context for AI...');
                const fileContents = await getFileContext();
                console.log('✅ Read ' + Object.keys(fileContents).length + ' files');

                // Call API based on mode
                let response;

                if (executorMode === 'mastra') {
                    // Use AI SDK streaming via useAIChat hook
                    // The hook handles: streaming, file_op processing, WebContainer apply,
                    // and Supabase message persistence (via onFinish callback)
                    await aiChat.sendMessage(content.trim(), image || undefined);

                    // The hook's onFinish callback persists the assistant message to Supabase
                    // and calls onStreamingChange(false) + onFileOpsApplied

                    setIsStreaming(false);
                    if (refreshThinkingSteps) {
                        refreshThinkingSteps(requestId).catch(console.error);
                    }

                    // Skip the legacy fetch path below
                    setIsSending(false);
                    return;
                } else {
                    // Call Standard Chat API (Claude Code or Hybrid Auto)
                    // Hybrid mode uses the same API but with internal intent-based routing
                    response = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            siteId: targetSiteId,
                            conversationId: sessionId,
                            userId: user?.id || targetSiteId,
                            message: content.trim(),
                            image: imageData,
                            requestId,
                            executorMode,
                            fileContents // Pass full file context
                        }),
                    });
                }

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                // --- Parse JSON response (Chat API) ---
                const result = await response.json();

                console.log('AI Response:', { summary: result.summary || result.text, ops: result.fileOperations?.length || 0, streamed: result._streamApplied || 0 });

                // Format and save AI response (handle both summary and text fields)
                const aiContent = result.summary || result.text || 'Changes processed.';

                const { data: aiMsg, error: aiError } = await supabase
                    .from('messages')
                    .insert({
                        session_id: sessionId,
                        role: 'assistant',
                        content: aiContent,
                        metadata: {
                            requestId: result.requestId || requestId,
                            status: result.status || 'pending',
                            previewUrl: result.previewUrl,
                            diff: result.diff,
                            filesChanged: result.filesChanged,
                            warnings: result.warnings,
                        },
                    })
                    .select()
                    .single();

                if (aiError) throw aiError;
                addMessage(aiMsg as Message);

                // Store context with proper type assertions
                setRequestContexts(prev => new Map(prev).set(aiMsg.id, {
                    requestId: result.requestId || requestId,
                    status: (result.status || 'preview_ready') as 'preview_ready' | 'applied' | 'rolled_back',
                    previewUrl: result.previewUrl || '',
                    prUrl: '',
                    messageId: aiMsg.id,
                }));

                // Query thinking steps directly from Supabase for this message
                try {
                    const { data: stepsData } = await supabase
                        .from('thinking_steps')
                        .select('*')
                        .eq('request_id', requestId)
                        .order('step_number', { ascending: true });
                    if (stepsData && stepsData.length > 0) {
                        const mapped: ThinkingStep[] = stepsData.map((s: any) => ({
                            id: s.id,
                            tool_name: s.tool_name,
                            toolName: s.tool_name,
                            status: s.status,
                            message: s.message,
                            details: s.details,
                            created_at: s.created_at,
                        }));
                        setMessageStepsMap(prev => ({ ...prev, [aiMsg.id]: mapped }));
                    }
                } catch (err) {
                    console.error('[SSE] Failed to query thinking steps:', err);
                }

                // Don't clear thinking steps immediately - keep them visible for review
                setIsStreaming(false);
                if (refreshThinkingSteps) {
                    refreshThinkingSteps(requestId).catch(console.error);
                }

                // Handle file operations via WebContainer (only for non-streamed responses)
                // Streamed responses already applied ops in real-time above
                if (result.fileOperations && Array.isArray(result.fileOperations) && result.fileOperations.length > 0) {
                    console.log('🔧 Applying ' + result.fileOperations.length + ' file operations...');
                    const applyResult = await applyFileOperations(result.fileOperations, {
                        clientId: activeProjectId,
                        sessionId: sessionId!,
                        messageId: aiMsg.id,
                    });

                    if (applyResult && applyResult.success && applyResult.applied > 0) {
                        console.log(`✅ Successfully applied ${applyResult.applied}/${applyResult.total} file operations`);

                        // Run build validation if requested by the AI
                        if (result.requiresBuildValidation) {
                            console.log('🔨 Running build validation...');
                            const buildStepId = 'build-validation-step';
                            setSseThinkingSteps(prev => [
                                ...prev,
                                {
                                    id: buildStepId,
                                    tool_name: 'validate_build',
                                    toolName: 'validate_build',
                                    status: 'running',
                                    message: 'Running npm run build to validate...',
                                    details: {}
                                }
                            ]);

                            const buildResult = await runBuild();

                            if (buildResult.success) {
                                console.log('✅ Build validation passed!');
                                setSseThinkingSteps(prev => prev.map(step =>
                                    step.id === buildStepId
                                        ? { ...step, status: 'complete' as const, message: 'Build succeeded! Project compiles correctly.' }
                                        : step
                                ));
                            } else {
                                console.log('❌ Build validation failed:', buildResult.errors);
                                setSseThinkingSteps(prev => prev.map(step =>
                                    step.id === buildStepId
                                        ? { ...step, status: 'error' as const, message: 'Build failed with errors', details: { content: buildResult.errors.join('\n') } }
                                        : step
                                ));
                                setSseThinkingSteps(prev => [
                                    ...prev,
                                    {
                                        id: 'build-error-step',
                                        tool_name: 'error',
                                        toolName: 'error',
                                        status: 'error' as const,
                                        message: 'Build errors need to be fixed',
                                        details: { content: buildResult.errors.slice(0, 5).join('\n') }
                                    }
                                ]);
                            }
                        }

                        // Force preview refresh after batch file changes
                        console.log('🔄 Refreshing preview to show new content...');
                        setTimeout(() => {
                            setPreviewRefreshKey(prev => prev + 1);
                            console.log('🔄 Preview refresh triggered (refreshKey incremented)');
                        }, 500);
                    } else {
                        console.warn('⚠️ File operations may have failed. Applied:', applyResult?.applied || 0);
                        setTimeout(() => {
                            setPreviewRefreshKey(prev => prev + 1);
                            console.log('🔄 Preview refresh triggered (fallback)');
                        }, 500);
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
            // Better error logging - handle Error objects and plain objects
            const errorMessage = err instanceof Error
                ? err.message
                : (typeof err === 'object' && err !== null)
                    ? JSON.stringify(err, Object.getOwnPropertyNames(err))
                    : String(err);
            console.error('Failed to send message:', errorMessage, err);
            // Cleanup thinking on error
            setCurrentRequestId(null);
            setIsStreaming(false);
            localStorage.removeItem('activeRequest'); // Clear saved request state
        } finally {
            setIsSending(false);
        }
    }, [activeSessionId, messages.length, refreshThinkingSteps]);

    const handleRevert = useCallback(async (messageId: string) => {
        if (!activeSessionId) return;

        try {
            // Find the message being reverted (user message)
            const targetMessage = messages.find(m => m.id === messageId);
            if (!targetMessage) {
                console.error('Message not found for revert:', messageId);
                return;
            }

            // Get all code_versions for this session created at or after this message
            const { data: versions, error: versionsError } = await supabase
                .from('code_versions')
                .select('*')
                .eq('session_id', activeSessionId)
                .gte('created_at', targetMessage.created_at)
                .eq('is_reverted', false)
                .order('created_at', { ascending: false });

            if (versionsError) {
                console.error('Failed to fetch code versions:', versionsError);
                return;
            }

            // Restore files in reverse chronological order
            if (versions && versions.length > 0) {
                for (const version of versions) {
                    try {
                        if (version.action === 'create') {
                            // File was created — delete it
                            await wcDeleteFile(version.file_path);
                        } else if (version.action === 'modify') {
                            // File was modified — restore previous content
                            if (version.previous_content !== null) {
                                await wcWriteFile(version.file_path, version.previous_content);
                            }
                        } else if (version.action === 'delete') {
                            // File was deleted — recreate with previous content
                            if (version.previous_content !== null) {
                                await wcWriteFile(version.file_path, version.previous_content);
                            }
                        }
                    } catch (fileErr) {
                        console.error(`Failed to revert file ${version.file_path}:`, fileErr);
                    }
                }

                // Mark all versions as reverted
                const versionIds = versions.map(v => v.id);
                await supabase
                    .from('code_versions')
                    .update({ is_reverted: true, is_applied: false })
                    .in('id', versionIds);
            }

            // Remove messages from this point onward (the user message and all subsequent)
            const messageIndex = messages.findIndex(m => m.id === messageId);
            const messagesToRemove = messages.slice(messageIndex);
            const messageIdsToRemove = messagesToRemove.map(m => m.id);

            // Delete from Supabase
            if (messageIdsToRemove.length > 0) {
                await supabase
                    .from('messages')
                    .delete()
                    .in('id', messageIdsToRemove);
            }

            // Update local state
            setMessages(prev => prev.slice(0, messageIndex));

            // Clear request contexts for removed messages
            setRequestContexts(prev => {
                const updated = new Map(prev);
                messageIdsToRemove.forEach(id => updated.delete(id));
                return updated;
            });

            // Refresh preview
            setPreviewRefreshKey(prev => prev + 1);

            console.log(`Reverted ${versions?.length || 0} file changes and removed ${messageIdsToRemove.length} messages`);
        } catch (err) {
            console.error('Revert failed:', err);
        }
    }, [activeSessionId, messages, wcWriteFile, wcDeleteFile]);

    const handleDeploy = useCallback(async () => {
        setIsDeploying(true);
        try {
            // Gather all files from WebContainer
            const files = await getFileContext();
            if (!files || Object.keys(files).length === 0) {
                console.error('No files to deploy');
                return;
            }

            const response = await fetch('/api/deploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    files,
                    projectName: activeProject?.name || 'automate-deploy',
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Deployment failed');
            }

            console.log('Deployed to Vercel:', data.url);

            // Mark pending contexts as applied
            const pendingContext = Array.from(requestContexts.values())
                .filter(ctx => ctx.status === 'preview_ready')
                .pop();

            if (pendingContext) {
                setRequestContexts(prev => {
                    const updated = new Map(prev);
                    updated.set(pendingContext.messageId, { ...pendingContext, status: 'applied' });
                    return updated;
                });
            }

            // Open the deployed URL
            if (data.url) {
                window.open(data.url, '_blank');
            }
        } catch (err) {
            console.error('Deploy failed:', err);
            alert(`Deploy failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsDeploying(false);
        }
    }, [getFileContext, activeProject, requestContexts]);

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
            setPreviewUrl(undefined); // Clear previous preview URL to trigger WebContainer boot
            // Don't set fly.io URL - WebContainer will boot and provide its own URL
            console.log('[Project] Created, WebContainer will boot for preview');
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
            {/* Global Vanta Fog Background */}
            <VantaFogBackground />

            {showPreview ? (
                <div className="flex h-full relative z-10 p-4 gap-4">
                    {/* Side Panel - Warm Light Glass */}
                    <div
                        className={cn(
                            'flex flex-col backdrop-blur-xl border border-[#b69161]/20 transition-all duration-300 ease-in-out rounded-3xl',
                            isPanelOpen ? 'w-[360px] opacity-100' : 'w-0 opacity-0 overflow-hidden p-0 border-0'
                        )}
                        style={{
                            background: 'linear-gradient(180deg, rgba(242, 239, 237, 0.92) 0%, rgba(236, 232, 228, 0.95) 50%, rgba(242, 239, 237, 0.93) 100%)',
                            boxShadow: '0 20px 60px rgba(44, 36, 24, 0.12), 0 8px 32px rgba(44, 36, 24, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                        }}
                    >
                        {/* Header */}
                        <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between border-b border-[#b69161]/10">
                            {showSettings ? (
                                <span className="text-sm font-medium text-[#84745b]">Settings</span>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Image
                                        src="/automatelogo.png"
                                        alt="Automate"
                                        width={24}
                                        height={24}
                                        className="object-contain"
                                    />
                                    <span className="text-sm font-bold text-[#84745b] tracking-tight" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                                        Automate
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className={cn(
                                        'p-2 rounded-xl transition-all duration-200',
                                        showSettings
                                            ? 'bg-[#b69161] text-white shadow-md'
                                            : 'text-[#84745b]/60 hover:text-[#84745b] hover:bg-[#b69161]/10'
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
                                        onFileClick={setSelectedFileFromChat}
                                        isLoading={isSending}
                                        isLoadingMessages={isLoadingMessages}
                                        isStreaming={isStreaming}
                                        thinkingSteps={allThinkingSteps}
                                        agentThinking={agentThinking}
                                        executorMode={executorMode}
                                        onModeChange={setExecutorMode}
                                        contextUsage={contextUsage}
                                        messageStepsMap={messageStepsMap}
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
                            isLoading={isPreviewLoading || wcStatus === 'booting' || wcStatus === 'mounting' || wcStatus === 'installing' || wcStatus === 'starting'}
                            refreshKey={previewRefreshKey}
                            repoUrl={activeProject?.repoUrl}
                            projectId={activeProject?.id}
                            externalSelectedFile={selectedFileFromChat}
                            wcStatus={wcStatus}
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
                        if (project) {
                            const isSameProject = project.id === activeProject?.id;
                            const isWcRunning = wcStatus === 'running' && wcPreviewUrl;

                            // If same project and WebContainer is still running, reopen instantly
                            if (isSameProject && isWcRunning) {
                                console.log('[Project] Same project still running, reopening instantly');
                                setShowPreview(true);
                                if (!previewUrl) setPreviewUrl(wcPreviewUrl);
                                return;
                            }

                            // Different project - need to switch
                            setActiveProject(project);
                            setPreviewUrl(undefined);
                            console.log('[Project] Opening project, WebContainer will boot for preview');
                        }
                        setShowPreview(true);
                        startPreview(project);
                    }}
                    isLoading={isPreviewLoading || isSending}
                    executorMode={executorMode}
                    onModeChange={setExecutorMode}
                />
            )}
        </div>
    );
};

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
