'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { ChatSession, InsertChatSession } from '@/lib/supabase/types';

interface UseConversationsOptions {
    clientId: string;
}

export function useConversations({ clientId }: UseConversationsOptions) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Fetch all sessions for the client
    const fetchSessions = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('client_id', clientId)
                .eq('is_active', true)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            setSessions(data || []);

            // Auto-select first session if none selected
            if (data && data.length > 0 && !activeSessionId) {
                setActiveSessionId(data[0].id);
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch sessions'));
        } finally {
            setIsLoading(false);
        }
    }, [clientId, activeSessionId]);

    // Create a new chat session
    const createSession = useCallback(async (title?: string) => {
        try {
            const newSession: InsertChatSession = {
                client_id: clientId,
                title: title || 'New Chat',
            };

            const { data, error } = await supabase
                .from('chat_sessions')
                .insert(newSession)
                .select()
                .single();

            if (error) throw error;

            setSessions((prev) => [data, ...prev]);
            setActiveSessionId(data.id);

            return data;
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to create session'));
            return null;
        }
    }, [clientId]);

    // Update session title
    const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
        try {
            const { error } = await supabase
                .from('chat_sessions')
                .update({ title, updated_at: new Date().toISOString() })
                .eq('id', sessionId);

            if (error) throw error;

            setSessions((prev) =>
                prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
            );
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to update session'));
        }
    }, []);

    // Delete (archive) a session
    const deleteSession = useCallback(async (sessionId: string) => {
        try {
            const { error } = await supabase
                .from('chat_sessions')
                .update({ is_active: false })
                .eq('id', sessionId);

            if (error) throw error;

            setSessions((prev) => prev.filter((s) => s.id !== sessionId));

            // Select next available session
            if (activeSessionId === sessionId) {
                const remaining = sessions.filter((s) => s.id !== sessionId);
                setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to delete session'));
        }
    }, [activeSessionId, sessions]);

    // Initial fetch
    useEffect(() => {
        if (clientId) {
            fetchSessions();
        }
    }, [clientId, fetchSessions]);

    // Real-time subscription
    useEffect(() => {
        if (!clientId) return;

        const channel = supabase
            .channel('chat_sessions_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'chat_sessions',
                    filter: `client_id=eq.${clientId}`,
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setSessions((prev) => [payload.new as ChatSession, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        setSessions((prev) =>
                            prev.map((s) =>
                                s.id === payload.new.id ? (payload.new as ChatSession) : s
                            )
                        );
                    } else if (payload.eventType === 'DELETE') {
                        setSessions((prev) => prev.filter((s) => s.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [clientId]);

    return {
        sessions,
        activeSessionId,
        setActiveSessionId,
        isLoading,
        error,
        createSession,
        updateSessionTitle,
        deleteSession,
        refetch: fetchSessions,
    };
}
