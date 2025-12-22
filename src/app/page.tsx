'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChatSelector } from '@/components/chat/ChatSelector';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PreviewPanel } from '@/components/editor/PreviewPanel';
import { DeploymentSettings } from '@/components/settings/DeploymentSettings';
import { supabase } from '@/lib/supabase/client';
import { sendEditRequest, applyChanges, rollbackChanges } from '@/lib/n8n/client';
import { cn } from '@/lib/utils';
import { Bot, X, Settings, MessageSquare } from 'lucide-react';

// Configuration - Use a valid UUID for the demo client
const DEMO_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

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

export default function Home() {
    const [showPreview, setShowPreview] = useState(true);
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [isClient, setIsClient] = useState(false);
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);

    // n8n workflow state
    const [previewUrl, setPreviewUrl] = useState<string | undefined>();
    const [requestContexts, setRequestContexts] = useState<Map<string, RequestContext>>(new Map());
    const [isDeploying, setIsDeploying] = useState(false);

    // Settings view toggle
    const [showSettings, setShowSettings] = useState(false);

    // Fix hydration + restore preferences
    useEffect(() => {
        setIsClient(true);
        // Restore preview mode from localStorage
        const savedShowPreview = localStorage.getItem('showPreview');
        if (savedShowPreview !== null) {
            setShowPreview(savedShowPreview === 'true');
        }
        const savedPanelOpen = localStorage.getItem('isPanelOpen');
        if (savedPanelOpen !== null) {
            setIsPanelOpen(savedPanelOpen === 'true');
        }
    }, []);

    // Load sessions on mount
    useEffect(() => {
        if (isClient) {
            loadSessions();
        }
    }, [isClient]);

    // Save preview preferences to localStorage
    useEffect(() => {
        if (isClient) {
            localStorage.setItem('showPreview', String(showPreview));
            localStorage.setItem('isPanelOpen', String(isPanelOpen));
        }
    }, [isClient, showPreview, isPanelOpen]);

    // Load messages when session changes + persist to localStorage
    useEffect(() => {
        if (isClient && activeSessionId) {
            loadMessages(activeSessionId);
            localStorage.setItem('lastActiveSessionId', activeSessionId);
        } else {
            setMessages([]);
        }
    }, [isClient, activeSessionId]);

    const loadSessions = async () => {
        setIsLoadingSessions(true);
        try {
            const { data, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('client_id', DEMO_CLIENT_ID)
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
    };

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
                    client_id: DEMO_CLIENT_ID,
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

    const handleSendMessage = useCallback(async (content: string, image?: File) => {
        if (!content.trim() && !image) return;

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
        if (!sessionId) {
            try {
                const { data, error } = await supabase
                    .from('chat_sessions')
                    .insert({
                        client_id: DEMO_CLIENT_ID,
                        title: (content || 'Image message').slice(0, 40) + (content.length > 40 ? '...' : ''),
                        is_active: true,
                    })
                    .select()
                    .single();

                if (error) throw error;

                const newSession = data as ChatSession;
                setSessions(prev => [newSession, ...prev]);
                setActiveSessionId(newSession.id);
                sessionId = newSession.id;
            } catch (err) {
                console.error('Failed to create session:', err);
                return;
            }
        }

        setIsSending(true);

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
            setMessages(prev => [...prev, userMsg as Message]);

            // Update session title if first message
            if (messages.length === 0) {
                const title = content.slice(0, 40) + (content.length > 40 ? '...' : '');
                await supabase
                    .from('chat_sessions')
                    .update({ title, updated_at: new Date().toISOString() })
                    .eq('id', sessionId);
                setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
            }

            // Call n8n webhook
            try {
                const response = await sendEditRequest({
                    siteId: DEMO_CLIENT_ID,
                    conversationId: sessionId,
                    userId: DEMO_CLIENT_ID,
                    message: content.trim(),
                });

                // Format AI response
                const aiContent = formatAIResponse(response);

                // Save AI message
                const { data: aiMsg, error: aiError } = await supabase
                    .from('messages')
                    .insert({
                        session_id: sessionId,
                        role: 'assistant',
                        content: aiContent,
                        metadata: {
                            requestId: response.requestId,
                            status: response.status,
                            previewUrl: response.previewUrl,
                            prUrl: response.prUrl,
                        },
                    })
                    .select()
                    .single();

                if (aiError) throw aiError;
                setMessages(prev => [...prev, aiMsg as Message]);

                // Store context
                setRequestContexts(prev => new Map(prev).set(aiMsg.id, {
                    requestId: response.requestId,
                    status: response.status,
                    previewUrl: response.previewUrl,
                    prUrl: response.prUrl,
                    messageId: aiMsg.id,
                }));

                // Update preview
                if (response.previewUrl) {
                    setPreviewUrl(response.previewUrl);
                }
            } catch (n8nError) {
                // Save error message
                const errorContent = `❌ **Error:** ${n8nError instanceof Error ? n8nError.message : 'Failed to process request'}`;
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
                siteId: DEMO_CLIENT_ID,
                requestId: context.requestId,
                userId: DEMO_CLIENT_ID,
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

                if (revertMsg) {
                    setMessages(prev => [...prev, revertMsg as Message]);
                }
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

                if (errorMsg) {
                    setMessages(prev => [...prev, errorMsg as Message]);
                }
            }
        }
    }, [requestContexts, activeSessionId]);

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
                siteId: DEMO_CLIENT_ID,
                requestId: pendingContext.requestId,
                userId: DEMO_CLIENT_ID,
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

                if (deployMsg) {
                    setMessages(prev => [...prev, deployMsg as Message]);
                }
            }
        } catch (err) {
            console.error('Failed to deploy:', err);
        } finally {
            setIsDeploying(false);
        }
    }, [requestContexts, activeSessionId]);

    const hasPendingChanges = Array.from(requestContexts.values()).some(
        ctx => ctx.status === 'preview_ready'
    );

    if (!isClient) {
        return (
            <div className="bg-green-500 h-screen bg-[var(--bg-primary)] flex items-center justify-center">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] animate-pulse" />
                    <span className="text-[var(--text-muted)] animate-pulse">Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden bg-[var(--bg-primary)]">
            {showPreview ? (
                <div className="flex h-full">
                    {/* Side Panel */}
                    <div className={cn(
                        'flex flex-col border-r border-[var(--border-default)] bg-[var(--bg-secondary)] transition-all duration-300 ease-in-out',
                        isPanelOpen ? 'w-[340px]' : 'w-0 overflow-hidden'
                    )}>
                        {/* Header */}
                        <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-default)] flex items-center justify-between">
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                                {showSettings ? 'Settings' : 'Chat'}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className={cn(
                                        'p-1.5 rounded-md transition-colors',
                                        showSettings
                                            ? 'bg-[var(--accent-primary)] text-white'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
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
                                <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-default)]">
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
                                        isLoading={isSending}
                                        isLoadingMessages={isLoadingMessages}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Preview */}
                    <div className="flex-1">
                        <PreviewPanel
                            previewUrl={previewUrl}
                            onExitPreview={() => setShowPreview(false)}
                            onDeploy={handleDeploy}
                            hasChanges={hasPendingChanges}
                            isDeploying={isDeploying}
                        />
                    </div>
                </div>
            ) : (
                <div className="h-full relative">
                    {/* Floating Side Panel */}
                    <div className={cn(
                        'absolute right-4 top-1/2 -translate-y-1/2 flex flex-col bg-[var(--bg-secondary)] rounded-3xl shadow-2xl border border-[var(--border-default)] overflow-hidden transition-all duration-300 ease-in-out',
                        isPanelOpen
                            ? 'w-[320px] h-[80vh] opacity-100 scale-100'
                            : 'w-0 h-0 opacity-0 scale-95'
                    )}>
                        {/* Top Bar */}
                        <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-default)] flex items-center justify-between">
                            <button
                                onClick={() => setShowPreview(true)}
                                className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-hover)] transition-colors"
                            >
                                Show Preview
                            </button>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className={cn(
                                        'p-1.5 rounded-md transition-colors',
                                        showSettings
                                            ? 'bg-[var(--accent-primary)] text-white'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                                    )}
                                    title={showSettings ? 'Back to Chat' : 'Settings'}
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setIsPanelOpen(false)}
                                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                                >
                                    <X className="w-4 h-4" />
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
                                <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-default)]">
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
                                        isLoading={isSending}
                                        isLoadingMessages={isLoadingMessages}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Agent Button */}
                    <button
                        onClick={() => setIsPanelOpen(!isPanelOpen)}
                        className={cn(
                            'fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ease-in-out',
                            'bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]',
                            'hover:scale-110 hover:shadow-2xl',
                            !isPanelOpen && 'animate-pulse'
                        )}
                    >
                        <Bot className="w-7 h-7 text-white" />
                    </button>
                </div>
            )}
        </div>
    );
}

function formatAIResponse(response: { summary: string; diff: string; prUrl: string; warnings: string[] }): string {
    let content = `### ${response.summary || 'Changes Ready'}\n\n`;

    if (response.prUrl) {
        content += `📝 **PR:** [View Changes](${response.prUrl})\n\n`;
    }

    if (response.diff) {
        const truncatedDiff = response.diff.length > 500
            ? response.diff.substring(0, 500) + '\n... (truncated)'
            : response.diff;
        content += `\`\`\`diff\n${truncatedDiff}\n\`\`\`\n\n`;
    }

    if (response.warnings && response.warnings.length > 0) {
        content += `⚠️ **Warnings:**\n${response.warnings.map(w => `- ${w}`).join('\n')}`;
    }

    return content;
}
