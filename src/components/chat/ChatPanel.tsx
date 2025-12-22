'use client';

import React, { useRef, useEffect, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Bot, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/supabase/types';

interface ChatPanelProps {
    messages: Message[];
    onSendMessage: (message: string, image?: File) => void;
    onRevert?: (messageId: string) => void;
    onStop?: () => void;
    isLoading?: boolean;
    isLoadingMessages?: boolean;
    sessionTitle?: string;
}

export function ChatPanel({
    messages,
    onSendMessage,
    onRevert,
    onStop,
    isLoading = false,
    isLoadingMessages = false,
}: ChatPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);

    // Handle message transitions
    useEffect(() => {
        if (isLoadingMessages) {
            setIsTransitioning(true);
            setDisplayedMessages([]);
        } else {
            // Small delay for smooth transition
            const timer = setTimeout(() => {
                setDisplayedMessages(messages);
                setIsTransitioning(false);
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [messages, isLoadingMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [displayedMessages]);

    return (
        <div className="flex flex-col h-full bg-[var(--bg-secondary)] overflow-hidden">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {isTransitioning || isLoadingMessages ? (
                    <MessagesSkeleton />
                ) : displayedMessages.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="space-y-0">
                        {displayedMessages.map((message, index) => (
                            <div
                                key={message.id}
                                className="animate-slide-up"
                                style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
                            >
                                <MessageBubble
                                    message={message}
                                    onRevert={onRevert}
                                />
                            </div>
                        ))}
                        {isLoading && <LoadingIndicator />}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <MessageInput onSend={onSendMessage} onStop={onStop} isLoading={isLoading} />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full p-6 animate-fade-in">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
            </div>
            <p className="mt-3 text-sm text-[var(--text-muted)]">Start a conversation</p>
        </div>
    );
}

function LoadingIndicator() {
    return (
        <div className="p-3">
            <div className="flex gap-3 p-3 animate-slide-up bg-gradient-to-r from-slate-50 to-blue-50 rounded-2xl">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] flex items-center justify-center">
                    <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="flex-1">
                    <span className="text-xs font-medium text-[var(--accent-primary)]">AutoMate Web Editor</span>
                    <div className="flex gap-1.5 mt-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">Thinking...</p>
                </div>
            </div>
        </div>
    );
}

function MessagesSkeleton() {
    return (
        <div className="p-4 space-y-4 animate-fade-in">
            {/* Skeleton message - user */}
            <div className="flex justify-end">
                <div className="max-w-[75%] space-y-2">
                    <div className="h-4 w-32 rounded-full bg-[var(--bg-tertiary)] skeleton-pulse" />
                    <div className="h-10 w-48 rounded-2xl bg-[var(--accent-primary)]/20 skeleton-pulse" />
                </div>
            </div>

            {/* Skeleton message - assistant */}
            <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-[var(--bg-tertiary)] skeleton-pulse" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 rounded-full bg-[var(--bg-tertiary)] skeleton-pulse" />
                    <div className="h-20 w-full max-w-[80%] rounded-2xl bg-[var(--bg-tertiary)] skeleton-pulse" />
                </div>
            </div>

            {/* Skeleton message - user */}
            <div className="flex justify-end">
                <div className="max-w-[75%] space-y-2">
                    <div className="h-4 w-28 rounded-full bg-[var(--bg-tertiary)] skeleton-pulse" />
                    <div className="h-8 w-36 rounded-2xl bg-[var(--accent-primary)]/20 skeleton-pulse" />
                </div>
            </div>
        </div>
    );
}
