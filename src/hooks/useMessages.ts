'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Message, InsertMessage } from '@/lib/supabase/types';
import { generateSessionTitle } from '@/lib/utils';

interface ThinkingStep {
    text: string;
    status: 'pending' | 'complete' | 'error';
}

interface UseMessagesOptions {
    sessionId: string | null;
    clientId: string;
    onTitleUpdate?: (title: string) => void;
}

// Simulated thinking steps for local display
const THINKING_STEPS = [
    'Starting preview environment...',
    'Fetching project files...',
    'Reading file contents...',
    'Analyzing your request...',
    'Generating code changes...',
    'Applying changes to preview...',
];

export function useMessages({ sessionId, clientId, onTitleUpdate }: UseMessagesOptions) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const thinkingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Start simulated thinking steps
    const startThinkingAnimation = useCallback(() => {
        let stepIndex = 0;
        setThinkingSteps([{ text: THINKING_STEPS[0], status: 'pending' }]);
        setIsStreaming(true);

        thinkingIntervalRef.current = setInterval(() => {
            stepIndex++;
            if (stepIndex < THINKING_STEPS.length) {
                setThinkingSteps((prev) => {
                    // Mark previous as complete, add new step
                    const updated = prev.map((s) => ({ ...s, status: 'complete' as const }));
                    return [...updated, { text: THINKING_STEPS[stepIndex], status: 'pending' as const }];
                });
            } else {
                // Loop back or stay on last step
                if (thinkingIntervalRef.current) {
                    clearInterval(thinkingIntervalRef.current);
                }
            }
        }, 2500); // Show new step every 2.5 seconds
    }, []);

    // Stop thinking animation
    const stopThinkingAnimation = useCallback((success: boolean = true) => {
        if (thinkingIntervalRef.current) {
            clearInterval(thinkingIntervalRef.current);
            thinkingIntervalRef.current = null;
        }

        if (success) {
            // Mark all steps as complete
            setThinkingSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' as const })));
        } else {
            // Mark last step as error
            setThinkingSteps((prev) =>
                prev.map((s, i) => i === prev.length - 1 ? { ...s, status: 'error' as const } : s)
            );
        }

        // Clear after delay
        setTimeout(() => {
            setThinkingSteps([]);
            setIsStreaming(false);
        }, 1000);
    }, []);

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
    const sendMessage = useCallback(async (content: string) => {
        if (!sessionId || !content.trim()) return;

        // Create abort controller for this request
        abortControllerRef.current = new AbortController();

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

            // Start thinking animation
            startThinkingAnimation();

            // Call API and wait for response (with longer timeout)
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    siteId: clientId,
                    conversationId: sessionId,
                    userId: clientId,
                    message: content,
                }),
                signal: abortControllerRef.current.signal,
            });

            const result = await response.json();

            // Stop thinking animation (success)
            stopThinkingAnimation(true);

            // Save assistant message
            const assistantMessage: InsertMessage = {
                session_id: sessionId,
                role: 'assistant',
                content: result.summary || 'Changes processed.',
                metadata: JSON.parse(JSON.stringify({
                    requestId: result.requestId || '',
                    status: result.status || 'pending',
                    diff: result.diff || '',
                    filesChanged: result.filesChanged || [],
                    previewUrl: result.previewUrl || '',
                    warnings: result.warnings || [],
                })),
            };

            const { data: savedAssistant, error: assistantErr } = await supabase
                .from('messages')
                .insert(assistantMessage)
                .select()
                .single();

            if (!assistantErr && savedAssistant) {
                setMessages((prev) => [...prev, savedAssistant]);
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                // Request was cancelled
                stopThinkingAnimation(false);
            } else {
                setError(err instanceof Error ? err : new Error('Failed to send message'));
                stopThinkingAnimation(false);
            }
        } finally {
            setIsSending(false);
            abortControllerRef.current = null;
        }
    }, [sessionId, clientId, messages.length, onTitleUpdate, startThinkingAnimation, stopThinkingAnimation]);

    // Stop streaming / cancel request
    const stopStreaming = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        stopThinkingAnimation(false);
        setIsSending(false);
    }, [stopThinkingAnimation]);

    // Initial fetch when session changes
    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (thinkingIntervalRef.current) {
                clearInterval(thinkingIntervalRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

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
        isStreaming,
        thinkingSteps,
        error,
        sendMessage,
        stopStreaming,
        refetch: fetchMessages,
    };
}
