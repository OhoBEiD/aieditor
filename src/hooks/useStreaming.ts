'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ThinkingStep {
    text: string;
    status: 'pending' | 'complete' | 'error';
}

interface StreamResult {
    summary: string;
    diff?: string;
    filesChanged?: string[];
    previewUrl?: string;
    warnings?: string[];
}

interface UseStreamingOptions {
    onStep?: (step: string) => void;
    onComplete?: (result: StreamResult) => void;
    onError?: (error: string) => void;
}

export function useStreaming(options: UseStreamingOptions = {}) {
    const [steps, setSteps] = useState<ThinkingStep[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [result, setResult] = useState<StreamResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const startStreaming = useCallback((requestId: string) => {
        // Reset state
        setSteps([]);
        setResult(null);
        setError(null);
        setIsStreaming(true);

        // Close any existing connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        // Connect to SSE endpoint
        const eventSource = new EventSource(`/api/chat/stream/${requestId}`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                switch (data.type) {
                    case 'connected':
                        // Connection established
                        break;

                    case 'step':
                        setSteps((prev) => {
                            // Mark previous steps as complete
                            const updated = prev.map((s) => ({
                                ...s,
                                status: 'complete' as const,
                            }));
                            // Add new step as pending
                            return [
                                ...updated,
                                { text: data.step, status: 'pending' as const },
                            ];
                        });
                        options.onStep?.(data.step);
                        break;

                    case 'complete':
                        setSteps((prev) =>
                            prev.map((s) => ({ ...s, status: 'complete' as const }))
                        );
                        setResult(data.result);
                        setIsStreaming(false);
                        eventSource.close();
                        options.onComplete?.(data.result);
                        break;

                    case 'error':
                        setSteps((prev) =>
                            prev.map((s, i) =>
                                i === prev.length - 1
                                    ? { ...s, status: 'error' as const }
                                    : s
                            )
                        );
                        setError(data.error);
                        setIsStreaming(false);
                        eventSource.close();
                        options.onError?.(data.error);
                        break;
                }
            } catch (e) {
                console.error('Failed to parse SSE data:', e);
            }
        };

        eventSource.onerror = () => {
            setIsStreaming(false);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [options]);

    const stopStreaming = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        setIsStreaming(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    return {
        steps,
        isStreaming,
        result,
        error,
        startStreaming,
        stopStreaming,
    };
}
