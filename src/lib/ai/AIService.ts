// Main AI Service - orchestrates intent classification and execution
// This is the primary entry point for chat messages

import { classifyIntent, ClassificationResult } from './agents/IntentClassifier';
import { executeWithTools } from './agents/Executor';
import { executeVercelUIAgent } from './agents/VercelUIAgent';
import { FileOperation } from './tools';
import { createClient } from '@supabase/supabase-js';
import { QUESTION_RESPONDER_PROMPT } from './prompts/system';

export interface AIServiceRequest {
    message: string;
    requestId: string;
    sessionId?: string;
    siteId?: string;
    fileContents?: Record<string, string>;
    conversationHistory?: string;
}

export interface AIServiceResponse {
    output: string;
    intent: ClassificationResult | { type: string; confidence: number; needsPlanner?: boolean; source: string };
    fileOperations: FileOperation[];
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
    isDirectResponse: boolean;
    iterations: number;
    useWebContainer: boolean;
    requiresBuildValidation?: boolean;
    buildValidationMessage?: string;
}

// Supabase client for thinking_steps
export function getSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

// Emit thinking step to Supabase for UI feedback
export async function emitStep(
    requestId: string,
    siteId: string,
    stepNumber: number,
    toolName: string,
    status: string,
    message: string,
    details?: Record<string, any>,
    sessionId?: string
) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Validate all required fields to prevent undefined data errors
    const safeRequestId = requestId || `req_${Date.now()}`;
    const safeSiteId = siteId || 'unknown';
    const safeStepNumber = typeof stepNumber === 'number' ? stepNumber : 0;
    const safeToolName = toolName || 'thinking';
    const safeStatus = status || 'running';
    const safeMessage = String(message || 'Processing...').substring(0, 300);

    try {
        await supabase.from('thinking_steps').upsert({
            request_id: safeRequestId,
            site_id: safeSiteId,
            conversation_id: sessionId || null,
            step_number: safeStepNumber,
            tool_name: safeToolName,
            status: safeStatus,
            message: safeMessage,
            details: details || {}
        }, { onConflict: 'request_id, step_number' });
    } catch (e) {
        console.error('Failed to emit step:', e);
    }
}

// Handle question-type requests
async function handleQuestion(request: AIServiceRequest): Promise<AIServiceResponse> {
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_KEY) {
        return {
            output: 'AI service not configured',
            intent: { type: 'question', confidence: 1, needsPlanner: false, source: 'fallback' },
            fileOperations: [],
            filesCreated: [],
            filesModified: [],
            filesDeleted: [],
            isDirectResponse: true,
            iterations: 0,
            useWebContainer: false
        };
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_KEY}`,
                'HTTP-Referer': 'https://automate.ai',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'google/gemini-3-flash-preview',
                messages: [
                    { role: 'system', content: QUESTION_RESPONDER_PROMPT },
                    {
                        role: 'user',
                        content: `Conversation history:\n${request.conversationHistory || 'No prior context.'}\n\nQuestion: ${request.message}`
                    }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        const output = data.choices?.[0]?.message?.content || 'I couldn\'t understand the question.';

        return {
            output,
            intent: { type: 'question', confidence: 1, needsPlanner: false, source: 'llm' },
            fileOperations: [],
            filesCreated: [],
            filesModified: [],
            filesDeleted: [],
            isDirectResponse: true,
            iterations: 0,
            useWebContainer: false
        };
    } catch (e: any) {
        return {
            output: 'Error: ' + e.message,
            intent: { type: 'question', confidence: 1, needsPlanner: false, source: 'fallback' },
            fileOperations: [],
            filesCreated: [],
            filesModified: [],
            filesDeleted: [],
            isDirectResponse: true,
            iterations: 0,
            useWebContainer: false
        };
    }
}

// Main process function
export async function processMessage(request: AIServiceRequest): Promise<AIServiceResponse> {
    let stepCounter = 1;
    const siteId = request.siteId || 'unknown';
    const sessionId = request.sessionId;

    // Emit initial step
    await emitStep(request.requestId, siteId, stepCounter++, 'thinking', 'running', 'Analyzing request & project context...', undefined, sessionId);

    // Fetch conversation history from Supabase if not provided
    let history: any[] = [];
    if (sessionId) {
        const supabase = getSupabaseClient();
        if (supabase) {
            // Explicitly fetch from messages table linked by session_id
            const { data, error } = await supabase
                .from('messages')
                .select('role, content')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) {
                console.error(`[AIService] Error fetching history for session ${sessionId}:`, error);
            } else if (data) {
                // Reverse to get chronological order
                history = data.reverse();
                console.log(`[AIService] Context loaded: ${history.length} messages found for session ${sessionId}`);
            }
        }
    }

    // Step 1: Classify intent
    const intent = await classifyIntent(request.message);
    console.log('📊 Intent:', intent);

    await emitStep(request.requestId, siteId, stepCounter++, 'classifying', 'complete', `Categorized request as ${intent.type}`, undefined, sessionId);

    // Step 2: Handle based on intent type
    if (intent.type === 'question') {
        return handleQuestion(request);
    }

    if (intent.type === 'clarification') {
        return {
            output: 'Could you please provide more details about what you\'d like to build?',
            intent,
            fileOperations: [],
            filesCreated: [],
            filesModified: [],
            filesDeleted: [],
            isDirectResponse: true,
            iterations: 0,
            useWebContainer: false
        };
    }

    // High level planning step
    await emitStep(request.requestId, siteId, stepCounter++, 'planning', 'running', 'Synthesizing implementation plan...', undefined, sessionId);

    // Generate a concise plan
    let planText = '';
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (OPENROUTER_KEY) {
        try {
            const planResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_KEY}`,
                    'HTTP-Referer': 'https://automate.ai',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'google/gemini-3-flash-preview',
                    messages: [
                        { role: 'system', content: 'You are a technical architect. Create a concise, 3-5 bullet point implementation plan for the following request. Focus on file changes.' },
                        { role: 'user', content: request.message }
                    ],
                    temperature: 0.1
                })
            });
            const planData = await planResponse.json();
            planText = planData.choices?.[0]?.message?.content || '';
        } catch (e) {
            console.error('Failed to generate plan:', e);
        }
    }

    await emitStep(request.requestId, siteId, stepCounter - 1, 'planning', 'complete', 'Plan finalized.', { content: planText }, sessionId);

    // Step 3: Route to appropriate agent based on intent
    // UI tasks -> Vercel AI SDK, Backend tasks -> Mastra (via API), General -> Executor
    if (intent.type === 'ui_task') {
        await emitStep(request.requestId, siteId, stepCounter++, 'routing', 'complete', 'Routing to UI Agent (Vercel AI SDK)', undefined, sessionId);

        const uiResult = await executeVercelUIAgent({
            message: request.message + (planText ? `\n\nIMPLEMENTATION PLAN:\n${planText}` : ''),
            fileContents: request.fileContents || {},
            requestId: request.requestId,
            siteId: siteId,
            sessionId: sessionId,
            onStep: async (toolName, status, message, details, stepIndex) => {
                const finalStepNumber = stepIndex !== undefined ? stepIndex : stepCounter++;
                await emitStep(request.requestId, siteId, finalStepNumber, toolName, status, message, details, sessionId);
            }
        });

        // Emit "task completed" BEFORE returning the response
        await emitStep(request.requestId, siteId, 999, 'complete', 'complete', `Task completed with ${uiResult.fileOperations.length} components.`, undefined, sessionId);

        return {
            output: uiResult.output || "Task completed.",
            intent,
            fileOperations: uiResult.fileOperations.map(op => ({
                type: op.type === 'read' ? 'write' : op.type,
                path: op.path || "",
                content: op.content || ""
            })) as FileOperation[],
            filesCreated: uiResult.fileOperations.filter(o => o.type === 'write').map(o => o.path),
            filesModified: uiResult.fileOperations.filter(o => o.type === 'modify').map(o => o.path),
            filesDeleted: [],
            isDirectResponse: false,
            iterations: uiResult.iterations,
            useWebContainer: true
        };
    }

    // Backend tasks are routed to Mastra (handled by /api/mastra)
    // For now, we'll also use the Executor for backend tasks when called through this service
    // The frontend will call /api/mastra directly for backend_task intents

    // Step 3: Execute (for simple_edit, complex_feature, or backend_task)
    const result = await executeWithTools({
        message: request.message + (planText ? `\n\nIMPLEMENTATION PLAN:\n${planText}` : ''),
        fileContents: request.fileContents || {},
        requestId: request.requestId,
        sessionId: sessionId,
        conversationHistory: history,
        onStep: async (toolName: string, status: string, message: string, details?: Record<string, any>, stepIndex?: number) => {
            const finalStepNumber = stepIndex !== undefined ? stepIndex : stepCounter++;
            await emitStep(request.requestId, siteId, finalStepNumber, toolName || 'thinking', status, message || '', details, sessionId);
        }
    });

    // Emit build validation step if required
    if (result.requiresBuildValidation) {
        await emitStep(request.requestId, siteId, 998, 'validate_build', 'running', 'Running npm run build to validate...', undefined, sessionId);
    }

    // Emit "task completed" BEFORE returning the response (high step number ensures it comes last in steps list but before JSON return)
    const completionMessage = result.requiresBuildValidation
        ? `Build validation pending. ${result.fileOperations?.length || 0} files modified.`
        : `Task completed with ${result.fileOperations?.length || 0} modifications.`;
    await emitStep(request.requestId, siteId, 999, 'complete', result.requiresBuildValidation ? 'running' : 'complete', completionMessage, undefined, sessionId);

    return {
        output: result.output || "Task completed.",
        intent,
        fileOperations: result.fileOperations || [],
        filesCreated: result.filesCreated || [],
        filesModified: result.filesModified || [],
        filesDeleted: result.filesDeleted || [],
        isDirectResponse: false,
        iterations: result.iterations || 0,
        useWebContainer: true,
        requiresBuildValidation: result.requiresBuildValidation,
        buildValidationMessage: result.buildValidationMessage
    };
}
