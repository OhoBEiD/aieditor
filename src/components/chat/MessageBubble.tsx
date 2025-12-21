'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Copy, Check, Bot, Undo2 } from 'lucide-react';
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
    const [copiedMessage, setCopiedMessage] = React.useState(false);
    const isUser = message.role === 'user';

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

    const handleCopyMessage = async () => {
        await navigator.clipboard.writeText(message.content);
        setCopiedMessage(true);
        setTimeout(() => setCopiedMessage(false), 2000);
    };

    const parts = parseContent(message.content);
    const timeString = new Date(message.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });

    // User message - rounded bubble style
    if (isUser) {
        return (
            <div className="group flex justify-end p-3">
                <div className="max-w-[80%]">
                    {/* Bubble */}
                    <div className="bg-[var(--bg-tertiary)] rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm">
                        <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                            {message.content}
                        </p>
                    </div>
                    {/* Metadata - at bottom */}
                    <div className="flex items-center justify-end gap-2 mt-1 px-1">
                        <button
                            onClick={handleCopyMessage}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all"
                            title="Copy message"
                        >
                            {copiedMessage ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <span className="text-[10px] text-[var(--text-muted)]">{timeString}</span>
                    </div>
                </div>
            </div>
        );
    }

    // AI message - subtle blue/gray gradient background
    return (
        <div className="group flex gap-2.5 p-3 bg-gradient-to-r from-slate-50 to-blue-50">
            {/* Avatar */}
            <div className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)]">
                <Bot className="w-3 h-3 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                {/* Header - just the name */}
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[var(--accent-primary)]">AutoMate Web Editor</span>
                </div>

                {/* Message content */}
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
                                                <><Check className="w-3 h-3" /> Copied</>
                                            ) : (
                                                <><Copy className="w-3 h-3" /> Copy</>
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

                {/* Footer - time on left, actions on right */}
                <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-[var(--text-muted)]">{timeString}</span>
                    <div className="flex items-center gap-2">
                        {/* Copy Button */}
                        <button
                            onClick={handleCopyMessage}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all"
                            title="Copy message"
                        >
                            {copiedMessage ? (
                                <><Check className="w-3 h-3" /> Copied</>
                            ) : (
                                <><Copy className="w-3 h-3" /> Copy</>
                            )}
                        </button>
                        {/* Revert Button - bottom right, circular navy */}
                        {onRevert && (
                            <button
                                onClick={() => onRevert(message.id)}
                                className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-hover)] transition-colors shadow-sm"
                                title="Revert this change"
                            >
                                <Undo2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
