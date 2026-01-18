import { NextRequest, NextResponse } from 'next/server';

// In-memory store for file changes (in production, use Redis)
const executionChanges: Map<string, {
    status: 'running' | 'complete' | 'error';
    fileChanges: Array<{
        type: 'write' | 'delete' | 'replace';
        path: string;
        content?: string;
        oldText?: string;
        newText?: string;
    }>;
    error?: string;
}> = new Map();

// POST - Receive file changes from n8n
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> }
) {
    try {
        const { requestId } = await params;
        const body = await request.json();

        const { type, path, content, oldText, newText, status } = body;

        // Get or create execution record
        let execution = executionChanges.get(requestId);
        if (!execution) {
            execution = { status: 'running', fileChanges: [] };
            executionChanges.set(requestId, execution);
        }

        // Add file change
        if (type && path) {
            execution.fileChanges.push({
                type,
                path,
                content,
                oldText,
                newText,
            });
        }

        // Update status if provided
        if (status) {
            execution.status = status;
        }

        // Clean up old executions after 5 minutes
        setTimeout(() => {
            executionChanges.delete(requestId);
        }, 5 * 60 * 1000);

        return NextResponse.json({
            success: true,
            changesCount: execution.fileChanges.length
        });

    } catch (error: any) {
        console.error('File change error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

// GET - Poll for file changes (SSE alternative)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> }
) {
    try {
        const { requestId } = await params;

        const execution = executionChanges.get(requestId);

        if (!execution) {
            return NextResponse.json({
                status: 'unknown',
                fileChanges: [],
            });
        }

        return NextResponse.json({
            status: execution.status,
            fileChanges: execution.fileChanges,
            error: execution.error,
        });

    } catch (error: any) {
        console.error('Get changes error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
