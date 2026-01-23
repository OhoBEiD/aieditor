import { NextRequest, NextResponse } from 'next/server';

/**
 * Simplified AI API endpoint for WebContainers
 * 
 * This endpoint:
 * 1. Calls n8n single agent workflow
 * 2. Returns file operations as structured JSON
 * 3. Frontend applies changes via WebContainers
 */

// Use WebContainer-specific endpoint if available, fallback to default
const N8N_WEBHOOK_URL = process.env.N8N_WEBCONTAINER_URL || process.env.N8N_WEBHOOK_URL || 'https://omarsobh.app.n8n.cloud/webhook/webcontainer-ai';

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
    thinkingSteps: { step: number; message: string; status?: string }[];
    error?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message, conversationId, files = {} } = body;

        if (!message) {
            return NextResponse.json({
                success: false,
                error: 'Message is required'
            }, { status: 400 });
        }

        // Call n8n webhook with simplified payload
        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                conversationId,
                mode: 'webcontainer', // Signal to use simplified response format
                existingFiles: Object.keys(files), // List of files in WebContainer
            }),
        });

        if (!n8nResponse.ok) {
            const errorText = await n8nResponse.text();
            console.error('N8N error:', errorText);
            return NextResponse.json({
                success: false,
                error: 'AI service error',
                summary: 'Failed to process request',
                operations: [],
                thinkingSteps: [],
            } as AIResponse, { status: 500 });
        }

        const n8nData = await n8nResponse.json();

        // Parse n8n response into file operations
        const response: AIResponse = {
            success: true,
            summary: n8nData.output || n8nData.summary || 'Changes completed',
            operations: parseFileOperations(n8nData),
            thinkingSteps: parseThinkingSteps(n8nData),
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('AI API error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Unknown error',
            summary: 'An error occurred',
            operations: [],
            thinkingSteps: [],
        } as AIResponse, { status: 500 });
    }
}

/**
 * Parse n8n response into structured file operations
 */
function parseFileOperations(data: any): FileOperation[] {
    const operations: FileOperation[] = [];

    // If n8n returns direct operations array
    if (Array.isArray(data.operations)) {
        return data.operations;
    }

    // Parse from intermediateSteps (current format)
    const steps = data.intermediateSteps || [];
    for (const step of steps) {
        if (!step.result) continue;

        // Parse write_file results
        if (step.tool === 'write_file' && step.input?.path) {
            operations.push({
                type: 'write',
                path: step.input.path,
                content: step.input.content,
            });
        }

        // Parse str_replace results
        if (step.tool === 'str_replace' && step.input?.file) {
            operations.push({
                type: 'modify',
                path: step.input.file,
                oldText: step.input.old_text,
                newText: step.input.new_text,
            });
        }

        // Parse delete results
        if (step.tool === 'delete_file' && step.input?.path) {
            operations.push({
                type: 'delete',
                path: step.input.path,
            });
        }
    }

    // Also check filesModified/filesCreated in metadata
    if (data.filesCreated) {
        for (const file of data.filesCreated) {
            if (!operations.some(op => op.path === file)) {
                operations.push({ type: 'write', path: file });
            }
        }
    }

    return operations;
}

/**
 * Parse thinking steps from n8n response
 */
function parseThinkingSteps(data: any): { step: number; message: string; status?: string }[] {
    const steps: { step: number; message: string; status?: string }[] = [];

    // If n8n returns direct thinkingSteps
    if (Array.isArray(data.thinkingSteps)) {
        return data.thinkingSteps;
    }

    // Parse from intermediateSteps
    const intermediateSteps = data.intermediateSteps || [];
    intermediateSteps.forEach((step: any, index: number) => {
        if (step.tool) {
            steps.push({
                step: index + 1,
                message: `${step.tool}: ${step.input?.path || step.input?.pattern || ''}`,
                status: step.result?.includes('ERROR') ? 'error' : 'complete',
            });
        }
    });

    return steps;
}
