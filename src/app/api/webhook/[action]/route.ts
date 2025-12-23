import { NextRequest, NextResponse } from 'next/server';

// Required for Cloudflare Pages
export const runtime = 'edge';

// n8n webhook URLs from environment variables
const WEBHOOKS: Record<string, string | undefined> = {
    'edit-ui': process.env.N8N_WEBHOOK_EDIT_UI,
    'apply': process.env.N8N_WEBHOOK_APPLY,
    'rollback': process.env.N8N_WEBHOOK_ROLLBACK,
    'preview': process.env.N8N_WEBHOOK_PREVIEW,
    'deploy': process.env.N8N_WEBHOOK_DEPLOY,
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ action: string }> }
) {
    const { action } = await params;

    const webhookUrl = WEBHOOKS[action as keyof typeof WEBHOOKS];

    if (!webhookUrl) {
        return NextResponse.json(
            { error: `Unknown action: ${action}` },
            { status: 400 }
        );
    }

    try {
        const body = await request.json();

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        // Get response as text first
        const responseText = await response.text();

        if (!response.ok) {
            return NextResponse.json(
                { error: `Webhook failed: ${responseText || 'Unknown error'}` },
                { status: response.status }
            );
        }

        // Handle empty response
        if (!responseText || responseText.trim() === '') {
            return NextResponse.json(
                { error: 'Empty response from webhook' },
                { status: 502 }
            );
        }

        // Try to parse JSON
        try {
            const data = JSON.parse(responseText);
            return NextResponse.json(data);
        } catch {
            // If not valid JSON, return the raw text as an error
            return NextResponse.json(
                { error: `Invalid JSON response: ${responseText.slice(0, 200)}` },
                { status: 502 }
            );
        }
    } catch (error) {
        console.error('Webhook proxy error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
