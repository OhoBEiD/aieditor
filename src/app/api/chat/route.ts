import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/lib/ai/AIService';

// Main Chat API - now powered by in-app AI
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { siteId, conversationId, userId, message, pageUrl, fileContents, requestId: clientRequestId } = body;

        // Validate required fields
        if (!siteId || !conversationId || !userId || !message) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Use client-provided requestId or generate new one
        const requestId = clientRequestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        console.log(`🚀 Processing AI request: ${requestId}`, { message: message.substring(0, 50) });

        // Process message with in-app AI service
        // Pass fileContents from WebContainer so AI has context
        const result = await processMessage({
            message,
            requestId,
            sessionId: conversationId,
            siteId,
            fileContents: fileContents || {},
            // TODO: Fetch conversation history from Supabase if needed
            conversationHistory: ''
        });

        // Return standardized response
        return NextResponse.json({
            requestId,
            status: 'completed',
            summary: result.output,
            diff: '',
            previewUrl: '', // WebContainer handles preview
            filesModified: result.filesModified,
            filesCreated: result.filesCreated,
            filesDeleted: result.filesDeleted,
            warnings: [],
            iterations: result.iterations,
            toolsUsed: [],
            // WebContainer mode: file operations for frontend to apply
            fileOperations: result.fileOperations,
            useWebContainer: true,
            intent: result.intent,
            // Build validation - client should run npm run build
            requiresBuildValidation: result.requiresBuildValidation,
            buildValidationMessage: result.buildValidationMessage
        });

    } catch (err: any) {
        console.error('Chat API error:', err);
        return NextResponse.json({
            requestId: 'error',
            status: 'error',
            summary: 'Ensure you have set OPENROUTER_API_KEY in .env.local. Error: ' + err.message,
            diff: '',
            previewUrl: '',
            filesChanged: [],
            warnings: [err.message],
        });
    }
}
