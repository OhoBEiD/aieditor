// Vercel AI SDK Agent for UI/Design tasks
// Uses Gemini via OpenRouter for frontend-focused code generation

import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { emitStep } from '../AIService';
import { ANIMATION_SKILLS } from '../prompts/skills';

// Configure OpenRouter provider
const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

const UI_SYSTEM_PROMPT = `You are a world-class UI/UX engineer creating stunning, premium React interfaces with a signature liquid glass style.

## Technical Stack
- React 18+ with functional components and hooks ("use client" for interactive components)
- TypeScript with proper types
- Tailwind CSS for styling
- Next.js App Router
- **Animation libraries**: GSAP, Motion, React Spring, Anime.js, Lenis, Three.js/R3F — choose the best for each task
- **Lucide React** for icons

## Constraints & Project Structure
- **File Extensions**: ALWAYS use \`.tsx\` for React components.
- **Source Folder**: All components MUST be in \`src/\` directory.
- **Efficiency**: Minimize tool calls. Write complete files.

## Signature Design System
- **Glass morphism**: \`backdrop-blur-xl bg-white/[0.05] border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)]\`
- **Floating gradient orbs**: 3-5 blurred gradient circles as background decoration
- **Typography**: Space Grotesk for headings (font-bold tracking-tight), Inter for body text
- **Spacing**: Generous padding (py-24 lg:py-32), max-w-7xl containers, gap-6 lg:gap-8
- **Colors**: CSS custom properties. Dark theme default for tech/SaaS.

## Animation Guidelines
- Add scroll animations to sections (fade up on scroll) using GSAP ScrollTrigger, Motion, or Anime.js
- Staggered reveals for card grids and lists
- Guard with \`typeof window !== "undefined"\` for SSR-incompatible setup
- Use "use client" on all components with animation hooks
- Choose the best library for the task (see AVAILABLE ANIMATION & UI LIBRARIES below)
- For smooth page scroll, use Lenis. For 3D, use Three.js/R3F. For spring physics, use React Spring.

## Images & Media
- **ALWAYS use real Unsplash images**: \`https://images.unsplash.com/photo-{REAL_ID}?w=800&q=80&fit=crop\`
- Team photos: \`https://randomuser.me/api/portraits/men/{n}.jpg\` or \`/women/{n}.jpg\`
- Icons: Lucide React exclusively. Never emoji for UI elements.
- **NEVER leave empty placeholders**. Every \`<img>\` must have a working URL.

## Your Focus
Frontend/UI tasks only: React components, page layouts, CSS, animations, forms, navigation.

## MODIFICATION RULES (CRITICAL)
When modifying EXISTING code (files are shown in context):
- ONLY change what the user explicitly asked for. If they say "change colors", ONLY change colors.
- NEVER change: brand names, product names, text content, layout structure, component hierarchy, or image URLs unless specifically asked.
- Prefer \`modify_file\` (surgical edits) over \`write_file\` (full rewrite) for existing files.
- Read the file first, then make targeted replacements.
- If the user says "change color theme", update Tailwind classes and CSS variables — nothing else.`;

// Define tools as plain objects (avoids AI SDK v6 tool() type overload issues)
const uiTools: Record<string, any> = {
    write_file: {
        description: 'Write content to a file. Creates the file if it does not exist.',
        parameters: z.object({
            path: z.string().describe('File path starting with src/'),
            content: z.string().describe('File content to write'),
        }),
        execute: async ({ path, content }: { path: string; content: string }) => {
            return { success: true, path, operation: 'write', content };
        },
    },
    read_file: {
        description: 'Read the contents of a file.',
        parameters: z.object({
            path: z.string().describe('File path to read'),
        }),
        execute: async ({ path }: { path: string }) => {
            return { success: true, path, operation: 'read' };
        },
    },
    modify_file: {
        description: 'Modify a file by replacing text.',
        parameters: z.object({
            path: z.string().describe('File path to modify'),
            oldText: z.string().describe('Text to find and replace'),
            newText: z.string().describe('Replacement text'),
        }),
        execute: async ({ path, oldText, newText }: { path: string; oldText: string; newText: string }) => {
            return { success: true, path, operation: 'modify', oldText, newText };
        },
    },
};

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
        .map(([path, content]) => `### ${path}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``)
        .join('\n\n')
        .slice(0, 12000);

    const userPrompt = fileContext
        ? `## Existing UI Files\n${fileContext}\n\n## Request\n${context.message}`
        : context.message;

    try {
        const result = await generateText({
            model: openrouter.chat('google/gemini-3-flash-preview'),
            system: UI_SYSTEM_PROMPT + "\n\n" + ANIMATION_SKILLS,
            prompt: userPrompt,
            tools: uiTools,
            stopWhen: stepCountIs(10),
            onStepFinish: async (step) => {
                iterations++;

                if (step.toolCalls) {
                    for (const toolCall of step.toolCalls) {
                        const name = toolCall.toolName;
                        const args = (toolCall as any).input || (toolCall as any).args || {};

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
                            const fileName = args.path?.split('/').pop() || 'file';
                            const stepMessage = name === 'write_file'
                                ? `Writing ${fileName}`
                                : name === 'modify_file'
                                    ? `Modifying ${fileName}`
                                    : `Reading ${fileName}`;

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
        throw error;
    }
}
