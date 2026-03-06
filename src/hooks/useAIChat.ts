'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useRef, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface FileOperation {
    type: 'write' | 'modify' | 'delete';
    path: string;
    content?: string;
    oldText?: string;
    newText?: string;
}

// Extract text from UIMessage parts
function getMessageText(message: UIMessage): string {
    return message.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
}

// Parse file operations from the text stream (encoded as HTML comments)
function parseFileOps(text: string): FileOperation[] {
    const ops: FileOperation[] = [];
    const regex = /<!--FILE_OP:([\s\S]*?)-->/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        try {
            const op = JSON.parse(match[1]);
            ops.push(op);
        } catch {
            // Skip malformed ops
        }
    }
    return ops;
}

// Strip file operation markers and done markers from display text
function cleanDisplayText(text: string): string {
    return text
        .replace(/\n?<!--FILE_OP:[\s\S]*?-->\n?/g, '')
        .replace(/\n?<!--DONE:[\s\S]*?-->\n?/g, '')
        .trim();
}

// Strip ALL markers for AI conversation context (so the AI doesn't see raw markers)
function cleanForAIContext(text: string): string {
    return text
        .replace(/\n?<!--FILE_OP:[\s\S]*?-->\n?/g, '')
        .replace(/\n?<!--DONE:[\s\S]*?-->\n?/g, '')
        .replace(/\n?<!--ARTIFACT:[\s\S]*?-->\n?/g, '')
        .replace(/\n?<!--PROPOSAL_OPTIONS:[\s\S]*?-->\n?/g, '')
        .replace(/\n?<!--REQUEST_SCREENSHOT:[\s\S]*?-->\n?/g, '')
        .trim();
}

interface UseAIChatOptions {
    sessionId: string | null;
    siteId: string;
    projectId: string;
    selectedModel?: string;
    getFileContext: () => Promise<Record<string, string>>;
    applyFileOperations: (ops: FileOperation[]) => Promise<any>;
    onRequestIdChange?: (requestId: string | null) => void;
    onBeforeFinish?: (requestId: string) => Promise<void> | void;
    onStreamingChange?: (isStreaming: boolean) => void;
    onFileOpsApplied?: (count: number) => void;
    supabaseContext?: {
        projectUrl: string;
        schema: any;
        hasServiceRoleKey: boolean;
    } | null;
}

export function useAIChat({
    sessionId,
    siteId,
    projectId,
    selectedModel,
    getFileContext,
    applyFileOperations,
    onRequestIdChange,
    onBeforeFinish,
    onStreamingChange,
    onFileOpsApplied,
    supabaseContext,
}: UseAIChatOptions) {
    const [requestId, setRequestId] = useState<string | null>(null);
    const requestIdRef = useRef<string | null>(null);
    // Use a ref for sessionId so that onFinish/onError callbacks always read
    // the correct value, even when the prop hasn't updated yet (e.g., first message
    // where handleSendMessage creates a session and passes the ID as an override).
    const sessionIdRef = useRef<string | null>(sessionId);
    // Keep ref in sync with prop changes
    if (sessionId && sessionId !== sessionIdRef.current) {
        sessionIdRef.current = sessionId;
    }
    const [streamAppliedOps, setStreamAppliedOps] = useState(0);
    const appliedOpsRef = useRef(0);
    const processedOpsRef = useRef(new Set<string>());
    const requestBodyRef = useRef<any>(null);
    const streamingMessageIdRef = useRef<string | null>(null);
    const lastPersistedTextRef = useRef<string>('');

    // Derive a stable chatId for useChat. When sessionId is null (no active session),
    // use a unique ephemeral ID so useChat creates a fresh Chat instance instead of
    // reusing a shared "undefined" store.
    const [chatId, setChatId] = useState<string>(
        sessionId || `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    const prevSessionIdRef = useRef<string | null>(sessionId);
    useEffect(() => {
        const prev = prevSessionIdRef.current;
        prevSessionIdRef.current = sessionId;
        if (sessionId && prev && sessionId !== prev) {
            // Switching between two real sessions
            setChatId(sessionId);
        } else if (!sessionId && prev) {
            // Session cleared (new project) - generate fresh ephemeral ID
            setChatId(`ephemeral-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        }
        // null→real (first message creates session): do NOT change chatId,
        // this preserves the first exchange in useChat's message store
    }, [sessionId]);

    const {
        messages,
        setMessages,
        sendMessage,
        stop,
        status,
        error,
    } = useChat({
        id: chatId,
        transport: new DefaultChatTransport({
            api: '/api/ai/chat',
            body: () => requestBodyRef.current || {},
        }),
        onFinish: async ({ message }) => {
            // Use refs to avoid stale closure issues (useChat may not re-create callbacks)
            const currentRequestId = requestIdRef.current;
            const currentSessionId = sessionIdRef.current;

            // Extract text and apply any remaining file ops
            const text = getMessageText(message);
            const ops = parseFileOps(text);

            // Apply any ops we haven't processed yet
            for (const op of ops) {
                const key = `${op.type}:${op.path}`;
                if (!processedOpsRef.current.has(key)) {
                    processedOpsRef.current.add(key);
                    await applyFileOperations([op]);
                    appliedOpsRef.current++;
                }
            }

            // Persist assistant message to Supabase (update if streaming row exists, else insert)
            if (currentSessionId) {
                const cleanText = cleanDisplayText(text) || "[No response generated]";
                try {
                    if (streamingMessageIdRef.current) {
                        await supabase.from('messages').update({
                            content: cleanText,
                            metadata: { requestId: currentRequestId, status: 'completed' },
                        }).eq('id', streamingMessageIdRef.current);
                        streamingMessageIdRef.current = null;
                    } else {
                        await supabase.from('messages').insert({
                            session_id: currentSessionId,
                            role: 'assistant',
                            content: cleanText,
                            metadata: { requestId: currentRequestId, status: 'completed' },
                        });
                    }
                } catch (err) {
                    console.error('[useAIChat] Failed to persist assistant message:', err);
                }
            }

            onStreamingChange?.(false);
            // Snapshot thinking steps before clearing request ID
            if (currentRequestId) {
                await onBeforeFinish?.(currentRequestId);
            }
            setRequestId(null);
            requestIdRef.current = null;
            onRequestIdChange?.(null);

            if (appliedOpsRef.current > 0) {
                onFileOpsApplied?.(appliedOpsRef.current);
            }
        },
        onError: async (err) => {
            console.error('[useAIChat] Error:', err);
            const currentRequestId = requestIdRef.current;
            const currentSessionId = sessionIdRef.current;

            // Persist partial assistant message on error so it doesn't vanish
            if (currentSessionId) {
                const partialText = messages.length > 0
                    ? (() => {
                        const lastMsg = messages[messages.length - 1];
                        return lastMsg.role === 'assistant' ? cleanDisplayText(getMessageText(lastMsg)) : '';
                    })()
                    : '';
                const errorContent = partialText || '[Generation interrupted by error]';

                try {
                    if (streamingMessageIdRef.current) {
                        await supabase.from('messages').update({
                            content: errorContent,
                            metadata: { requestId: currentRequestId, status: 'error', error: err.message },
                        }).eq('id', streamingMessageIdRef.current);
                        streamingMessageIdRef.current = null;
                    } else if (partialText) {
                        await supabase.from('messages').insert({
                            session_id: currentSessionId,
                            role: 'assistant',
                            content: errorContent,
                            metadata: { requestId: currentRequestId, status: 'error', error: err.message },
                        });
                    }
                } catch (e) {
                    console.error('[useAIChat] Failed to persist error message:', e);
                }
            }

            onStreamingChange?.(false);
            if (currentRequestId) {
                await onBeforeFinish?.(currentRequestId);
            }
            setRequestId(null);
            requestIdRef.current = null;
            onRequestIdChange?.(null);
        },
    });

    // Process file operations from streaming messages in real-time
    useEffect(() => {
        if (status !== 'streaming' || messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role !== 'assistant') return;

        const text = getMessageText(lastMessage);
        const ops = parseFileOps(text);

        // Apply any new ops
        const applyNewOps = async () => {
            for (const op of ops) {
                const key = `${op.type}:${op.path}`;
                if (!processedOpsRef.current.has(key)) {
                    processedOpsRef.current.add(key);
                    await applyFileOperations([op]);
                    appliedOpsRef.current++;
                    setStreamAppliedOps(appliedOpsRef.current);
                    onFileOpsApplied?.(appliedOpsRef.current);
                }
            }
        };

        applyNewOps();
    }, [messages, status, applyFileOperations, onFileOpsApplied]);

    // Periodically persist streaming assistant content to Supabase (every 3s)
    useEffect(() => {
        if (status !== 'streaming' || !streamingMessageIdRef.current || !sessionIdRef.current) return;

        const interval = setInterval(() => {
            if (messages.length === 0 || !streamingMessageIdRef.current) return;

            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role !== 'assistant') return;

            const text = getMessageText(lastMessage);
            const cleanText = cleanDisplayText(text);

            // Only update if content has changed since last persist
            if (cleanText && cleanText !== lastPersistedTextRef.current) {
                lastPersistedTextRef.current = cleanText;
                supabase.from('messages').update({
                    content: cleanText,
                    metadata: { requestId: requestIdRef.current, status: 'streaming' },
                }).eq('id', streamingMessageIdRef.current).then(({ error }) => {
                    if (error) console.error('[useAIChat] Failed to update streaming message:', error);
                });
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [status, messages, sessionId, requestId]);

    // Send message with full context
    // sessionIdOverride: allows caller to pass the correct session ID when it
    // was just created and React hasn't re-rendered the hook yet (first message flow)
    const send = useCallback(
        async (content: string, _image?: File, sessionIdOverride?: string) => {
            if (!content.trim()) return;

            // Use override if provided (handles first-message race condition),
            // otherwise fall back to the prop value
            const effectiveSessionId = sessionIdOverride || sessionId;
            // Update the ref immediately so onFinish/onError use the correct value
            if (effectiveSessionId) {
                sessionIdRef.current = effectiveSessionId;
            }

            const newRequestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            setRequestId(newRequestId);
            requestIdRef.current = newRequestId;
            onRequestIdChange?.(newRequestId);
            onStreamingChange?.(true);
            appliedOpsRef.current = 0;
            processedOpsRef.current = new Set();
            setStreamAppliedOps(0);

            // Reset cancellation flag
            if (effectiveSessionId) {
                await supabase
                    .from('chat_sessions')
                    .update({ is_cancelled: false })
                    .eq('id', effectiveSessionId);
            }

            // Note: user message is already persisted by handleSendMessage in page.tsx
            // Only insert the streaming placeholder for incremental assistant persistence
            if (effectiveSessionId) {
                // Insert placeholder assistant message for incremental persistence
                try {
                    const { data: insertedMsg } = await supabase.from('messages').insert({
                        session_id: effectiveSessionId,
                        role: 'assistant',
                        content: '',
                        metadata: { requestId: newRequestId, status: 'streaming' },
                    }).select('id').single();
                    if (insertedMsg) {
                        streamingMessageIdRef.current = insertedMsg.id;
                        lastPersistedTextRef.current = '';
                    }
                } catch (err) {
                    console.error('[useAIChat] Failed to create streaming message:', err);
                }
            }

            // Get file context from WebContainer
            let fileContents: Record<string, string> = {};
            try {
                fileContents = await getFileContext();
            } catch (err) {
                console.error('[useAIChat] Failed to get file context:', err);
            }

            // Build conversation history from existing messages
            const conversationHistory = messages
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: cleanForAIContext(getMessageText(m)),
                }))
                .filter((m) => m.content);

            // Set the body that HttpChatTransport will use
            requestBodyRef.current = {
                message: content.trim(),
                files: fileContents,
                conversationHistory,
                mode: 'mastra',
                requestId: newRequestId,
                siteId,
                conversationId: effectiveSessionId,
                ...(supabaseContext && { supabaseContext }),
                ...(selectedModel && { selectedModel }),
            };

            // Send via AI SDK useChat - this creates the user message and triggers the API call
            await sendMessage({ text: content.trim() });
        },
        [
            sessionId,
            siteId,
            selectedModel,
            messages,
            getFileContext,
            sendMessage,
            onRequestIdChange,
            onStreamingChange,
            supabaseContext,
        ]
    );

    // Stop generation
    const stopGeneration = useCallback(async () => {
        stop();
        const currentSessionId = sessionIdRef.current;

        // Persist partial content before stopping
        if (currentSessionId && streamingMessageIdRef.current && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'assistant') {
                const text = getMessageText(lastMsg);
                const cleanText = cleanDisplayText(text) || '[Generation stopped by user]';
                try {
                    await supabase.from('messages').update({
                        content: cleanText,
                        metadata: { requestId: requestIdRef.current, status: 'stopped' },
                    }).eq('id', streamingMessageIdRef.current);
                } catch (e) {
                    console.error('[useAIChat] Failed to persist stopped message:', e);
                }
            }
            streamingMessageIdRef.current = null;
        }

        if (currentSessionId) {
            try {
                await supabase
                    .from('chat_sessions')
                    .update({ is_cancelled: true })
                    .eq('id', currentSessionId);
            } catch (err) {
                console.error('[useAIChat] Failed to set cancellation flag:', err);
            }
        }

        onStreamingChange?.(false);
        // Snapshot thinking steps before clearing request ID
        const currentRequestId = requestIdRef.current;
        if (currentRequestId) {
            await onBeforeFinish?.(currentRequestId);
        }
        setRequestId(null);
        requestIdRef.current = null;
        onRequestIdChange?.(null);
    }, [stop, messages, onStreamingChange, onBeforeFinish, onRequestIdChange]);

    // Helper to get clean display text from last assistant message
    const getLastAssistantText = useCallback(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                return cleanDisplayText(getMessageText(messages[i]));
            }
        }
        return '';
    }, [messages]);

    return {
        messages,
        setMessages,
        sendMessage: send,
        stopGeneration,
        status,
        isLoading: status === 'streaming' || status === 'submitted',
        error,
        requestId,
        streamAppliedOps,
        getMessageText,
        cleanDisplayText,
        getLastAssistantText,
    };
}
