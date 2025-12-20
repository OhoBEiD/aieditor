'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeTime, truncate } from '@/lib/utils';
import {
    Plus,
    Search,
    MessageSquare,
    Trash2,
    MoreHorizontal,
    ChevronLeft,
} from 'lucide-react';
import type { ChatSession } from '@/lib/supabase/types';

interface ChatSidebarProps {
    sessions: ChatSession[];
    activeSessionId: string | null;
    onSelectSession: (sessionId: string) => void;
    onNewChat: () => void;
    onDeleteSession: (sessionId: string) => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

export function ChatSidebar({
    sessions,
    activeSessionId,
    onSelectSession,
    onNewChat,
    onDeleteSession,
    isCollapsed = false,
    onToggleCollapse,
}: ChatSidebarProps) {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [hoveredId, setHoveredId] = React.useState<string | null>(null);

    const filteredSessions = sessions.filter((session) =>
        session.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (isCollapsed) {
        return (
            <div className="w-16 h-full bg-[var(--bg-secondary)] border-r border-[var(--border-default)] flex flex-col items-center py-4">
                <button
                    onClick={onToggleCollapse}
                    className="p-3 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                    <ChevronLeft className="w-5 h-5 rotate-180" />
                </button>
                <div className="w-8 h-px bg-[var(--border-default)] my-4" />
                <button
                    onClick={onNewChat}
                    className="p-3 rounded-lg bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-hover)] transition-colors shadow-md"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>
        );
    }

    return (
        <div className="w-72 h-full bg-[var(--bg-secondary)] border-r border-[var(--border-default)] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-[var(--border-default)]">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Chats</h2>
                    <button
                        onClick={onToggleCollapse}
                        className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>

                {/* New Chat Button */}
                <button
                    onClick={onNewChat}
                    className={cn(
                        'w-full flex items-center gap-2 px-4 py-2.5 rounded-lg',
                        'bg-[var(--accent-primary)] text-white font-medium',
                        'hover:bg-[var(--accent-primary-hover)]',
                        'transition-all duration-200 shadow-md hover:shadow-lg'
                    )}
                >
                    <Plus className="w-4 h-4" />
                    New Chat
                </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search chats..."
                        className={cn(
                            'w-full pl-9 pr-4 py-2 rounded-lg',
                            'bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
                            'border border-[var(--border-default)]',
                            'placeholder:text-[var(--text-muted)]',
                            'focus:outline-none focus:border-[var(--border-focus)]',
                            'text-sm transition-colors'
                        )}
                    />
                </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto px-2 pb-4">
                {filteredSessions.length === 0 ? (
                    <div className="text-center py-8">
                        <MessageSquare className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-2" />
                        <p className="text-sm text-[var(--text-muted)]">
                            {searchQuery ? 'No chats found' : 'No chats yet'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {filteredSessions.map((session) => (
                            <div
                                key={session.id}
                                onMouseEnter={() => setHoveredId(session.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => onSelectSession(session.id)}
                                className={cn(
                                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer',
                                    'transition-all duration-150',
                                    activeSessionId === session.id
                                        ? 'bg-[var(--bg-elevated)] border border-[var(--border-focus)]'
                                        : 'hover:bg-[var(--bg-tertiary)] border border-transparent'
                                )}
                            >
                                <MessageSquare className="w-4 h-4 flex-shrink-0 text-[var(--text-muted)]" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                                        {truncate(session.title, 25)}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {formatRelativeTime(session.updated_at)}
                                    </p>
                                </div>

                                {/* Actions */}
                                {hoveredId === session.id && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteSession(session.id);
                                            }}
                                            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--bg-hover)] transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                                        >
                                            <MoreHorizontal className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
