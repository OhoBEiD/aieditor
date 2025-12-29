import { NextRequest, NextResponse } from 'next/server';
import { addStep, completeRequest, setError, getRequest } from '@/lib/statusStore';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { requestId, type, step, result, error } = body;

        if (!requestId) {
            return NextResponse.json(
                { error: 'Missing requestId' },
                { status: 400 }
            );
        }

        const status = getRequest(requestId);
        if (!status) {
            // Request might not exist yet - create it implicitly
            console.log(`Request ${requestId} not found, ignoring status update`);
            return NextResponse.json({ ok: true, ignored: true });
        }

        switch (type) {
            case 'thinking':
            case 'step':
                if (step) {
                    addStep(requestId, step);
                }
                break;

            case 'complete':
                completeRequest(requestId, result || {
                    summary: 'Changes completed.',
                });
                break;

            case 'error':
                setError(requestId, error || 'Unknown error');
                break;

            default:
                // Treat unknown type as a step if step is provided
                if (step) {
                    addStep(requestId, step);
                }
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Status update error:', err);
        return NextResponse.json(
            { error: 'Invalid request' },
            { status: 400 }
        );
    }
}
