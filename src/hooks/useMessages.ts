'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Message, InsertMessage } from '@/lib/supabase/types';
import { sendChatMessage } from '@/lib/n8n/client';
import { generateSessionTitle } from '@/lib/utils';

interface UseMessagesOptions {
    sessionId: string | null;
    clientId: string;
    onTitleUpdate?: (title: string) => void;
}

export function useMessages({ sessionId, clientId, onTitleUpdate }: UseMessagesOptions) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Fetch messages for the current session
    const fetchMessages = useCallback(async () => {
        if (!sessionId) {
            setMessages([]);
            return;
        }

        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setMessages(data || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch messages'));
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    // Send a message and get AI response
    const sendMessage = useCallback(async (content: string, selectedFiles?: string[]) => {
        if (!sessionId || !content.trim()) return;

        try {
            setIsSending(true);
            setError(null);

            // Create user message
            const userMessage: InsertMessage = {
                session_id: sessionId,
                role: 'user',
                content: content.trim(),
            };

            const { data: savedUserMessage, error: userError } = await supabase
                .from('messages')
                .insert(userMessage)
                .select()
                .single();

            if (userError) throw userError;

            // Add to local state immediately
            setMessages((prev) => [...prev, savedUserMessage]);

            // Update session title if this is the first message
            if (messages.length === 0 && onTitleUpdate) {
                onTitleUpdate(generateSessionTitle(content));
            }

            // Send to n8n and get AI response
            const aiResponse = await sendChatMessage({
                session_id: sessionId,
                client_id: clientId,
                message: content,
                selected_files: selectedFiles,
            });

            // Save AI response - cast metadata to satisfy Json type
            const metadataObj = {
                code_changes: aiResponse.code_changes,
                suggested_actions: aiResponse.suggested_actions,
            };
            const assistantMessage: InsertMessage = {
                session_id: sessionId,
                role: 'assistant',
                content: aiResponse.response,
                metadata: JSON.parse(JSON.stringify(metadataObj)),
            };

            const { data: savedAssistantMessage, error: assistantError } = await supabase
                .from('messages')
                .insert(assistantMessage)
                .select()
                .single();

            if (assistantError) throw assistantError;

            setMessages((prev) => [...prev, savedAssistantMessage]);

            return aiResponse;
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to send message'));
        } finally {
            setIsSending(false);
        }
    }, [sessionId, clientId, messages.length, onTitleUpdate]);

    // Initial fetch when session changes
    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    // Real-time subscription
    useEffect(() => {
        if (!sessionId) return;

        const channel = supabase
            .channel(`messages_${sessionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `session_id=eq.${sessionId}`,
                },
                (payload) => {
                    // Only add if not already in the list (avoid duplicates from our own inserts)
                    setMessages((prev) => {
                        const exists = prev.some((m) => m.id === payload.new.id);
                        if (exists) return prev;
                        return [...prev, payload.new as Message];
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [sessionId]);

    return {
        messages,
        isLoading,
        isSending,
        error,
        sendMessage,
        refetch: fetchMessages,
    };
}
