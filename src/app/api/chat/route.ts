import { NextRequest, NextResponse } from 'next/server';

// n8n webhook URL - Self-hosted on Fly.io (10 minute timeout!)
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n-ai-editor.fly.dev/webhook/agent/edit-ui';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { siteId, conversationId, userId, message, pageUrl, uiContext, image, requestId: clientRequestId } = body;

        // Validate required fields
        if (!siteId || !conversationId || !userId || !message) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Use client-provided requestId or generate new one
        const requestId = clientRequestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        // Call n8n webhook and WAIT for response
        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                siteId,
                conversationId,
                userId,
                message,
                pageUrl,
                uiContext,
                requestId,
                image, // Pass image data for vision analysis
                statusCallbackUrl: '', // Not used in sync mode
            }),
        });

        if (!n8nResponse.ok) {
            const errorText = await n8nResponse.text();
            console.error('n8n error:', errorText);
            return NextResponse.json(
                {
                    requestId,
                    status: 'error',
                    summary: 'Failed to process request. Please try again.',
                    diff: '',
                    previewUrl: '',
                    filesChanged: [],
                    warnings: ['Workflow error: ' + errorText.slice(0, 100)]
                },
                { status: 200 } // Return 200 so frontend can display the error message
            );
        }

        const result = await n8nResponse.json();

        // Return the n8n response directly
        return NextResponse.json({
            requestId: result.requestId || requestId,
            status: result.status || 'pending',
            summary: result.summary || 'Changes processed.',
            diff: result.diff || '',
            previewUrl: result.previewUrl || '',
            filesChanged: result.filesChanged || [],
            warnings: result.warnings || [],
        });
    } catch (err) {
        console.error('Chat API error:', err);
        return NextResponse.json({
            requestId: 'error',
            status: 'error',
            summary: 'Something went wrong. Please try again.',
            diff: '',
            previewUrl: '',
            filesChanged: [],
            warnings: [err instanceof Error ? err.message : 'Unknown error'],
        });
    }
}
