'use client';

import { useRef, useEffect, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { MessageInput, type ExecutorMode } from './MessageInput';
import { ThinkingSteps, type ThinkingStep } from './ThinkingSteps';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/supabase/types';
import type { ContextUsage } from '@/hooks/useContextUsage';
import Image from 'next/image';

interface ChatPanelProps {
    messages: Message[];
    onSendMessage: (message: string, image?: File) => void;
    onRevert?: (messageId: string) => void;
    onStop?: () => void;
    onAccept?: () => void;
    onFileClick?: (filePath: string) => void;
    hasChanges?: boolean;
    isAccepting?: boolean;
    isLoading?: boolean;
    isLoadingMessages?: boolean;
    isStreaming?: boolean;
    thinkingSteps?: ThinkingStep[];
    agentThinking?: string[];
    sessionTitle?: string;
    executorMode?: ExecutorMode;
    onModeChange?: (mode: ExecutorMode) => void;
    contextUsage?: ContextUsage;
    messageStepsMap?: Record<string, ThinkingStep[]>;
}

export function ChatPanel({
    messages,
    onSendMessage,
    onRevert,
    onStop,
    onAccept,
    onFileClick,
    hasChanges = false,
    isAccepting = false,
    isLoading = false,
    isLoadingMessages = false,
    isStreaming = false,
    thinkingSteps = [],
    agentThinking = [],
    executorMode = 'mastra',
    onModeChange,
    contextUsage,
    messageStepsMap = {},
}: ChatPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
    const chatPanelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isLoadingMessages && messages.length === 0) {
            setIsTransitioning(true);
            setDisplayedMessages([]);
        } else {
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

    useEffect(() => {
        if (!chatPanelRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !isLoading && !isStreaming) {
                        setTimeout(() => {
                            const textarea = chatPanelRef.current?.querySelector('textarea');
                            if (textarea && document.activeElement !== textarea) {
                                textarea.focus();
                            }
                        }, 200);
                    }
                });
            },
            { threshold: 0.1 }
        );
        observer.observe(chatPanelRef.current);
        return () => observer.disconnect();
    }, [isLoading, isStreaming]);

    useEffect(() => {
        if (!isLoading && !isStreaming) {
            const timer = setTimeout(() => {
                const textarea = chatPanelRef.current?.querySelector('textarea');
                if (textarea) textarea.focus();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isLoading, isStreaming]);

    return (
        <div ref={chatPanelRef} className="flex flex-col h-full overflow-hidden">
            {/* Scrollbar styling for dark theme */}
            <style jsx global>{`
                .chat-scrollbar::-webkit-scrollbar {
                    width: 5px;
                }
                .chat-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .chat-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(132, 116, 91, 0.2);
                    border-radius: 9999px;
                }
                .chat-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(132, 116, 91, 0.35);
                }
            `}</style>

            {/* Messages */}
            <div className="chat-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
                {isTransitioning || isLoadingMessages ? (
                    <MessagesSkeleton />
                ) : displayedMessages.length === 0 && thinkingSteps.length === 0 && !isLoading ? (
                    <EmptyState />
                ) : (
                    <div className="space-y-0 py-2">
                        {displayedMessages.map((message, index) => (
                            <div
                                key={message.id}
                                className="animate-slide-up"
                                style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
                            >
                                {/* Show frozen thinking steps above assistant messages */}
                                {message.role === 'assistant' && messageStepsMap[message.id]?.length > 0 && (
                                    <ThinkingSteps
                                        steps={messageStepsMap[message.id]}
                                        isComplete={true}
                                        onFileClick={onFileClick}
                                    />
                                )}
                                <MessageBubble
                                    message={message}
                                    onRevert={onRevert}
                                    onSendMessage={onSendMessage}
                                />
                            </div>
                        ))}
                        {/* Live thinking steps during streaming */}
                        {thinkingSteps.length > 0 ? (
                            <ThinkingSteps
                                steps={thinkingSteps}
                                isComplete={!isStreaming}
                                thinking={agentThinking}
                                onFileClick={onFileClick}
                            />
                        ) : isLoading && <LoadingIndicator />}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Accept Changes */}
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
                            <><Loader2 className="w-4 h-4 animate-spin" /> Committing...</>
                        ) : (
                            <><Check className="w-4 h-4" /> Accept Changes</>
                        )}
                    </button>
                </div>
            )}

            {/* Input */}
            <MessageInput
                onSend={onSendMessage}
                onStop={onStop}
                isLoading={isLoading}
                executorMode={executorMode}
                onModeChange={onModeChange}
                contextUsage={contextUsage}
            />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full p-6 animate-fade-in">
            <div className="relative w-16 h-16">
                <Image
                    src="/automatelogo.png"
                    alt="Automate"
                    width={64}
                    height={64}
                    className="object-contain drop-shadow-lg opacity-60"
                />
            </div>
            <p className="mt-3 text-sm text-[#b69161]/60">Start a conversation</p>
        </div>
    );
}

function LoadingIndicator() {
    return (
        <div className="px-4 py-3">
            <div className="flex items-center gap-2">
                <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b69161] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b69161] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b69161] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-[#b69161]/60">Agent thinking...</span>
            </div>
        </div>
    );
}

function MessagesSkeleton() {
    return (
        <div className="p-4 space-y-4 animate-fade-in">
            {/* User skeleton */}
            <div className="px-4">
                <div className="h-10 w-3/4 rounded-2xl bg-[#d6cfc9]/30 skeleton-pulse opacity-30" />
            </div>
            {/* AI skeleton */}
            <div className="px-4 space-y-2">
                <div className="h-4 w-full rounded bg-[#d6cfc9]/30 skeleton-pulse opacity-30" />
                <div className="h-4 w-5/6 rounded bg-[#d6cfc9]/30 skeleton-pulse opacity-30" />
                <div className="h-4 w-2/3 rounded bg-[#d6cfc9]/30 skeleton-pulse opacity-30" />
            </div>
            {/* User skeleton */}
            <div className="px-4">
                <div className="h-10 w-1/2 rounded-2xl bg-[#d6cfc9]/30 skeleton-pulse opacity-30" />
            </div>
        </div>
    );
}
