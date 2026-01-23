// Vercel AI SDK Agent for UI/Design tasks
// Uses Gemini via OpenRouter for frontend-focused code generation

import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { emitStep } from '../AIService';

// Configure OpenRouter provider
const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

const UI_SYSTEM_PROMPT = `You are an expert UI/UX developer focused on creating beautiful, modern React interfaces.

## Technical Stack
- React 18+ with functional components and hooks
- TypeScript with proper types
- Tailwind CSS for styling
- Next.js App Router

## Constraints & Project Structure
- **File Extensions**: ALWAYS use \`.tsx\` for React components.
- **Source Folder**: All components MUST be in \`src/\` directory (e.g., \`src/components/\`, \`src/app/\`).
- **Styling**: Use Tailwind CSS classes. Create visually stunning, premium designs.
- **Efficiency**: Minimize tool calls. Complete the UI in as few steps as possible.

## Design Principles
- Modern, clean aesthetic with proper spacing
- Responsive layouts (mobile-first)
- Smooth animations and transitions
- Accessible components (proper ARIA labels)
- Dark mode support when applicable

## Your Focus
You handle ONLY frontend/UI tasks:
- React components (.tsx)
- Page layouts
- Styling and CSS
- UI animations
- Form components
- Navigation and routing UI`;

// Define tools for file operations
const writeFileTool = tool({
    description: 'Write content to a file. Creates the file if it does not exist.',
    parameters: z.object({
        path: z.string().describe('File path starting with src/'),
        content: z.string().describe('File content to write'),
    }),
    execute: async ({ path, content }) => {
        return { success: true, path, operation: 'write', content };
    },
});

const readFileTool = tool({
    description: 'Read the contents of a file.',
    parameters: z.object({
        path: z.string().describe('File path to read'),
    }),
    execute: async ({ path }) => {
        return { success: true, path, operation: 'read' };
    },
});

const modifyFileTool = tool({
    description: 'Modify a file by replacing text.',
    parameters: z.object({
        path: z.string().describe('File path to modify'),
        oldText: z.string().describe('Text to find and replace'),
        newText: z.string().describe('Replacement text'),
    }),
    execute: async ({ path, oldText, newText }) => {
        return { success: true, path, operation: 'modify', oldText, newText };
    },
});

export interface VercelUIAgentResult {
    output: string;
    fileOperations: Array<{
        type: 'write' | 'modify' | 'read';
        path: string;
        content?: string;
        oldText?: string;
        newText?: string;
    }>;
    iterations: number;
}

export interface VercelUIAgentContext {
    message: string;
    fileContents?: Record<string, string>;
    requestId?: string;
    siteId?: string;
    sessionId?: string;
    onStep?: (toolName: string, status: string, message: string, details?: Record<string, any>, stepIndex?: number) => Promise<void>;
}

export async function executeVercelUIAgent(context: VercelUIAgentContext): Promise<VercelUIAgentResult> {
    const fileOperations: VercelUIAgentResult['fileOperations'] = [];
    let iterations = 0;

    // Build context with existing files
    const fileContext = Object.entries(context.fileContents || {})
        .filter(([path]) => path.endsWith('.tsx') || path.endsWith('.css') || path.endsWith('.ts'))
        .map(([path, content]) => `### ${path}\n\`\`\`\n${content.slice(0, 1000)}\n\`\`\``)
        .join('\n\n')
        .slice(0, 4000);

    const userPrompt = fileContext
        ? `## Existing UI Files\n${fileContext}\n\n## Request\n${context.message}`
        : context.message;

    try {
        const result = await generateText({
            model: openrouter('google/gemini-3-flash-preview'),
            system: UI_SYSTEM_PROMPT,
            prompt: userPrompt,
            tools: {
                write_file: writeFileTool,
                read_file: readFileTool,
                modify_file: modifyFileTool,
            },
            maxSteps: 10,
            onStepFinish: async (step) => {
                iterations++;

                if (step.toolCalls) {
                    for (const toolCall of step.toolCalls) {
                        const name = toolCall.toolName;
                        const args = toolCall.args as any;

                        // Track file operations
                        if (name === 'write_file') {
                            fileOperations.push({
                                type: 'write',
                                path: args.path,
                                content: args.content,
                            });
                        } else if (name === 'modify_file') {
                            fileOperations.push({
                                type: 'modify',
                                path: args.path,
                                oldText: args.oldText,
                                newText: args.newText,
                            });
                        }

                        // Emit step for UI
                        if (context.onStep) {
                            const stepMessage = name === 'write_file'
                                ? `Writing ${args.path.split('/').pop()}`
                                : name === 'modify_file'
                                    ? `Modifying ${args.path.split('/').pop()}`
                                    : `Reading ${args.path.split('/').pop()}`;

                            const details: Record<string, any> = {};
                            if (args.content) {
                                details.content = args.content.length > 500 ? args.content.substring(0, 500) + '...' : args.content;
                            }

                            await context.onStep(name, 'complete', stepMessage, details, 300 + iterations);
                        }
                    }
                }
            },
        });

        return {
            output: result.text || 'UI components created successfully.',
            fileOperations,
            iterations,
        };
    } catch (error: any) {
        console.error('[VercelUIAgent] Error:', error);
        return {
            output: `Error: ${error.message}`,
            fileOperations,
            iterations,
        };
    }
}
