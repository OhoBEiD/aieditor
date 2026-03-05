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
    getFileContext,
    applyFileOperations,
    onRequestIdChange,
    onBeforeFinish,
    onStreamingChange,
    onFileOpsApplied,
    supabaseContext,
}: UseAIChatOptions) {
    const [requestId, setRequestId] = useState<string | null>(null);
    const [streamAppliedOps, setStreamAppliedOps] = useState(0);
    const appliedOpsRef = useRef(0);
    const processedOpsRef = useRef(new Set<string>());
    const requestBodyRef = useRef<any>(null);

    const {
        messages,
        setMessages,
        sendMessage,
        stop,
        status,
        error,
    } = useChat({
        id: sessionId || undefined,
        transport: new DefaultChatTransport({
            api: '/api/ai/chat',
            body: () => requestBodyRef.current || {},
        }),
        onFinish: async ({ message }) => {
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

            // Persist assistant message to Supabase
            if (sessionId) {
                const cleanText = cleanDisplayText(text);
                if (cleanText) {
                    try {
                        await supabase.from('messages').insert({
                            session_id: sessionId,
                            role: 'assistant',
                            content: cleanText,
                            metadata: { requestId: requestId, status: 'completed' },
                        });
                    } catch (err) {
                        console.error('[useAIChat] Failed to persist assistant message:', err);
                    }
                }
            }

            onStreamingChange?.(false);
            // Snapshot thinking steps before clearing request ID
            if (requestId) {
                await onBeforeFinish?.(requestId);
            }
            setRequestId(null);
            onRequestIdChange?.(null);

            if (appliedOpsRef.current > 0) {
                onFileOpsApplied?.(appliedOpsRef.current);
            }
        },
        onError: (err) => {
            console.error('[useAIChat] Error:', err);
            onStreamingChange?.(false);
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

    // Send message with full context
    const send = useCallback(
        async (content: string, _image?: File) => {
            if (!content.trim()) return;

            const newRequestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            setRequestId(newRequestId);
            onRequestIdChange?.(newRequestId);
            onStreamingChange?.(true);
            appliedOpsRef.current = 0;
            processedOpsRef.current = new Set();
            setStreamAppliedOps(0);

            // Reset cancellation flag
            if (sessionId) {
                await supabase
                    .from('chat_sessions')
                    .update({ is_cancelled: false })
                    .eq('id', sessionId);
            }

            // Persist user message to Supabase
            if (sessionId) {
                try {
                    await supabase.from('messages').insert({
                        session_id: sessionId,
                        role: 'user',
                        content: content.trim(),
                    });
                } catch (err) {
                    console.error('[useAIChat] Failed to persist user message:', err);
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
                conversationId: sessionId,
                ...(supabaseContext && { supabaseContext }),
            };

            // Send via AI SDK useChat - this creates the user message and triggers the API call
            await sendMessage({ text: content.trim() });
        },
        [
            sessionId,
            siteId,
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

        if (sessionId) {
            try {
                await supabase
                    .from('chat_sessions')
                    .update({ is_cancelled: true })
                    .eq('id', sessionId);
            } catch (err) {
                console.error('[useAIChat] Failed to set cancellation flag:', err);
            }
        }

        onStreamingChange?.(false);
        // Snapshot thinking steps before clearing request ID
        if (requestId) {
            await onBeforeFinish?.(requestId);
        }
        setRequestId(null);
        onRequestIdChange?.(null);
    }, [sessionId, stop, requestId, onStreamingChange, onBeforeFinish, onRequestIdChange]);

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
