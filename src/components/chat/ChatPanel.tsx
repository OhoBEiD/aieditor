'use client';

import React, { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Bot, Sparkles } from 'lucide-react';
import type { Message } from '@/lib/supabase/types';

interface ChatPanelProps {
    messages: Message[];
    onSendMessage: (message: string, image?: File) => void;
    onRevert?: (messageId: string) => void;
    isLoading?: boolean;
    sessionTitle?: string;
}

export function ChatPanel({
    messages,
    onSendMessage,
    onRevert,
    isLoading = false,
}: ChatPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-full bg-[var(--bg-secondary)]">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="space-y-0">
                        {messages.map((message) => (
                            <MessageBubble
                                key={message.id}
                                message={message}
                                onRevert={onRevert}
                            />
                        ))}
                        {isLoading && <LoadingIndicator />}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <MessageInput onSend={onSendMessage} isLoading={isLoading} />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full p-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
            </div>
        </div>
    );
}

function LoadingIndicator() {
    return (
        <div className="flex gap-3 p-4 animate-fade-in bg-[var(--bg-tertiary)]">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1 pt-1">
                <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        </div>
    );
}
