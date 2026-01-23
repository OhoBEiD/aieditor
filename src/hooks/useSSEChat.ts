import { useState, useCallback, useRef, useEffect } from 'react';
import type { ThinkingStep } from '@/components/chat/ThinkingSteps';

export interface SSEChatResult {
    requestId: string;
    status: string;
    summary: string;
    previewUrl: string;
    filesModified: string[];
    filesCreated: string[];
    filesDeleted: string[];
    warnings: string[];
    iterations: number;
    toolsUsed: string[];
}

export interface UseSSEChatOptions {
    onThinkingStep?: (step: ThinkingStep) => void;
    onComplete?: (result: SSEChatResult) => void;
    onError?: (error: string) => void;
}

export function useSSEChat(options: UseSSEChatOptions = {}) {
    const [isStreaming, setIsStreaming] = useState(false);
    const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
    const [result, setResult] = useState<SSEChatResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    const sendMessage = useCallback(async (payload: {
        siteId: string;
        conversationId: string;
        userId: string;
        message: string;
        image?: string;
        executorMode?: string;
    }) => {
        // Reset state
        setIsStreaming(true);
        setThinkingSteps([]);
        setResult(null);
        setError(null);

        // Create abort controller
        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('/api/chat-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE events from buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                let currentEvent = '';
                let currentData = '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        currentData = line.slice(6);

                        // Process the event
                        if (currentEvent && currentData) {
                            try {
                                const data = JSON.parse(currentData);

                                switch (currentEvent) {
                                    case 'thinking':
                                        const step: ThinkingStep = {
                                            id: data.id || `step-${Date.now()}`,
                                            text: data.message,
                                            status: data.status === 'complete' ? 'complete' :
                                                data.status === 'error' ? 'error' : 'running',
                                            toolName: data.toolName,
                                            created_at: new Date().toISOString(),
                                        };
                                        setThinkingSteps(prev => [...prev, step]);
                                        options.onThinkingStep?.(step);
                                        break;

                                    case 'complete':
                                        const completeResult: SSEChatResult = {
                                            requestId: data.requestId,
                                            status: data.status,
                                            summary: data.summary,
                                            previewUrl: data.previewUrl,
                                            filesModified: data.filesModified || [],
                                            filesCreated: data.filesCreated || [],
                                            filesDeleted: data.filesDeleted || [],
                                            warnings: data.warnings || [],
                                            iterations: data.iterations || 0,
                                            toolsUsed: data.toolsUsed || [],
                                        };
                                        setResult(completeResult);
                                        options.onComplete?.(completeResult);
                                        break;

                                    case 'error':
                                        setError(data.message);
                                        options.onError?.(data.message);
                                        break;
                                }
                            } catch (e) {
                                console.error('Failed to parse SSE data:', currentData, e);
                            }
                        }
                        currentEvent = '';
                        currentData = '';
                    }
                }
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                const errorMsg = err.message;
                setError(errorMsg);
                options.onError?.(errorMsg);
            }
        } finally {
            setIsStreaming(false);
        }
    }, [options]);

    const cancel = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsStreaming(false);
    }, []);

    const clearSteps = useCallback(() => {
        setThinkingSteps([]);
    }, []);

    return {
        sendMessage,
        cancel,
        clearSteps,
        isStreaming,
        thinkingSteps,
        result,
        error,
    };
}
