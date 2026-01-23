import { NextRequest, NextResponse } from 'next/server';

/**
 * Stop n8n workflow execution API
 * 
 * Uses n8n API to stop running workflow executions
 * This allows the stop button to actually cancel the AI processing
 */

const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://omarsobh.app.n8n.cloud/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ZjFkOGM1NS01YzFkLTRhYmQtOTdjYS04ZmY2OTc2MmY0NTIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY4OTUxMTYxfQ.k0Lpp2CyBjEOXXhTTQDlzZP4XpufpSPrN1PDZlY3KAw';

export async function POST(request: NextRequest) {
    try {
        const { executionId } = await request.json();

        if (!executionId) {
            return NextResponse.json({ error: 'executionId is required' }, { status: 400 });
        }

        if (!N8N_API_KEY) {
            console.warn('N8N_API_KEY not configured');
            return NextResponse.json({
                error: 'N8N API not configured',
                stopped: false
            }, { status: 500 });
        }

        console.log(`[n8n] Stopping execution: ${executionId}`);

        // Call n8n API to stop the execution
        // https://docs.n8n.io/api/api-reference/#tag/Execution/paths/~1executions~1{id}/delete
        const response = await fetch(`${N8N_BASE_URL}/executions/${executionId}/stop`, {
            method: 'POST',
            headers: {
                'X-N8N-API-KEY': N8N_API_KEY,
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            console.log(`[n8n] Execution ${executionId} stopped successfully`);
            return NextResponse.json({
                stopped: true,
                executionId
            });
        } else {
            const errorText = await response.text();
            console.error(`[n8n] Failed to stop execution: ${response.status}`, errorText);
            return NextResponse.json({
                stopped: false,
                error: `n8n API error: ${response.status}`
            }, { status: response.status });
        }

    } catch (error: any) {
        console.error('[n8n] Stop execution error:', error);
        return NextResponse.json({
            stopped: false,
            error: error.message
        }, { status: 500 });
    }
}
