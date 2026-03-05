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
                    'bg-[#d6cfc9]/30 text-[#84745b]',
                    'hover:bg-[#d6cfc9]/50 hover:text-[#2c2418]',
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
                        'bg-[#d6cfc9]/30 border border-[#b69161]/20',
                        'text-sm text-[#84745b]/80',
                        'hover:border-[#b69161]/30 hover:bg-[#d6cfc9]/40',
                        'transition-all duration-200'
                    )}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="w-4 h-4 text-[#84745b]/50 flex-shrink-0" />
                        <span className="truncate">
                            {activeSession ? truncate(activeSession.title, 30) : 'Select a chat'}
                        </span>
                    </div>
                    <ChevronDown
                        className={cn(
                            'w-4 h-4 text-[#84745b]/50 flex-shrink-0 transition-transform',
                            isOpen && 'rotate-180'
                        )}
                    />
                </button>

                {/* Dropdown Menu */}
                {isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-[#f2efed] border border-[#b69161]/20 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto animate-fade-in">
                        {sessions.length === 0 ? (
                            <div className="px-3 py-4 text-center">
                                <MessageSquare className="w-8 h-8 mx-auto text-[#84745b]/30 mb-2" />
                                <p className="text-sm text-[#84745b]/50">No chats yet</p>
                            </div>
                        ) : (
                            sessions.map((session) => (
                                <div
                                    key={session.id}
                                    className={cn(
                                        'group flex items-center gap-2 px-3 py-2',
                                        'hover:bg-[#d6cfc9]/30 transition-colors',
                                        session.id === activeSessionId && 'bg-[#d6cfc9]/40'
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
                                                className="flex-1 px-2 py-1 text-sm bg-[#d6cfc9]/40 border border-[#b69161]/20 rounded text-[#84745b] focus:outline-none focus:border-[#b69161]/30"
                                            />
                                            <button
                                                onClick={() => handleRename(session.id)}
                                                className="p-1 rounded text-green-400 hover:bg-green-500/10"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                className="p-1 rounded text-[#84745b]/50 hover:bg-[#d6cfc9]/30"
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
                                                <MessageSquare className="w-4 h-4 text-[#84745b]/50 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-[#84745b] truncate">
                                                        {truncate(session.title, 35)}
                                                    </p>
                                                    <p className="text-xs text-[#84745b]/50">
                                                        {formatRelativeTime(session.updated_at)}
                                                    </p>
                                                </div>
                                            </button>
                                            {onRenameChat && (
                                                <button
                                                    onClick={(e) => startEditing(e, session)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-[#84745b]/50 hover:text-[#84745b] hover:bg-[#d6cfc9]/30 transition-all"
                                                    title="Rename chat"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {onDeleteChat && (
                                                <button
                                                    onClick={(e) => handleDelete(e, session.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-[#84745b]/50 hover:text-red-400 hover:bg-red-500/10 transition-all"
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
