// In-memory store for request status and SSE connections
// In production, use Redis or similar for multi-instance support

interface RequestStatus {
    steps: string[];
    complete: boolean;
    result?: {
        summary: string;
        diff?: string;
        filesChanged?: string[];
        previewUrl?: string;
        warnings?: string[];
    };
    error?: string;
    createdAt: Date;
    controller?: ReadableStreamDefaultController<Uint8Array>;
}

const statusStore = new Map<string, RequestStatus>();

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MAX_AGE = 30 * 60 * 1000; // 30 minutes

if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [id, status] of statusStore.entries()) {
            if (now - status.createdAt.getTime() > MAX_AGE) {
                statusStore.delete(id);
            }
        }
    }, CLEANUP_INTERVAL);
}

export function createRequest(requestId: string): void {
    statusStore.set(requestId, {
        steps: [],
        complete: false,
        createdAt: new Date(),
    });
}

export function getRequest(requestId: string): RequestStatus | undefined {
    return statusStore.get(requestId);
}

export function addStep(requestId: string, step: string): void {
    const status = statusStore.get(requestId);
    if (status) {
        status.steps.push(step);
        // Send SSE event if controller exists
        if (status.controller) {
            const data = JSON.stringify({ type: 'step', step });
            status.controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        }
    }
}

export function completeRequest(
    requestId: string,
    result: RequestStatus['result']
): void {
    const status = statusStore.get(requestId);
    if (status) {
        status.complete = true;
        status.result = result;
        // Send final SSE event
        if (status.controller) {
            const data = JSON.stringify({ type: 'complete', result });
            status.controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            status.controller.close();
        }
    }
}

export function setError(requestId: string, error: string): void {
    const status = statusStore.get(requestId);
    if (status) {
        status.complete = true;
        status.error = error;
        if (status.controller) {
            const data = JSON.stringify({ type: 'error', error });
            status.controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            status.controller.close();
        }
    }
}

export function setController(
    requestId: string,
    controller: ReadableStreamDefaultController<Uint8Array>
): void {
    const status = statusStore.get(requestId);
    if (status) {
        status.controller = controller;
        // Send any existing steps
        for (const step of status.steps) {
            const data = JSON.stringify({ type: 'step', step });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        }
        // If already complete, send result
        if (status.complete) {
            if (status.result) {
                const data = JSON.stringify({ type: 'complete', result: status.result });
                controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            } else if (status.error) {
                const data = JSON.stringify({ type: 'error', error: status.error });
                controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            }
            controller.close();
        }
    }
}

export function deleteRequest(requestId: string): void {
    statusStore.delete(requestId);
}
