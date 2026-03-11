'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { MessageBubble } from './MessageBubble';
import { MessageInput, type ModelOption } from './MessageInput';
import { ThinkingSteps, type ThinkingStep } from './ThinkingSteps';
import { TaskDrawer, type TaskItem } from './TaskDrawer';
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
    selectedModel?: ModelOption;
    onModelChange?: (model: ModelOption) => void;
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
    selectedModel = 'flash',
    onModelChange,
    contextUsage,
    messageStepsMap = {},
}: ChatPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
    const chatPanelRef = useRef<HTMLDivElement>(null);

    // Derive which proposal messages have been selected
    const proposalSelections = useMemo(() => {
        const selections: Record<string, number> = {};
        for (let i = 0; i < displayedMessages.length; i++) {
            const msg = displayedMessages[i];
            if (msg.role !== 'assistant') continue;

            const meta = msg.metadata as Record<string, any> | null;
            if (meta?.selectedOption) {
                selections[msg.id] = meta.selectedOption as number;
                continue;
            }

            const isProposal = msg.content.includes('PROPOSAL_OPTIONS')
                || (msg.content.includes('ARTIFACT') && msg.content.includes('"type":"proposal"'));

            if (isProposal) {
                for (let j = i + 1; j < displayedMessages.length; j++) {
                    const next = displayedMessages[j];
                    if (next.role === 'user') {
                        const match = next.content.match(/^Option\s+(\d)/i);
                        if (match) selections[msg.id] = parseInt(match[1]);
                        break;
                    }
                }
            }
        }
        return selections;
    }, [displayedMessages]);

    // Derive task list from plan artifacts + thinking step events
    const derivedTasks = useMemo((): TaskItem[] => {
        // 1. Find plan artifact in messages (scan all assistant messages for latest plan)
        let planTasks: Array<{ id: string; description: string }> = [];

        const allMessages = isStreaming ? messages : displayedMessages;
        for (let i = allMessages.length - 1; i >= 0; i--) {
            const msg = allMessages[i];
            if (msg.role !== 'assistant') continue;

            const artifactMatches = msg.content.match(/<!--ARTIFACT:([\s\S]*?)-->/g);
            if (!artifactMatches) continue;

            for (const match of artifactMatches) {
                try {
                    const jsonStr = match.replace('<!--ARTIFACT:', '').replace('-->', '');
                    const json = JSON.parse(jsonStr);
                    if (json.type === 'plan' && json.data?.tasks?.length > 0) {
                        planTasks = json.data.tasks.map((t: any) => ({
                            id: String(t.id),
                            description: t.description || `Task ${t.id}`,
                        }));
                        break;
                    }
                } catch { /* skip malformed */ }
            }
            if (planTasks.length > 0) break;
        }

        if (planTasks.length === 0) return [];

        // 2. Match with thinking step events for status
        const taskStatuses = new Map<string, 'pending' | 'running' | 'completed' | 'failed'>();
        for (const step of thinkingSteps) {
            const toolName = (step.tool_name || step.toolName || '').toLowerCase();
            const msg = step.message || step.text || '';
            const idMatch = msg.match(/Task\s+(\d+)/i);
            if (!idMatch) continue;
            const taskId = idMatch[1];

            if (toolName.includes('start')) taskStatuses.set(taskId, 'running');
            if (toolName.includes('complete')) taskStatuses.set(taskId, 'completed');
            if (toolName.includes('failed')) taskStatuses.set(taskId, 'failed');
        }

        return planTasks.map(t => ({
            id: t.id,
            description: t.description,
            status: taskStatuses.get(t.id) || 'pending',
        }));
    }, [messages, displayedMessages, thinkingSteps, isStreaming]);

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
        <div ref={chatPanelRef} className="flex flex-col h-full overflow-hidden dark-glass-strong rounded-2xl">
            {/* Scrollbar styling for dark theme */}
            <style jsx global>{`
                .chat-scrollbar::-webkit-scrollbar {
                    width: 5px;
                }
                .chat-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .chat-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(182, 145, 97, 0.25);
                    border-radius: 9999px;
                }
                .chat-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(182, 145, 97, 0.40);
                }
            `}</style>

            {/* Task Drawer — shows above messages during streaming */}
            <TaskDrawer
                tasks={derivedTasks}
                isVisible={(isStreaming || isLoading) && derivedTasks.length > 0}
            />

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
                                    initialSelectedProposal={proposalSelections[message.id] ?? null}
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
                selectedModel={selectedModel}
                onModelChange={onModelChange}
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
            <p className="mt-3 text-sm text-[#c9a474]/60">Start a conversation</p>
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
                <span className="text-xs text-[#c9a474]/60">Agent thinking...</span>
            </div>
        </div>
    );
}

function MessagesSkeleton() {
    return (
        <div className="p-4 space-y-4 animate-fade-in">
            {/* User skeleton */}
            <div className="px-4">
                <div className="h-10 w-3/4 rounded-2xl bg-[rgba(182,145,97,0.12)] skeleton-pulse opacity-30" />
            </div>
            {/* AI skeleton */}
            <div className="px-4 space-y-2">
                <div className="h-4 w-full rounded bg-[rgba(182,145,97,0.12)] skeleton-pulse opacity-30" />
                <div className="h-4 w-5/6 rounded bg-[rgba(182,145,97,0.12)] skeleton-pulse opacity-30" />
                <div className="h-4 w-2/3 rounded bg-[rgba(182,145,97,0.12)] skeleton-pulse opacity-30" />
            </div>
            {/* User skeleton */}
            <div className="px-4">
                <div className="h-10 w-1/2 rounded-2xl bg-[rgba(182,145,97,0.12)] skeleton-pulse opacity-30" />
            </div>
        </div>
    );
}
