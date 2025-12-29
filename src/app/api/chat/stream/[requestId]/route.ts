import { NextRequest, NextResponse } from 'next/server';
import { getRequest, setController } from '@/lib/statusStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> }
) {
    const { requestId } = await params;

    const status = getRequest(requestId);
    if (!status) {
        return NextResponse.json(
            { error: 'Request not found' },
            { status: 404 }
        );
    }

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            // Register this controller to receive updates
            setController(requestId, controller);

            // Send initial connection event
            const data = JSON.stringify({ type: 'connected', requestId });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        },
        cancel() {
            // Client disconnected
            console.log(`SSE client disconnected for ${requestId}`);
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
