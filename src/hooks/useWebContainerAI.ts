'use client';

import { useState, useCallback } from 'react';
import { useWebContainer } from './useWebContainer';

interface ThinkingStep {
    step: number;
    message: string;
    status?: 'running' | 'complete' | 'error';
}

interface FileOperation {
    type: 'write' | 'delete' | 'modify';
    path: string;
    content?: string;
    oldText?: string;
    newText?: string;
}

interface AIResponse {
    success: boolean;
    summary: string;
    operations: FileOperation[];
    thinkingSteps: ThinkingStep[];
    error?: string;
}

interface UseWebContainerAIOptions {
    onThinkingStep?: (step: ThinkingStep) => void;
    onFileChange?: (path: string, operation: 'write' | 'modify' | 'delete') => void;
    onComplete?: (summary: string) => void;
    onError?: (error: string) => void;
}

export function useWebContainerAI(options: UseWebContainerAIOptions = {}) {
    const { onThinkingStep, onFileChange, onComplete, onError } = options;

    const [isProcessing, setIsProcessing] = useState(false);
    const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
    const [lastSummary, setLastSummary] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const {
        applyFileChanges,
        listFiles,
        status: wcStatus,
    } = useWebContainer();

    /**
     * Send a message to the AI and apply resulting file changes to WebContainer
     */
    const sendMessage = useCallback(async (
        message: string,
        conversationId?: string
    ): Promise<{ success: boolean; summary: string; filesChanged: number }> => {
        setIsProcessing(true);
        setError(null);
        setThinkingSteps([]);
        setLastSummary(null);

        // Add initial thinking step
        const initialStep: ThinkingStep = { step: 0, message: 'Sending to AI...', status: 'running' };
        setThinkingSteps([initialStep]);
        onThinkingStep?.(initialStep);

        try {
            // Get existing files to provide context
            const existingFiles = await listFiles();

            // Call AI API
            const response = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    conversationId,
                    files: Object.fromEntries(existingFiles.map(f => [f, true])),
                }),
            });

            if (!response.ok) {
                throw new Error(`AI request failed: ${response.status}`);
            }

            const data: AIResponse = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'AI request failed');
            }

            // Update thinking steps from AI response
            if (data.thinkingSteps.length > 0) {
                setThinkingSteps(data.thinkingSteps);
                data.thinkingSteps.forEach(step => onThinkingStep?.(step));
            }

            // Apply file operations to WebContainer
            if (data.operations.length > 0) {
                const applyingStep: ThinkingStep = {
                    step: data.thinkingSteps.length + 1,
                    message: 'Applying changes...',
                    status: 'running'
                };
                setThinkingSteps(prev => [...prev, applyingStep]);
                onThinkingStep?.(applyingStep);

                const { success, applied, errors } = await applyFileChanges(
                    data.operations,
                    (step, total, msg) => {
                        const progressStep: ThinkingStep = {
                            step: data.thinkingSteps.length + step + 1,
                            message: msg,
                            status: 'running'
                        };
                        onThinkingStep?.(progressStep);
                    }
                );

                // Notify about each file change
                for (const op of data.operations) {
                    onFileChange?.(op.path, op.type);
                }

                if (!success && errors.length > 0) {
                    console.error('Some file operations failed:', errors);
                }

                // Final step
                const completeStep: ThinkingStep = {
                    step: 999,
                    message: `Applied ${applied} file changes`,
                    status: 'complete'
                };
                setThinkingSteps(prev => [...prev.slice(0, -1), completeStep]);
                onThinkingStep?.(completeStep);
            }

            setLastSummary(data.summary);
            onComplete?.(data.summary);

            return {
                success: true,
                summary: data.summary,
                filesChanged: data.operations.length,
            };

        } catch (err: any) {
            const errorMsg = err.message || 'Unknown error';
            setError(errorMsg);

            const errorStep: ThinkingStep = {
                step: 999,
                message: `Error: ${errorMsg}`,
                status: 'error'
            };
            setThinkingSteps(prev => [...prev, errorStep]);
            onThinkingStep?.(errorStep);
            onError?.(errorMsg);

            return {
                success: false,
                summary: errorMsg,
                filesChanged: 0,
            };
        } finally {
            setIsProcessing(false);
        }
    }, [applyFileChanges, listFiles, onThinkingStep, onFileChange, onComplete, onError]);

    /**
     * Clear thinking steps and state
     */
    const clearState = useCallback(() => {
        setThinkingSteps([]);
        setLastSummary(null);
        setError(null);
    }, []);

    return {
        sendMessage,
        clearState,
        isProcessing,
        thinkingSteps,
        lastSummary,
        error,
        webContainerStatus: wcStatus,
    };
}
