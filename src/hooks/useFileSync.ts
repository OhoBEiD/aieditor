'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FileChange {
    type: 'write' | 'delete' | 'replace';
    path: string;
    content?: string;
    oldText?: string;
    newText?: string;
}

interface FileSyncState {
    status: 'idle' | 'connected' | 'syncing' | 'error';
    lastChange: FileChange | null;
    changesCount: number;
}

interface UseFileSyncOptions {
    requestId?: string;
    onFileChange?: (change: FileChange) => Promise<void>;
    onComplete?: () => void;
    onError?: (error: string) => void;
}

export function useFileSync(options: UseFileSyncOptions = {}) {
    const { requestId, onFileChange, onComplete, onError } = options;

    const [state, setState] = useState<FileSyncState>({
        status: 'idle',
        lastChange: null,
        changesCount: 0,
    });

    const eventSourceRef = useRef<EventSource | null>(null);
    const changesQueueRef = useRef<FileChange[]>([]);

    // Connect to n8n execution stream via SSE
    const connect = useCallback(async (reqId: string) => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        setState(s => ({ ...s, status: 'connected' }));

        // For SSE, we'd need an endpoint on your backend
        // For now, we'll use polling as a fallback
        // In production, you'd set up SSE or WebSocket on your n8n or a relay server

        console.log('📡 FileSync connected for request:', reqId);

        // Polling fallback (replace with SSE when you have the endpoint)
        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/execution/status/${reqId}`);
                if (!res.ok) return;

                const data = await res.json();

                if (data.fileChanges && data.fileChanges.length > changesQueueRef.current.length) {
                    const newChanges = data.fileChanges.slice(changesQueueRef.current.length);

                    for (const change of newChanges) {
                        changesQueueRef.current.push(change);
                        setState(s => ({
                            ...s,
                            status: 'syncing',
                            lastChange: change,
                            changesCount: changesQueueRef.current.length,
                        }));

                        if (onFileChange) {
                            await onFileChange(change);
                        }
                    }
                }

                if (data.status === 'complete') {
                    clearInterval(pollInterval);
                    setState(s => ({ ...s, status: 'idle' }));
                    onComplete?.();
                }

                if (data.status === 'error') {
                    clearInterval(pollInterval);
                    setState(s => ({ ...s, status: 'error' }));
                    onError?.(data.error);
                }

            } catch (e) {
                console.warn('FileSync poll error:', e);
            }
        }, 500);

        return () => {
            clearInterval(pollInterval);
        };
    }, [onFileChange, onComplete, onError]);

    // Disconnect
    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        setState(s => ({ ...s, status: 'idle' }));
    }, []);

    // Apply file change directly (used when n8n returns changes in response)
    const applyChanges = useCallback(async (changes: FileChange[]) => {
        for (const change of changes) {
            setState(s => ({
                ...s,
                status: 'syncing',
                lastChange: change,
                changesCount: s.changesCount + 1,
            }));

            if (onFileChange) {
                await onFileChange(change);
            }
        }

        setState(s => ({ ...s, status: 'idle' }));
    }, [onFileChange]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    // Auto-connect when requestId changes
    useEffect(() => {
        if (requestId) {
            connect(requestId);
        }
        return () => {
            disconnect();
        };
    }, [requestId, connect, disconnect]);

    return {
        ...state,
        connect,
        disconnect,
        applyChanges,
        changesQueue: changesQueueRef.current,
    };
}
