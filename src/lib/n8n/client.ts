// n8n Webhook Client - Using Local API Proxy to bypass CORS

// Use local API proxy instead of direct n8n calls
const API_BASE = '/api/webhook';

// ============================================================================
// EDIT-UI FLOW
// ============================================================================

export interface EditUIRequest {
    siteId: string;
    conversationId: string;
    userId: string;
    message: string;
    pageUrl?: string;
    uiContext?: {
        selectedElement?: string;
        currentStyles?: Record<string, string>;
        viewport?: { width: number; height: number };
    };
}

export interface EditUIResponse {
    requestId: string;
    status: 'preview_ready';
    summary: string;
    diff: string;
    previewUrl: string;
    prUrl: string;
    warnings: string[];
}

/**
 * Send an edit request to the AI code editor workflow.
 */
export async function sendEditRequest(request: EditUIRequest): Promise<EditUIResponse> {
    const response = await fetch(`${API_BASE}/edit-ui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `Edit request failed: ${response.status}`);
    }

    return response.json();
}

// ============================================================================
// APPLY FLOW
// ============================================================================

export interface ApplyRequest {
    siteId: string;
    requestId: string;
    userId: string;
}

export interface ApplyResponse {
    status: 'applied';
    commitSha: string;
    mergedPrUrl: string;
}

/**
 * Apply (merge) an approved change request.
 */
export async function applyChanges(request: ApplyRequest): Promise<ApplyResponse> {
    const response = await fetch(`${API_BASE}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `Apply request failed: ${response.status}`);
    }

    return response.json();
}

// ============================================================================
// ROLLBACK FLOW
// ============================================================================

export interface RollbackRequest {
    siteId: string;
    requestId: string;
    userId: string;
}

export interface RollbackResponse {
    status: 'rolled_back';
    revertCommitSha: string;
    revertPrUrl: string;
}

/**
 * Rollback (revert) a previously applied change request.
 */
export async function rollbackChanges(request: RollbackRequest): Promise<RollbackResponse> {
    const response = await fetch(`${API_BASE}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `Rollback request failed: ${response.status}`);
    }

    return response.json();
}

// ============================================================================
// PREVIEW DEPLOY FLOW
// ============================================================================

export interface PreviewDeployRequest {
    clientId: string;
    repoUrl: string;
    branch: string;
    requestId: string;
}

export interface PreviewDeployResponse {
    success: boolean;
    previewUrl: string;
    deploymentId: string;
    status: string;
}

/**
 * Trigger a preview deployment.
 */
export async function triggerPreviewDeploy(request: PreviewDeployRequest): Promise<PreviewDeployResponse> {
    const response = await fetch(`${API_BASE}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `Preview deploy failed: ${response.status}`);
    }

    return response.json();
}

// ============================================================================
// IMAGE UPLOAD (Local only for now)
// ============================================================================

export async function uploadImage(
    clientId: string,
    file: File
): Promise<{ url: string; path: string }> {
    return {
        url: URL.createObjectURL(file),
        path: `uploads/${clientId}/${file.name}`,
    };
}
