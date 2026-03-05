// Executor Agent - runs the main tool-calling loop
// Uses Gemini 3 Pro via OpenRouter for high-quality execution

import { TOOLS, FileOperation, ToolResult } from '../tools';
import { listFiles, readFile, writeFile, strReplace, deleteFile, resetOperations, getOperations } from '../tools/file';
import { generateImage } from '../tools/image';
import { webSearch, webScrape } from '../tools/web';
import { EXECUTOR_SYSTEM_PROMPT } from '../prompts/system';

interface Message {
    role: 'user' | 'assistant' | 'tool';
    content: any;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

interface ExecutorResult {
    output: string;
    fileOperations: FileOperation[];
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
    iterations: number;
    requiresBuildValidation?: boolean;
    buildValidationMessage?: string;
}

interface ExecutorContext {
    message: string;
    fileContents: Record<string, string>;
    requestId?: string;
    sessionId?: string;
    conversationHistory?: any[]; // Array of { role, content }
    onStep?: (toolName: string, status: string, message: string, details?: Record<string, any>, stepIndex?: number) => Promise<void>;
}

// Check if the current session has been cancelled
async function isCancelled(sessionId?: string): Promise<boolean> {
    if (!sessionId) return false;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;

    try {
        const response = await fetch(`${url}/rest/v1/chat_sessions?id=eq.${sessionId}&select=is_cancelled`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        });
        const data = await response.json();
        return data?.[0]?.is_cancelled === true;
    } catch (e) {
        console.error('Failed to check cancellation:', e);
        return false;
    }
}

// Special result for validate_build tool
interface ValidateBuildResult extends ToolResult {
    requiresBuildValidation?: boolean;
    buildMessage?: string;
}

async function runTool(name: string, args: Record<string, any>, context: ExecutorContext): Promise<ToolResult | ValidateBuildResult> {
    switch (name) {
        case 'list_files':
            return listFiles(context.fileContents, args.pattern || '*');
        case 'read_file':
        case 'view_lines':
            return readFile(context.fileContents, args.path || args.file, args.startLine, args.endLine);
        case 'write_file': {
            const result = writeFile(args.path, args.content);
            // Update context so subsequent reads see the new content (enables verify loop)
            if (result.success && args.path && args.content !== undefined) {
                context.fileContents[args.path] = args.content;
            }
            return result;
        }
        case 'str_replace': {
            const result = strReplace(args.file, args.old_text, args.new_text);
            // Update context so subsequent reads see the modification (enables verify loop)
            if (result.success && args.file && context.fileContents[args.file]) {
                context.fileContents[args.file] = context.fileContents[args.file].replace(args.old_text, args.new_text);
            }
            return result;
        }
        case 'delete_file': {
            const result = deleteFile(args.path);
            // Remove from context so subsequent reads know the file is gone
            if (result.success && args.path) {
                delete context.fileContents[args.path];
            }
            return result;
        }
        case 'generate_image':
            return generateImage(args.prompt);
        case 'web_search':
            return webSearch(args.query, args.maxResults);
        case 'web_scrape':
            return webScrape(args.url, args.maxLength);
        case 'validate_build':
            // This signals the client to run npm run build
            return {
                success: true,
                data: 'Build validation scheduled. Waiting for results...',
                requiresBuildValidation: true,
                buildMessage: args.message || 'Validating build...'
            };
        default:
            return { success: false, error: `Unknown tool: ${name}` };
    }
}

export async function executeWithTools(context: ExecutorContext): Promise<ExecutorResult> {
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    const MODEL = 'google/gemini-3-pro-preview';

    resetOperations();

    if (!OPENROUTER_KEY) {
        throw new Error('Missing OPENROUTER_API_KEY');
    }

    // Build the prompt context
    const preloadedFiles = Object.entries(context.fileContents || {})
        .map(([f, c]) => `=== ${f} ===\n${c.slice(0, 1500)}`)
        .join('\n')
        .slice(0, 4000);

    let systemPrompt = EXECUTOR_SYSTEM_PROMPT;
    let userContent = 'USER REQUEST: ' + context.message;

    if (Object.keys(context.fileContents || {}).length === 0) {
        userContent += '\nNEW PROJECT: Create files in order listed above.';
    } else {
        userContent += '\nEXISTING FILES:\n' + preloadedFiles;
    }

    // Convert tools to OpenAI format for OpenRouter
    const openRouterTools = TOOLS.map(t => ({
        type: 'function',
        function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters
        }
    }));

    const messages: any[] = [];

    // Add history if available
    if (context.conversationHistory && Array.isArray(context.conversationHistory)) {
        context.conversationHistory.forEach(msg => {
            messages.push({ role: msg.role, content: msg.content });
        });
    }

    // Add current user message
    messages.push({ role: 'user', content: userContent });

    let output = '';
    let iterations = 0;
    let requiresBuildValidation = false;
    let buildValidationMessage = '';

    // Main execution loop
    for (let i = 0; i < 10; i++) { // Lowered from 15 to ensure concise execution
        try {
            // Check for cancellation before each step
            if (await isCancelled(context.sessionId)) {
                console.log(`[Executor] Execution cancelled for session ${context.sessionId}`);
                output += '\n\n🛑 Execution stopped by user.';
                break;
            }
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_KEY}`,
                    'HTTP-Referer': 'https://automate.ai',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: MODEL,
                    max_tokens: 4096,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...messages
                    ],
                    tools: openRouterTools,
                    tool_choice: 'auto'
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenRouter API error: ${response.status} - ${errText}`);
            }

            const data = await response.json();
            const choice = data.choices[0];
            const msg = choice.message;

            // Add assistant response to history
            messages.push(msg);

            // Find text output
            if (msg.content) output = msg.content;

            // Find tool uses
            const toolCalls = msg.tool_calls || [];

            if (toolCalls.length > 0) {
                for (const toolCall of toolCalls) {
                    const args = typeof toolCall.function.arguments === 'string'
                        ? JSON.parse(toolCall.function.arguments)
                        : toolCall.function.arguments;
                    const toolName = toolCall.function.name;
                    const toolId = toolCall.id;

                    // Skip generate_image steps from UI as requested
                    const shouldEmit = toolName !== 'generate_image';

                    // Emit step for UI feedback
                    let stepMessage = `Executing ${toolName}`;
                    const details: Record<string, any> = {};

                    if (toolName === 'write_file' && args.path) {
                        stepMessage = `Writing ${args.path.split('/').pop() || args.path}`;
                        if (args.content) {
                            details.content = args.content.length > 500 ? args.content.substring(0, 500) + '...' : args.content;
                        }
                    } else if (toolName === 'read_file' && args.path) {
                        stepMessage = `Reading ${args.path.split('/').pop() || args.path}`;
                    } else if (toolName === 'str_replace' && args.file) {
                        stepMessage = `Modifying ${args.file.split('/').pop() || args.file}`;
                        if (args.new_text) {
                            details.content = args.new_text.length > 500 ? args.new_text.substring(0, 500) + '...' : args.new_text;
                        }
                    } else if (toolName === 'generate_image') {
                        stepMessage = `Generating image...`;
                    } else if (toolName === 'web_search' && args.query) {
                        stepMessage = `Searching: "${args.query.substring(0, 50)}"`;
                    } else if (toolName === 'web_scrape' && args.url) {
                        try { stepMessage = `Reading ${new URL(args.url).hostname}`; } catch { stepMessage = `Reading URL...`; }
                    } else if (toolName === 'delete_file' && args.path) {
                        stepMessage = `Deleting ${args.path.split('/').pop() || args.path}`;
                    }

                    if (context.onStep && shouldEmit) {
                        const stepIndex = 100 + iterations; // Stable index for this iterations
                        await context.onStep(toolName, 'running', stepMessage, details, stepIndex);
                    }

                    const result = await runTool(toolName, args, context) as ValidateBuildResult;
                    iterations++;

                    // Check if this is a build validation request
                    if (result.requiresBuildValidation) {
                        requiresBuildValidation = true;
                        buildValidationMessage = result.buildMessage || 'Validating build...';
                    }

                    if (context.onStep && shouldEmit) {
                        const stepIndex = 100 + (iterations - 1); // Reuse the same index
                        await context.onStep(toolName, 'complete', stepMessage, details, stepIndex);
                    }

                    messages.push({
                        role: 'tool',
                        tool_call_id: toolId,
                        content: typeof result.data === 'string' ? result.data : JSON.stringify(result.data || result.error || 'Success')
                    });
                }
            } else {
                // No tool calls, finish
                break;
            }
        } catch (e: any) {
            console.error('Executor error:', e);
            output = 'Execution error: ' + e.message;
            break;
        }
    }

    // Clean up output
    output = output
        .replace(/\*\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/^[-*]\s/gm, '')
        .trim();

    if (output.length > 300) {
        output = output.substring(0, 300) + '...';
    }

    const operations = getOperations();

    return {
        output,
        fileOperations: operations,
        filesCreated: operations.filter(o => o.type === 'write').map(o => o.path),
        filesModified: operations.filter(o => o.type === 'modify').map(o => o.path),
        filesDeleted: operations.filter(o => o.type === 'delete').map(o => o.path),
        iterations,
        requiresBuildValidation,
        buildValidationMessage
    };
}
