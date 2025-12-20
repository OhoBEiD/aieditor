'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChatSelector } from '@/components/chat/ChatSelector';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PreviewPanel } from '@/components/editor/PreviewPanel';
import { sendEditRequest, applyChanges, rollbackChanges } from '@/lib/n8n/client';
import { cn } from '@/lib/utils';
import { Bot, X } from 'lucide-react';

// Configuration
const DEMO_SITE_ID = 'demo-site-123';
const DEMO_USER_ID = 'demo-user-123';

// Local message type (no Supabase dependency)
interface LocalMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
    metadata?: {
        requestId?: string;
        status?: string;
        previewUrl?: string;
    };
}

// Local session type
interface LocalSession {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

// Request tracking
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
    const [sessions, setSessions] = useState<LocalSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<LocalMessage[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [isClient, setIsClient] = useState(false);

    // n8n workflow state
    const [previewUrl, setPreviewUrl] = useState<string | undefined>();
    const [requestContexts, setRequestContexts] = useState<Map<string, RequestContext>>(new Map());
    const [isDeploying, setIsDeploying] = useState(false);

    const messageIdRef = useRef(0);

    // Fix hydration
    useEffect(() => {
        setIsClient(true);
        // Create initial session
        const initialSession: LocalSession = {
            id: 'session-1',
            title: 'New Chat',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setSessions([initialSession]);
        setActiveSessionId('session-1');
    }, []);

    const generateMessageId = () => {
        messageIdRef.current += 1;
        return `msg-${Date.now()}-${messageIdRef.current}`;
    };

    const handleNewChat = useCallback(() => {
        const newSession: LocalSession = {
            id: `session-${Date.now()}`,
            title: 'New Chat',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setMessages([]);
        setPreviewUrl(undefined);
        setRequestContexts(new Map());
    }, []);

    const handleSendMessage = useCallback(async (content: string) => {
        if (!activeSessionId || !content.trim()) return;

        setIsSending(true);

        // Add user message immediately
        const userMessage: LocalMessage = {
            id: generateMessageId(),
            role: 'user',
            content: content.trim(),
            created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Update session title on first message
        if (messages.length === 0) {
            const title = content.slice(0, 40) + (content.length > 40 ? '...' : '');
            setSessions((prev) =>
                prev.map((s) => s.id === activeSessionId ? { ...s, title } : s)
            );
        }

        try {
            // Send to n8n webhook
            const response = await sendEditRequest({
                siteId: DEMO_SITE_ID,
                conversationId: activeSessionId,
                userId: DEMO_USER_ID,
                message: content.trim(),
            });

            // Create AI response message
            const aiContent = formatAIResponse(response);
            const aiMessage: LocalMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: aiContent,
                created_at: new Date().toISOString(),
                metadata: {
                    requestId: response.requestId,
                    status: response.status,
                    previewUrl: response.previewUrl,
                },
            };

            setMessages((prev) => [...prev, aiMessage]);

            // Store request context for apply/rollback
            setRequestContexts((prev) => new Map(prev).set(aiMessage.id, {
                requestId: response.requestId,
                status: response.status,
                previewUrl: response.previewUrl,
                prUrl: response.prUrl,
                messageId: aiMessage.id,
            }));

            // Update preview URL
            if (response.previewUrl) {
                setPreviewUrl(response.previewUrl);
            }

        } catch (error) {
            // Show error as AI message
            const errorMessage: LocalMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: `❌ **Error:** ${error instanceof Error ? error.message : 'Failed to process request. Please try again.'}`,
                created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsSending(false);
        }
    }, [activeSessionId, messages.length]);

    const handleRevert = useCallback(async (messageId: string) => {
        const context = requestContexts.get(messageId);
        if (!context) return;

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

            // Add confirmation message
            const revertMessage: LocalMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: `✅ **Changes reverted successfully!**\n\nRevert PR: [View](${response.revertPrUrl})`,
                created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, revertMessage]);
        } catch (error) {
            const errorMessage: LocalMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: `❌ **Revert failed:** ${error instanceof Error ? error.message : 'Unknown error'}`,
                created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        }
    }, [requestContexts]);

    const handleDeploy = useCallback(async () => {
        const pendingContext = Array.from(requestContexts.values())
            .filter(ctx => ctx.status === 'preview_ready')
            .pop();

        if (!pendingContext) return;

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

            // Add success message
            const deployMessage: LocalMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: `🚀 **Deployed successfully!**\n\nCommit: \`${response.commitSha.substring(0, 7)}\`\nPR: [View](${response.mergedPrUrl})`,
                created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, deployMessage]);
        } catch (error) {
            const errorMessage: LocalMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: `❌ **Deploy failed:** ${error instanceof Error ? error.message : 'Unknown error'}`,
                created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsDeploying(false);
        }
    }, [requestContexts]);

    const hasPendingChanges = Array.from(requestContexts.values()).some(
        ctx => ctx.status === 'preview_ready'
    );

    if (!isClient) {
        return (
            <div className="h-screen bg-[var(--bg-primary)] flex items-center justify-center">
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
                        {/* Chat Selector */}
                        <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-default)]">
                            <ChatSelector
                                sessions={sessions as any}
                                activeSessionId={activeSessionId}
                                onSelectSession={setActiveSessionId}
                                onNewChat={handleNewChat}
                            />
                        </div>
                        {/* Chat */}
                        <div className="flex-1 overflow-hidden">
                            <ChatPanel
                                messages={messages as any}
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
                    <div className={cn(
                        'absolute right-4 top-1/2 -translate-y-1/2 flex flex-col bg-[var(--bg-secondary)] rounded-2xl shadow-2xl border border-[var(--border-default)] overflow-hidden transition-all duration-300 ease-in-out',
                        isPanelOpen
                            ? 'w-[320px] h-[80vh] opacity-100 scale-100'
                            : 'w-0 h-0 opacity-0 scale-95'
                    )}>
                        {/* Top Bar */}
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
                                sessions={sessions as any}
                                activeSessionId={activeSessionId}
                                onSelectSession={setActiveSessionId}
                                onNewChat={handleNewChat}
                            />
                        </div>
                        {/* Chat */}
                        <div className="flex-1 overflow-hidden">
                            <ChatPanel
                                messages={messages as any}
                                onSendMessage={handleSendMessage}
                                onRevert={handleRevert}
                                isLoading={isSending}
                            />
                        </div>
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

// Helper function to format AI response
function formatAIResponse(response: { summary: string; diff: string; prUrl: string; warnings: string[] }): string {
    let content = `### ${response.summary}\n\n`;

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
