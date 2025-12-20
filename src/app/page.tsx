'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { ChatSelector } from '@/components/chat/ChatSelector';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PreviewPanel } from '@/components/editor/PreviewPanel';
import { supabase } from '@/lib/supabase/client';
import { sendEditRequest, applyChanges, rollbackChanges } from '@/lib/n8n/client';
import { cn } from '@/lib/utils';
import { Bot, X } from 'lucide-react';
import type { Message, ChatSession } from '@/lib/supabase/types';

// Configuration
const DEMO_SITE_ID = 'demo-site-123';
const DEMO_USER_ID = 'demo-user-123';

// Request tracking for apply/rollback
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

    // n8n workflow state
    const [previewUrl, setPreviewUrl] = useState<string | undefined>();
    const [requestContexts, setRequestContexts] = useState<Map<string, RequestContext>>(new Map());
    const [isDeploying, setIsDeploying] = useState(false);

    // Fix hydration - only render dynamic content on client
    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (isClient) {
            fetchSessions();
        }
    }, [isClient]);

    useEffect(() => {
        if (isClient && activeSessionId) {
            fetchMessages(activeSessionId);
        } else {
            setMessages([]);
        }
    }, [isClient, activeSessionId]);

    const fetchSessions = async () => {
        try {
            const { data, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('client_id', DEMO_SITE_ID)
                .eq('is_active', true)
                .order('updated_at', { ascending: false });

            if (error) return;
            setSessions((data as ChatSession[]) || []);

            if (data && data.length > 0 && !activeSessionId) {
                setActiveSessionId(data[0].id);
            }
        } catch {
            // Silently handle
        }
    };

    const fetchMessages = async (sessionId: string) => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });

            if (error) return;
            setMessages((data as Message[]) || []);
        } catch {
            // Silently handle
        }
    };

    const handleNewChat = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('chat_sessions')
                .insert({ client_id: DEMO_SITE_ID, title: 'New Chat' })
                .select()
                .single();

            if (error) return;
            setSessions((prev) => [data as ChatSession, ...prev]);
            setActiveSessionId(data.id);
            setMessages([]);
            setPreviewUrl(undefined);
            setRequestContexts(new Map());
        } catch {
            // Silently handle
        }
    }, []);

    const handleSendMessage = useCallback(async (content: string) => {
        if (!activeSessionId) {
            await handleNewChat();
            return;
        }

        setIsSending(true);
        try {
            // Save user message to Supabase
            const { data: userMsg, error: userError } = await supabase
                .from('messages')
                .insert({ session_id: activeSessionId, role: 'user', content })
                .select()
                .single();

            if (userError) throw userError;
            setMessages((prev) => [...prev, userMsg as Message]);

            // Update session title on first message
            if (messages.length === 0) {
                const title = content.slice(0, 50);
                await supabase.from('chat_sessions').update({ title }).eq('id', activeSessionId);
                setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? { ...s, title } : s)));
            }

            // Send to n8n workflow
            try {
                const response = await sendEditRequest({
                    siteId: DEMO_SITE_ID,
                    conversationId: activeSessionId,
                    userId: DEMO_USER_ID,
                    message: content,
                });

                // Save AI response
                const aiContent = `${response.summary}\n\n**Preview:** [View Changes](${response.prUrl})\n\n\`\`\`diff\n${response.diff.substring(0, 1000)}${response.diff.length > 1000 ? '\n... (truncated)' : ''}\n\`\`\``;

                const { data: aiMsg } = await supabase
                    .from('messages')
                    .insert({
                        session_id: activeSessionId,
                        role: 'assistant',
                        content: aiContent,
                        metadata: { requestId: response.requestId, status: response.status }
                    })
                    .select()
                    .single();

                if (aiMsg) {
                    setMessages((prev) => [...prev, aiMsg as Message]);

                    // Store request context for apply/rollback
                    setRequestContexts((prev) => new Map(prev).set(aiMsg.id, {
                        requestId: response.requestId,
                        status: response.status,
                        previewUrl: response.previewUrl,
                        prUrl: response.prUrl,
                        messageId: aiMsg.id,
                    }));

                    // Update preview URL
                    setPreviewUrl(response.previewUrl || response.prUrl);
                }
            } catch (n8nError) {
                // Fallback: show error as AI message
                const errorContent = `Sorry, I encountered an error processing your request. Please try again.\n\n\`\`\`\n${n8nError instanceof Error ? n8nError.message : 'Unknown error'}\n\`\`\``;

                const { data: errorMsg } = await supabase
                    .from('messages')
                    .insert({ session_id: activeSessionId, role: 'assistant', content: errorContent })
                    .select()
                    .single();

                if (errorMsg) {
                    setMessages((prev) => [...prev, errorMsg as Message]);
                }
            }
        } catch (err) {
            console.error('Failed to send message:', err);
        } finally {
            setIsSending(false);
        }
    }, [activeSessionId, messages.length, handleNewChat]);

    const handleRevert = useCallback(async (messageId: string) => {
        const context = requestContexts.get(messageId);
        if (!context || context.status !== 'applied') {
            console.log('Cannot revert - request not applied or not found');
            return;
        }

        try {
            const response = await rollbackChanges({
                siteId: DEMO_SITE_ID,
                requestId: context.requestId,
                userId: DEMO_USER_ID,
            });

            // Update context
            setRequestContexts((prev) => {
                const updated = new Map(prev);
                updated.set(messageId, { ...context, status: 'rolled_back' });
                return updated;
            });

            // Add system message about revert
            const revertContent = `✅ Changes reverted successfully.\n\nRevert PR: [${response.revertPrUrl}](${response.revertPrUrl})`;
            await supabase
                .from('messages')
                .insert({ session_id: activeSessionId, role: 'assistant', content: revertContent });

            fetchMessages(activeSessionId!);
        } catch (err) {
            console.error('Failed to revert:', err);
        }
    }, [requestContexts, activeSessionId]);

    const handleDeploy = useCallback(async () => {
        // Find the most recent preview_ready request
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
                siteId: DEMO_SITE_ID,
                requestId: pendingContext.requestId,
                userId: DEMO_USER_ID,
            });

            // Update context
            setRequestContexts((prev) => {
                const updated = new Map(prev);
                updated.set(pendingContext.messageId, { ...pendingContext, status: 'applied' });
                return updated;
            });

            // Add system message about deploy
            const deployContent = `🚀 Changes deployed successfully!\n\nCommit: \`${response.commitSha.substring(0, 7)}\`\nPR: [${response.mergedPrUrl}](${response.mergedPrUrl})`;
            await supabase
                .from('messages')
                .insert({ session_id: activeSessionId, role: 'assistant', content: deployContent });

            fetchMessages(activeSessionId!);
        } catch (err) {
            console.error('Failed to deploy:', err);
        } finally {
            setIsDeploying(false);
        }
    }, [requestContexts, activeSessionId]);

    // Check if there are pending changes
    const hasPendingChanges = Array.from(requestContexts.values()).some(
        ctx => ctx.status === 'preview_ready'
    );

    // Don't render until client-side to avoid hydration mismatch
    if (!isClient) {
        return (
            <div className="h-screen bg-[var(--bg-primary)] flex items-center justify-center">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] animate-pulse" />
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden bg-[var(--bg-primary)]">
            {showPreview ? (
                <div className="flex h-full">
                    {/* Side Panel with Preview */}
                    <div
                        className={cn(
                            'flex flex-col border-r border-[var(--border-default)] bg-[var(--bg-secondary)] transition-all duration-300 ease-in-out',
                            isPanelOpen ? 'w-[340px]' : 'w-0 overflow-hidden'
                        )}
                    >
                        {/* Chat Selector */}
                        <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-default)]">
                            <ChatSelector
                                sessions={sessions}
                                activeSessionId={activeSessionId}
                                onSelectSession={setActiveSessionId}
                                onNewChat={handleNewChat}
                            />
                        </div>
                        {/* Chat */}
                        <div className="flex-1 overflow-hidden">
                            <ChatPanel
                                messages={messages}
                                onSendMessage={handleSendMessage}
                                onRevert={handleRevert}
                                isLoading={isSending}
                            />
                        </div>
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
                    <div
                        className={cn(
                            'absolute right-4 top-1/2 -translate-y-1/2 flex flex-col bg-[var(--bg-secondary)] rounded-2xl shadow-2xl border border-[var(--border-default)] overflow-hidden transition-all duration-300 ease-in-out',
                            isPanelOpen
                                ? 'w-[320px] h-[80vh] opacity-100 scale-100'
                                : 'w-0 h-0 opacity-0 scale-95'
                        )}
                    >
                        {/* Top Bar - Buttons & Close */}
                        <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-default)] flex items-center justify-between">
                            <button
                                onClick={() => setShowPreview(true)}
                                className="px-2 py-1 rounded-md text-xs font-medium text-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                Show Preview
                            </button>
                            <button
                                onClick={() => setIsPanelOpen(false)}
                                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Chat Selector */}
                        <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-default)]">
                            <ChatSelector
                                sessions={sessions}
                                activeSessionId={activeSessionId}
                                onSelectSession={setActiveSessionId}
                                onNewChat={handleNewChat}
                            />
                        </div>
                        {/* Chat */}
                        <div className="flex-1 overflow-hidden">
                            <ChatPanel
                                messages={messages}
                                onSendMessage={handleSendMessage}
                                onRevert={handleRevert}
                                isLoading={isSending}
                            />
                        </div>
                    </div>

                    {/* Agent Button - Bottom Right */}
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
