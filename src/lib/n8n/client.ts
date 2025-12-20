// n8n Webhook Client - Synced with AI Code Editor Workflow

const N8N_BASE_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || '';

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
 * Creates a PR with the proposed changes.
 */
export async function sendEditRequest(request: EditUIRequest): Promise<EditUIResponse> {
    if (!N8N_BASE_URL) {
        throw new Error('N8N_WEBHOOK_URL is not configured');
    }

    const response = await fetch(`${N8N_BASE_URL}/agent/edit-ui`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
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
    if (!N8N_BASE_URL) {
        throw new Error('N8N_WEBHOOK_URL is not configured');
    }

    const response = await fetch(`${N8N_BASE_URL}/agent/apply`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
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
    if (!N8N_BASE_URL) {
        throw new Error('N8N_WEBHOOK_URL is not configured');
    }

    const response = await fetch(`${N8N_BASE_URL}/agent/rollback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Rollback request failed: ${response.status} - ${error}`);
    }

    return response.json();
}

// ============================================================================
// LEGACY COMPATIBILITY (for existing code)
// ============================================================================

export interface ChatRequest {
    session_id: string;
    client_id: string;
    message: string;
    selected_files?: string[];
}

export interface ChatResponse {
    response: string;
    code_changes?: Array<{
        file_path: string;
        action: 'create' | 'modify' | 'delete';
        content: string;
        diff?: string;
    }>;
    suggested_actions?: string[];
}

/**
 * @deprecated Use sendEditRequest instead
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
    // Map legacy format to new format
    const editRequest: EditUIRequest = {
        siteId: request.client_id,
        conversationId: request.session_id,
        userId: request.client_id,
        message: request.message,
    };

    const editResponse = await sendEditRequest(editRequest);

    // Map new response to legacy format
    return {
        response: editResponse.summary,
        suggested_actions: editResponse.warnings,
    };
}

/**
 * @deprecated Use rollbackChanges instead
 */
export async function revertChanges(request: { client_id: string; version_id: string }): Promise<{
    success: boolean;
    message: string;
    restored_files?: string[];
}> {
    const rollbackRequest: RollbackRequest = {
        siteId: request.client_id,
        requestId: request.version_id,
        userId: request.client_id,
    };

    const rollbackResponse = await rollbackChanges(rollbackRequest);

    return {
        success: rollbackResponse.status === 'rolled_back',
        message: `Reverted to ${rollbackResponse.revertCommitSha}`,
    };
}

/**
 * Upload an image (placeholder - workflow doesn't include this endpoint)
 */
export async function uploadImage(
    clientId: string,
    file: File
): Promise<{ url: string; path: string }> {
    // TODO: Implement image upload endpoint in n8n workflow
    console.warn('Image upload not yet implemented in workflow');

    // Return a mock response for now
    return {
        url: URL.createObjectURL(file),
        path: `uploads/${clientId}/${file.name}`,
    };
}
