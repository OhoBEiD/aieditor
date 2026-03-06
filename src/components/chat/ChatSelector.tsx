'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Plus, MessageSquare, Trash2, Pencil, Check, X } from 'lucide-react';
import type { ChatSession } from '@/lib/supabase/types';
import { formatRelativeTime, truncate } from '@/lib/utils';

interface ChatSelectorProps {
    sessions: ChatSession[];
    activeSessionId: string | null;
    onSelectSession: (sessionId: string) => void;
    onNewChat: () => void;
    onDeleteChat?: (sessionId: string) => void;
    onRenameChat?: (sessionId: string, newTitle: string) => void;
}

export function ChatSelector({
    sessions,
    activeSessionId,
    onSelectSession,
    onNewChat,
    onDeleteChat,
    onRenameChat,
}: ChatSelectorProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const activeSession = sessions.find((s) => s.id === activeSessionId);

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setEditingId(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    React.useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId]);

    const handleDelete = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (onDeleteChat) onDeleteChat(sessionId);
    };

    const startEditing = (e: React.MouseEvent, session: ChatSession) => {
        e.stopPropagation();
        setEditingId(session.id);
        setEditValue(session.title);
    };

    const handleRename = (sessionId: string) => {
        if (onRenameChat && editValue.trim()) {
            onRenameChat(sessionId, editValue.trim());
        }
        setEditingId(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValue('');
    };

    return (
        <div className="flex items-center gap-2 w-full">
            {/* New Chat Button */}
            <button
                onClick={onNewChat}
                className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0',
                    'bg-white/8 text-white/50',
                    'hover:bg-white/12 hover:text-white/80',
                    'transition-all duration-200'
                )}
                title="New Chat"
            >
                <Plus className="w-5 h-5" />
            </button>

            {/* Chat Dropdown */}
            <div className="relative flex-1 min-w-0" ref={dropdownRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg',
                        'bg-white/8 border border-[rgba(182,145,97,0.18)]',
                        'text-sm text-white/60',
                        'hover:border-[rgba(182,145,97,0.3)] hover:bg-white/12',
                        'transition-all duration-200'
                    )}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="w-4 h-4 text-white/40 flex-shrink-0" />
                        <span className="truncate">
                            {activeSession ? truncate(activeSession.title, 30) : 'Select a chat'}
                        </span>
                    </div>
                    <ChevronDown
                        className={cn(
                            'w-4 h-4 text-white/40 flex-shrink-0 transition-transform',
                            isOpen && 'rotate-180'
                        )}
                    />
                </button>

                {/* Dropdown Menu */}
                {isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 py-1 border border-[rgba(182,145,97,0.2)] rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto animate-fade-in backdrop-blur-xl" style={{ background: 'rgba(55, 45, 30, 0.92)' }}>
                        {sessions.length === 0 ? (
                            <div className="px-3 py-4 text-center">
                                <MessageSquare className="w-8 h-8 mx-auto text-white/20 mb-2" />
                                <p className="text-sm text-white/40">No chats yet</p>
                            </div>
                        ) : (
                            sessions.map((session) => (
                                <div
                                    key={session.id}
                                    className={cn(
                                        'group flex items-center gap-2 px-3 py-2',
                                        'hover:bg-white/8 transition-colors',
                                        session.id === activeSessionId && 'bg-white/10'
                                    )}
                                >
                                    {editingId === session.id ? (
                                        <div className="flex-1 flex items-center gap-2">
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename(session.id);
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                                className="flex-1 px-2 py-1 text-sm bg-white/8 border border-[rgba(182,145,97,0.18)] rounded text-white/80 focus:outline-none focus:border-[rgba(182,145,97,0.35)]"
                                            />
                                            <button
                                                onClick={() => handleRename(session.id)}
                                                className="p-1 rounded text-green-400 hover:bg-green-500/10"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                className="p-1 rounded text-white/40 hover:bg-white/8"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => {
                                                    onSelectSession(session.id);
                                                    setIsOpen(false);
                                                }}
                                                className="flex-1 flex items-center gap-3 text-left min-w-0"
                                            >
                                                <MessageSquare className="w-4 h-4 text-white/40 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-white/60 truncate">
                                                        {truncate(session.title, 35)}
                                                    </p>
                                                    <p className="text-xs text-white/40">
                                                        {formatRelativeTime(session.updated_at)}
                                                    </p>
                                                </div>
                                            </button>
                                            {onRenameChat && (
                                                <button
                                                    onClick={(e) => startEditing(e, session)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-white/40 hover:text-white/60 hover:bg-white/8 transition-all"
                                                    title="Rename chat"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {onDeleteChat && (
                                                <button
                                                    onClick={(e) => handleDelete(e, session.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                    title="Delete chat"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
