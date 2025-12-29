'use client';

import React, { useRef, useEffect, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ThinkingSteps } from './ThinkingSteps';
import { Bot, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/supabase/types';
import Image from 'next/image';

interface ThinkingStep {
    text: string;
    status: 'pending' | 'complete' | 'error';
    toolName?: string;
    details?: string;
}

interface ChatPanelProps {
    messages: Message[];
    onSendMessage: (message: string, image?: File) => void;
    onRevert?: (messageId: string) => void;
    onStop?: () => void;
    onAccept?: () => void;
    hasChanges?: boolean;
    isAccepting?: boolean;
    isLoading?: boolean;
    isLoadingMessages?: boolean;
    isStreaming?: boolean;
    thinkingSteps?: ThinkingStep[];
    agentThinking?: string[];
    sessionTitle?: string;
}

export function ChatPanel({
    messages,
    onSendMessage,
    onRevert,
    onStop,
    onAccept,
    hasChanges = false,
    isAccepting = false,
    isLoading = false,
    isLoadingMessages = false,
    isStreaming = false,
    thinkingSteps = [],
    agentThinking = [],
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
    }, [displayedMessages, thinkingSteps]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Messages Area - with forced white scrollbar */}
            <style jsx global>{`
                .chat-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .chat-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .chat-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(255, 255, 255, 0.4);
                    border-radius: 9999px;
                }
                .chat-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(255, 255, 255, 0.6);
                }
            `}</style>
            <div className="chat-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
                {isTransitioning || isLoadingMessages ? (
                    <MessagesSkeleton />
                ) : displayedMessages.length === 0 && thinkingSteps.length === 0 ? (
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
                        {/* Show thinking steps while streaming */}
                        {thinkingSteps.length > 0 && (
                            <ThinkingSteps
                                steps={thinkingSteps}
                                isComplete={!isStreaming}
                                thinking={agentThinking}
                            />
                        )}
                        {isLoading && thinkingSteps.length === 0 && <LoadingIndicator />}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Accept Changes Button - appears when there are pending changes */}
            {hasChanges && onAccept && (
                <div className="flex-shrink-0 px-3 py-2">
                    <button
                        onClick={onAccept}
                        disabled={isAccepting}
                        className={cn(
                            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
                            'bg-gradient-to-r from-green-500 to-emerald-500 text-white',
                            'hover:from-green-600 hover:to-emerald-600',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            'shadow-md hover:shadow-lg'
                        )}
                    >
                        {isAccepting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Committing...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Accept Changes
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Input */}
            <MessageInput onSend={onSendMessage} onStop={onStop} isLoading={isLoading} />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full p-6 animate-fade-in">
            <div className="relative w-16 h-16">
                <Image
                    src="/automatelogo.png"
                    alt="AutoMate"
                    width={64}
                    height={64}
                    className="object-contain drop-shadow-lg"
                />
            </div>
            <p className="mt-3 text-sm text-gray-500">Start a conversation</p>
        </div>
    );
}

function LoadingIndicator() {
    return (
        <div className="p-3">
            <div className="flex gap-3 p-3 animate-slide-up bg-gradient-to-r from-slate-50 to-blue-50 rounded-2xl">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="flex-1">
                    <span className="text-xs font-medium text-blue-600">AutoMate Web Editor</span>
                    <div className="flex gap-1.5 mt-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Thinking...</p>
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
                    <div className="h-4 w-32 rounded-full bg-gray-200 skeleton-pulse" />
                    <div className="h-10 w-48 rounded-2xl bg-blue-100 skeleton-pulse" />
                </div>
            </div>

            {/* Skeleton message - assistant */}
            <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-gray-200 skeleton-pulse" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 rounded-full bg-gray-200 skeleton-pulse" />
                    <div className="h-20 w-full max-w-[80%] rounded-2xl bg-gray-100 skeleton-pulse" />
                </div>
            </div>

            {/* Skeleton message - user */}
            <div className="flex justify-end">
                <div className="max-w-[75%] space-y-2">
                    <div className="h-4 w-28 rounded-full bg-gray-200 skeleton-pulse" />
                    <div className="h-8 w-36 rounded-2xl bg-blue-100 skeleton-pulse" />
                </div>
            </div>
        </div>
    );
}

