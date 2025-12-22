import { NextRequest, NextResponse } from 'next/server';

// n8n webhook URLs from environment variables
const WEBHOOKS: Record<string, string | undefined> = {
    'edit-ui': process.env.N8N_WEBHOOK_EDIT_UI,
    'apply': process.env.N8N_WEBHOOK_APPLY,
    'rollback': process.env.N8N_WEBHOOK_ROLLBACK,
    'preview': process.env.N8N_WEBHOOK_PREVIEW,
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

        if (!response.ok) {
            const error = await response.text();
            return NextResponse.json(
                { error: `Webhook failed: ${error}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Webhook proxy error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
