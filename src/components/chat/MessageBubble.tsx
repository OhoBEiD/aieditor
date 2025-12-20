'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Copy, Check, Bot, User, Undo2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '@/lib/supabase/types';

interface MessageBubbleProps {
    message: Message;
    onRevert?: (messageId: string) => void;
    isStreaming?: boolean;
}

export function MessageBubble({ message, onRevert, isStreaming = false }: MessageBubbleProps) {
    const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';

    // Parse code blocks from content
    const parseContent = (content: string) => {
        const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    content: content.slice(lastIndex, match.index),
                });
            }
            parts.push({
                type: 'code',
                content: match[2].trim(),
                language: match[1] || 'javascript',
            });
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < content.length) {
            parts.push({
                type: 'text',
                content: content.slice(lastIndex),
            });
        }

        return parts.length > 0 ? parts : [{ type: 'text' as const, content }];
    };

    const handleCopy = async (text: string, index: number) => {
        await navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const parts = parseContent(message.content);

    return (
        <div
            className={cn(
                'flex gap-2.5 p-3',
                isUser ? 'bg-[var(--bg-secondary)]' : 'bg-[var(--bg-tertiary)]'
            )}
        >
            {/* Avatar */}
            <div
                className={cn(
                    'flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center',
                    isUser
                        ? 'bg-[var(--accent-primary)]'
                        : 'bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)]'
                )}
            >
                {isUser ? (
                    <User className="w-3 h-3 text-white" />
                ) : (
                    <Bot className="w-3 h-3 text-white" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                        {isUser ? 'You' : 'AI'}
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-muted)]">
                            {new Date(message.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                        {/* Revert Button - only for AI messages */}
                        {isAssistant && onRevert && (
                            <button
                                onClick={() => onRevert(message.id)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                                title="Revert this change"
                            >
                                <Undo2 className="w-3 h-3" />
                                Revert
                            </button>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    {parts.map((part, index) => (
                        <React.Fragment key={index}>
                            {part.type === 'text' ? (
                                <p
                                    className={cn(
                                        'text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed',
                                        isStreaming && index === parts.length - 1 && 'typing-cursor'
                                    )}
                                >
                                    {part.content}
                                </p>
                            ) : (
                                <div className="rounded-lg overflow-hidden border border-[var(--border-default)]">
                                    <div className="flex items-center justify-between px-2 py-1 bg-[var(--bg-tertiary)] border-b border-[var(--border-default)]">
                                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                            {part.language}
                                        </span>
                                        <button
                                            onClick={() => handleCopy(part.content, index)}
                                            className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            {copiedIndex === index ? (
                                                <>
                                                    <Check className="w-3 h-3" />
                                                    Copied
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3 h-3" />
                                                    Copy
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <SyntaxHighlighter
                                        language={part.language}
                                        style={oneLight}
                                        customStyle={{
                                            margin: 0,
                                            padding: '8px 10px',
                                            background: 'var(--bg-secondary)',
                                            fontSize: '11px',
                                        }}
                                    >
                                        {part.content}
                                    </SyntaxHighlighter>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}
