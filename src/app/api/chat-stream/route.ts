import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// n8n webhook URL
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n-ai-editor.fly.dev/webhook/agent/edit-ui';

// Supabase client for polling thinking_steps
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jjrbnjubjiswvxeradzw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { siteId, conversationId, userId, message, pageUrl, uiContext, image, requestId: clientRequestId, executorMode } = body;

    // Validate required fields
    if (!siteId || !conversationId || !userId || !message) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Generate request ID
    const requestId = clientRequestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Create SSE response stream
    const encoder = new TextEncoder();
    let isComplete = false;
    let lastStepCount = 0;
    let n8nResult: Record<string, unknown> | null = null;

    const stream = new ReadableStream({
        async start(controller) {
            // Helper to send SSE events
            const sendEvent = (event: string, data: unknown) => {
                const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(message));
            };

            // Send initial connection event
            sendEvent('connected', { requestId, message: 'Processing your request...' });

            // Start n8n request in background (non-blocking)
            const n8nPromise = fetch(N8N_WEBHOOK_URL, {
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
                    image,
                    executorMode,
                }),
            }).then(async (res) => {
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText);
                }
                const text = await res.text();
                return text ? JSON.parse(text) : {};
            }).catch((err) => {
                console.error('n8n error:', err);
                return { error: err.message, status: 'error' };
            });

            // Poll for thinking steps while n8n is processing
            const pollInterval = setInterval(async () => {
                if (isComplete) {
                    clearInterval(pollInterval);
                    return;
                }

                try {
                    const { data: steps, error } = await supabase
                        .from('thinking_steps')
                        .select('*')
                        .eq('request_id', requestId)
                        .order('step_number', { ascending: true });

                    if (error) {
                        console.error('Supabase poll error:', error);
                        return;
                    }

                    // Send any new steps
                    if (steps && steps.length > lastStepCount) {
                        const newSteps = steps.slice(lastStepCount);
                        for (const step of newSteps) {
                            sendEvent('thinking', {
                                id: step.id,
                                stepNumber: step.step_number,
                                toolName: step.tool_name,
                                status: step.status,
                                message: step.message,
                                details: step.details,
                            });
                        }
                        lastStepCount = steps.length;
                    }
                } catch (e) {
                    console.error('Poll error:', e);
                }
            }, 500); // Poll every 500ms

            // Wait for n8n to complete
            try {
                n8nResult = await n8nPromise;
                isComplete = true;
                clearInterval(pollInterval);

                // Extract summary from various possible locations
                const result = n8nResult as Record<string, unknown>;
                const plan = result.plan as Record<string, unknown> | undefined;
                const summary =
                    (result.summary as string) ||
                    (result.output as string) ||
                    (plan?.humanSummary as string) ||
                    'Changes processed.';

                // Send final complete event with fileOperations for WebContainer
                sendEvent('complete', {
                    requestId: result.requestId || requestId,
                    status: result.status || 'preview_ready',
                    summary,
                    previewUrl: result.previewUrl || '',
                    filesModified: result.filesModified || [],
                    filesCreated: result.filesCreated || [],
                    filesDeleted: result.filesDeleted || [],
                    fileOperations: result.fileOperations || [], // Critical for WebContainer
                    useWebContainer: result.useWebContainer || false,
                    warnings: (plan?.warnings as string[]) || result.warnings || [],
                    iterations: result.iterations || 0,
                    toolsUsed: result.toolsUsed || [],
                });
            } catch (err) {
                sendEvent('error', {
                    requestId,
                    message: err instanceof Error ? err.message : 'Unknown error',
                });
            }

            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
    });
}
