// n8n Webhook Client - Connected to Live Webhooks

// Webhook URLs - Update these or use environment variables
const EDIT_URL = process.env.NEXT_PUBLIC_N8N_EDIT_URL || 'https://daveisgm05.app.n8n.cloud/webhook/agent/edit-ui';
const APPLY_URL = process.env.NEXT_PUBLIC_N8N_APPLY_URL || 'https://daveisgm05.app.n8n.cloud/webhook/agent/apply';
const ROLLBACK_URL = process.env.NEXT_PUBLIC_N8N_ROLLBACK_URL || 'https://daveisgm05.app.n8n.cloud/webhook/agent/rollback';
const PREVIEW_URL = process.env.NEXT_PUBLIC_N8N_PREVIEW_URL || 'https://daveisgm05.app.n8n.cloud/webhook-test/preview/deploy';

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
    const response = await fetch(EDIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Edit request failed: ${response.status} - ${error}`);
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
    const response = await fetch(APPLY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Apply request failed: ${response.status} - ${error}`);
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
    const response = await fetch(ROLLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Rollback request failed: ${response.status} - ${error}`);
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
    const response = await fetch(PREVIEW_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Preview deploy failed: ${response.status} - ${error}`);
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
    // For now, just return a local blob URL
    return {
        url: URL.createObjectURL(file),
        path: `uploads/${clientId}/${file.name}`,
    };
}
