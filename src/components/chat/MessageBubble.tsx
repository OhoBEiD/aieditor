'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Copy, Check, Undo2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '@/lib/supabase/types';
import { supabase } from '@/lib/supabase/client';
import { ProposalSelector, SelectedProposalBadge } from './ProposalSelector';
import { ArtifactCard } from './ArtifactCard';
import type { Artifact } from '@/lib/ai/artifacts/types';

// Simple markdown-to-JSX renderer for AI messages
function renderMarkdown(text: string): React.ReactNode[] {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];
    let listKey = 0;

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`list-${listKey++}`} className="space-y-1 my-1.5">
                    {listItems}
                </ul>
            );
            listItems = [];
        }
    };

    // Inline formatting: **bold**, *italic*, `code`, [links]
    const formatInline = (line: string): React.ReactNode[] => {
        const parts: React.ReactNode[] = [];
        // Match **bold**, *italic*, `code`
        const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
        let lastIndex = 0;
        let match;
        let k = 0;

        while ((match = regex.exec(line)) !== null) {
            // Text before match
            if (match.index > lastIndex) {
                parts.push(line.slice(lastIndex, match.index));
            }
            if (match[2]) {
                // **bold**
                parts.push(<strong key={k++} className="font-semibold text-white/95">{match[2]}</strong>);
            } else if (match[3]) {
                // *italic*
                parts.push(<em key={k++} className="italic text-white/70">{match[3]}</em>);
            } else if (match[4]) {
                // `inline code`
                parts.push(<code key={k++} className="px-1.5 py-0.5 rounded bg-[#c9a474]/15 text-[#dbb98a] text-[11px] font-mono">{match[4]}</code>);
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < line.length) {
            parts.push(line.slice(lastIndex));
        }
        return parts.length > 0 ? parts : [line];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip empty lines (but flush lists)
        if (!trimmed) {
            flushList();
            continue;
        }

        // Headings: ### or ##
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
            flushList();
            const level = headingMatch[1].length;
            const content = headingMatch[2];
            elements.push(
                <p key={`h-${i}`} className={cn(
                    "font-semibold text-white/95 mt-2 mb-1",
                    level === 1 ? "text-sm" : level === 2 ? "text-[13px]" : "text-xs"
                )}>
                    {formatInline(content)}
                </p>
            );
            continue;
        }

        // Bullet list items: - item or * item or number. item
        const listMatch = trimmed.match(/^[-*•]\s+(.+)|^(\d+)\.\s+(.+)/);
        if (listMatch) {
            const content = listMatch[1] || listMatch[3];
            const indent = line.search(/\S/) >= 4; // nested indent
            listItems.push(
                <li key={`li-${i}`} className={cn("flex items-start gap-2 text-sm text-white/80", indent && "ml-4")}>
                    <span className="text-[#c9a474]/50 mt-1 shrink-0 text-[8px]">●</span>
                    <span className="leading-relaxed">{formatInline(content)}</span>
                </li>
            );
            continue;
        }

        // Regular paragraph
        flushList();
        elements.push(
            <p key={`p-${i}`} className="text-sm text-white/80 leading-relaxed">
                {formatInline(trimmed)}
            </p>
        );
    }

    flushList();
    return elements;
}

interface MessageBubbleProps {
    message: Message;
    onRevert?: (messageId: string) => void;
    onSendMessage?: (message: string) => void;
    isStreaming?: boolean;
    initialSelectedProposal?: number | null;
}

export function MessageBubble({ message, onRevert, onSendMessage, isStreaming = false, initialSelectedProposal = null }: MessageBubbleProps) {
    const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
    const [copiedMessage, setCopiedMessage] = React.useState(false);
    const [isNew, setIsNew] = useState(true);
    const [selectedProposal, setSelectedProposal] = useState<number | null>(initialSelectedProposal);

    // Sync selection state when prop updates (e.g., after chat refresh loads metadata from Supabase)
    useEffect(() => {
        if (initialSelectedProposal != null) {
            setSelectedProposal(initialSelectedProposal);
        }
    }, [initialSelectedProposal]);

    const isUser = message.role === 'user';

    type ContentPart =
        | { type: 'text'; content: string }
        | { type: 'code'; content: string; language?: string }
        | { type: 'artifact'; artifact: Artifact }
        | { type: 'proposal'; data: any };

    const parseContent = (content: string): ContentPart[] => {
        const parts: ContentPart[] = [];

        // Combined regex: match code blocks, artifacts, proposal options, and other markers to strip
        const combinedRegex = /```(\w+)?\n([\s\S]*?)```|\n?<!--ARTIFACT:([\s\S]*?)-->\n?|\n?<!--PROPOSAL_OPTIONS:([\s\S]*?)-->\n?|\n?<!--(?:FILE_OP|DONE|REQUEST_SCREENSHOT):[\s\S]*?-->\n?/g;
        let lastIndex = 0;
        let match;

        while ((match = combinedRegex.exec(content)) !== null) {
            // Text before this match
            if (match.index > lastIndex) {
                const text = content.slice(lastIndex, match.index);
                if (text.trim()) parts.push({ type: 'text', content: text });
            }

            if (match[2] !== undefined) {
                // Code block
                parts.push({ type: 'code', content: match[2].trim(), language: match[1] || 'javascript' });
            } else if (match[3] !== undefined) {
                // Artifact
                try {
                    const artifact = JSON.parse(match[3]) as Artifact;
                    // Proposals with type 'proposal' get rendered as ProposalSelector
                    if (artifact.type === 'proposal' && artifact.data) {
                        parts.push({ type: 'proposal', data: artifact.data });
                    } else {
                        parts.push({ type: 'artifact', artifact });
                    }
                } catch {
                    // Malformed JSON — skip
                }
            } else if (match[4] !== undefined) {
                // Proposal options
                try {
                    const data = JSON.parse(match[4]);
                    parts.push({ type: 'proposal', data });
                } catch {
                    // Malformed JSON — skip
                }
            }
            // FILE_OP, DONE, REQUEST_SCREENSHOT markers are silently stripped

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < content.length) {
            const text = content.slice(lastIndex);
            if (text.trim()) parts.push({ type: 'text', content: text });
        }

        return parts.length > 0 ? parts : [{ type: 'text', content }];
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

    useEffect(() => {
        if (!isUser && isNew) {
            const timer = setTimeout(() => setIsNew(false), 500);
            return () => clearTimeout(timer);
        }
    }, [isUser, isNew]);

    // Get image from metadata if present
    const messageImage = (message.metadata as { image?: string } | undefined)?.image;
    const [showImagePopup, setShowImagePopup] = React.useState(false);
    const [copiedImage, setCopiedImage] = React.useState(false);

    const handleCopyImage = async () => {
        if (!messageImage) return;
        try {
            const response = await fetch(messageImage);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
            ]);
            setCopiedImage(true);
            setTimeout(() => setCopiedImage(false), 2000);
        } catch {
            await navigator.clipboard.writeText(messageImage);
            setCopiedImage(true);
            setTimeout(() => setCopiedImage(false), 2000);
        }
    };

    // ── User message ──
    if (isUser) {
        return (
            <>
                {/* Image Popup Modal */}
                {showImagePopup && messageImage && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-[#2c2418]/70 backdrop-blur-sm"
                        onClick={() => setShowImagePopup(false)}
                    >
                        <div
                            className="relative max-w-[90vw] max-h-[90vh] dark-glass-strong rounded-xl shadow-2xl p-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={messageImage}
                                alt="Full size"
                                className="max-w-full max-h-[80vh] rounded-lg object-contain"
                            />
                            <div className="flex items-center justify-center gap-3 mt-3">
                                <button
                                    onClick={handleCopyImage}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#c9a474]/20 text-white/90 text-sm font-medium hover:bg-[#c9a474]/30 transition-colors"
                                >
                                    {copiedImage ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {copiedImage ? 'Copied!' : 'Copy Image'}
                                </button>
                                <button
                                    onClick={() => setShowImagePopup(false)}
                                    className="px-4 py-2 rounded-lg bg-white/10 text-white/60 text-sm font-medium hover:bg-white/15 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="group px-4 py-2">
                    <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="relative dark-glass-subtle rounded-2xl px-4 py-3">
                                {/* Attached Image */}
                                {messageImage && (
                                    <div className="mb-2">
                                        <img
                                            src={messageImage}
                                            alt="Attached"
                                            className="h-16 rounded-lg object-contain cursor-pointer hover:opacity-80 transition-opacity border border-[#b69161]/15"
                                            onClick={() => setShowImagePopup(true)}
                                        />
                                    </div>
                                )}
                                {/* Message Text */}
                                {message.content && message.content !== 'Sent an image' && (
                                    <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                                        {message.content}
                                    </p>
                                )}
                            </div>
                        </div>
                        {/* Revert Button */}
                        {onRevert && (
                            <button
                                onClick={() => onRevert(message.id)}
                                className="flex-shrink-0 mt-2 flex items-center justify-center w-7 h-7 rounded-full text-[#7a6f60] hover:text-[#2c2418] hover:bg-[#b69161]/10 transition-colors"
                                title="Revert"
                            >
                                <Undo2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </>
        );
    }

    // ── AI message ──
    return (
        <div className="group px-4 py-3">
            <div className="space-y-3">
                {parts.map((part, index) => (
                    <React.Fragment key={index}>
                        {part.type === 'text' ? (
                            <div
                                className={cn(
                                    'space-y-1',
                                    isNew && 'animate-text-reveal',
                                    isStreaming && index === parts.length - 1 && 'typing-cursor'
                                )}
                            >
                                {renderMarkdown(part.content)}
                            </div>
                        ) : part.type === 'proposal' ? (
                            selectedProposal != null ? (
                                <SelectedProposalBadge
                                    option={(part.data.options || []).find((o: any) => o.id === selectedProposal)}
                                    optionId={selectedProposal}
                                />
                            ) : (
                                <ProposalSelector
                                    options={part.data.options || []}
                                    recommendation={part.data.recommendation || 1}
                                    recommendationReason={part.data.recommendationReason || ''}
                                    researchSummary={part.data.researchSummary || ''}
                                    selectedId={selectedProposal}
                                    onSelect={(id) => {
                                        setSelectedProposal(id);
                                        // Persist selection to Supabase message metadata
                                        const existingMeta = (typeof message.metadata === 'object' && message.metadata !== null ? message.metadata : {}) as Record<string, any>;
                                        supabase.from('messages').update({
                                            metadata: { ...existingMeta, selectedOption: id },
                                        }).eq('id', message.id).then(({ error }) => {
                                            if (error) console.error('[MessageBubble] Failed to persist proposal selection:', error);
                                        });
                                        onSendMessage?.(`Option ${id}`);
                                    }}
                                />
                            )
                        ) : part.type === 'artifact' ? (
                            <ArtifactCard artifact={part.artifact} />
                        ) : (
                            <div className="rounded-xl overflow-hidden dark-glass-inset">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-[rgba(44,36,24,0.5)] border-b border-[rgba(182,145,97,0.15)]">
                                    <span className="text-[10px] text-[#c9a474]/60 font-mono">
                                        {part.language}
                                    </span>
                                    <button
                                        onClick={() => handleCopy(part.content, index)}
                                        className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white/80 transition-colors"
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
                                    style={oneDark}
                                    showLineNumbers
                                    customStyle={{
                                        margin: 0,
                                        padding: '12px 14px',
                                        background: 'transparent',
                                        fontSize: '12px',
                                        lineHeight: '1.6',
                                    }}
                                    lineNumberStyle={{
                                        color: 'rgba(182, 145, 97, 0.35)',
                                        fontSize: '11px',
                                        minWidth: '2em',
                                        paddingRight: '12px',
                                    }}
                                >
                                    {part.content}
                                </SyntaxHighlighter>
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Copy button on hover */}
            <div className="flex items-center mt-2">
                <button
                    onClick={handleCopyMessage}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
                    title="Copy message"
                >
                    {copiedMessage ? (
                        <><Check className="w-3 h-3" /> Copied</>
                    ) : (
                        <><Copy className="w-3 h-3" /> Copy</>
                    )}
                </button>
            </div>
        </div>
    );
}
