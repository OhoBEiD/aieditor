// Vercel AI SDK Agent for UI/Design tasks
// Uses Gemini via OpenRouter for frontend-focused code generation

import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { emitStep } from '../AIService';
import { ANIMATION_SKILLS_BRIEF, IMAGE_RULES, IMPORT_REFERENCE } from '../prompts/skills';

// Configure OpenRouter provider
const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});

const UI_SYSTEM_PROMPT = `You are a world-class UI/UX engineer creating stunning, premium React interfaces with designs adapted to each project's unique identity.

## Technical Stack
- React 18+ with functional components and hooks
- TypeScript with proper types
- Tailwind CSS for styling
- Next.js App Router
- **Pre-installed animation libraries**: GSAP (gsap), Motion (motion), Lenis (lenis)
- **Lucide React** for icons
- **ONLY use pre-installed packages**: next, react, react-dom, gsap, lucide-react, motion, lenis
- If you need a package not listed above, update package.json FIRST before importing it

## Constraints & Project Structure
- **File Extensions**: ALWAYS use \`.tsx\` for React components.
- **Source Folder**: All components MUST be in \`src/\` directory.
- **Efficiency**: Minimize tool calls. Write complete files.

## "use client" RULES (CRITICAL — prevents hydration errors)
ANY component using hooks (useState, useEffect, useRef, etc.), event handlers (onClick, onChange), animation libs (gsap, motion, lenis), or browser APIs (window, document) MUST have \`"use client"\` as the FIRST LINE.
layout.tsx must stay as a Server Component — never add "use client" to it.

## HYDRATION PREVENTION (CRITICAL)
- Never put <div>, <section>, <h1>-<h6> inside <p> tags — causes hydration mismatch
- Never nest <a> inside <a> or <button> inside <button>
- GSAP/Lenis code MUST be inside useEffect, never in component body
- Never use typeof window in JSX render — use useState + useEffect for mounted state
- Use \`motion\` package (not \`framer-motion\`) — motion is what's installed

## BRAND & CONTENT RULES (CRITICAL)
- When the user specifies a store/brand/company name (e.g. "for Furry", "called Stellar"), use THAT EXACT NAME everywhere: logo text, navbar, hero heading, footer, page metadata. NEVER invent a different brand name.
- When the user specifies a color theme (e.g. "white and green"), use THOSE EXACT COLORS as the primary palette. Do not override with your defaults.
- The user's request defines the identity. Your job is to design FOR their brand, not create your own.

## Design System
- **Styling variety**: Choose from flat/clean, gradient, bold, minimalist, editorial, or soft/rounded styles based on the brand. Do NOT always default to glass morphism — adapt to the project.
- **Typography**: Choose fonts that fit the brand — Inter, Space Grotesk, Poppins, DM Sans, Playfair Display, etc.
- **Spacing**: Generous padding (py-24 lg:py-32), max-w-7xl containers, gap-6 lg:gap-8
- **Colors**: Use the user's specified color theme. Only fall back to defaults if no theme given.
- **Layout variety**: Not every site needs the same sections. Choose sections that make sense for the project type. For landing pages, create at least 7 separate component files.

## Animation Guidelines
- Add scroll animations to sections (fade up on scroll) using GSAP ScrollTrigger, Motion, or Anime.js
- Staggered reveals for card grids and lists
- Guard with \`typeof window !== "undefined"\` for SSR-incompatible setup
- Use "use client" on all components with animation hooks
- Choose the best library for the task (see AVAILABLE ANIMATION & UI LIBRARIES below)
- For smooth page scroll, use Lenis. For spring physics, use React Spring.

## Images & Media
- Use plain \`<img>\` tags (NOT next/image) for all external images
- URL: \`https://images.unsplash.com/photo-{ID}?w={width}&h={height}&fit=crop\` — use REAL photo IDs from the IMAGE BANK section
- NEVER use source.unsplash.com (dead) or picsum.photos (unreliable)
- NEVER invent photo IDs — only use verified IDs from the bank
- Team photos: \`https://randomuser.me/api/portraits/men/{n}.jpg\` or \`/women/{n}.jpg\`
- Avatars: \`https://i.pravatar.cc/150?img={1-70}\`
- Icons: Lucide React exclusively. Never emoji for UI elements.
- **NEVER leave empty placeholders**. Every \`<img>\` must have a working URL.

## Your Focus
Frontend/UI tasks only: React components, page layouts, CSS, animations, forms, navigation.

## GLOBAL REPLACEMENT RULES (CRITICAL)
When the user says "change X to Y" (e.g., "change Furry to Omar", "rename Store to Shop"):
1. ALWAYS use search_and_replace to find and replace ALL instances of X across ALL project files
2. This includes: component text, variable names, class names, metadata, comments, alt text
3. NEVER change just one file — the replacement must be exhaustive across the entire project
4. Only limit scope if the user explicitly says "only in this file" or "just in the header"

When the user says "change color theme to X and Y" or "make it blue and white":
1. Use grep_files to find all color-related Tailwind classes and CSS values
2. Map the old color palette to the new one systematically
3. Replace across ALL files — not just one component
4. Update: bg-*, text-*, border-*, from-*, to-*, via-*, ring-*, shadow colors, gradient stops
5. Also update any CSS variables or hardcoded hex/rgb values

## MODIFICATION RULES (CRITICAL)
When modifying EXISTING code (files are shown in context):
- ONLY change what the user explicitly asked for. If they say "change colors", ONLY change colors.
- NEVER change: brand names, product names, text content, layout structure, component hierarchy, or image URLs unless specifically asked.
- Prefer \`modify_file\` (surgical edits) over \`write_file\` (full rewrite) for existing files.
- Read the file first, then make targeted replacements.
- If the user says "change color theme", update Tailwind classes and CSS variables — nothing else.
- When the user says "change X to Y", find X in the existing code and replace with Y. Do NOT rewrite the entire file.
- For text changes: use \`search_and_replace\` for global changes, \`modify_file\` for single-file edits. For color changes: update only color-related classes/variables.`;

// Helper to normalize paths consistently
function normalizePath(p: string): string {
    return (p || "").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

// Create tools that operate on the actual file contents map
function createUITools(fileContentsMap: Map<string, string>) {
    const uiTools: Record<string, any> = {
        grep_files: {
            description: 'Search for a text pattern across all project files. Returns matching lines with file paths. Use this FIRST to find all instances before making changes.',
            parameters: z.object({
                pattern: z.string().describe('Text or regex pattern to search for'),
                glob: z.string().optional().describe('Optional file pattern filter (e.g., "*.tsx")'),
                maxResults: z.number().optional().default(30).describe('Max results (default 30)'),
            }),
            execute: async ({ pattern, glob, maxResults = 30 }: { pattern: string; glob?: string; maxResults?: number }) => {
                const matches: Array<{ file: string; line: number; match: string }> = [];
                let regex: RegExp;
                try {
                    regex = new RegExp(pattern, "gi");
                } catch {
                    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
                }

                for (const [filePath, content] of fileContentsMap.entries()) {
                    if (glob) {
                        const globRegex = glob.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
                        if (!new RegExp(`^${globRegex}$`).test(filePath)) continue;
                    }
                    const lines = content.split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        if (regex.test(lines[i])) {
                            regex.lastIndex = 0;
                            matches.push({ file: filePath, line: i + 1, match: lines[i].trim().slice(0, 200) });
                            if (matches.length >= maxResults) break;
                        }
                    }
                    if (matches.length >= maxResults) break;
                }

                return matches.length > 0
                    ? { matches, total: matches.length }
                    : { matches: [], message: `No matches found for "${pattern}"` };
            },
        },
        search_and_replace: {
            description: 'Find and replace text across ALL project files. Use for global renames (e.g., "change Furry to Omar"), text changes, and color/theme updates.',
            parameters: z.object({
                search: z.string().describe('Exact text to find across all files'),
                replace: z.string().describe('Replacement text'),
                matchCase: z.boolean().optional().default(true).describe('Case-sensitive matching (default true). Set false to match all case variants.'),
            }),
            execute: async ({ search, replace, matchCase = true }: { search: string; replace: string; matchCase?: boolean }) => {
                const modifiedFiles: Array<{ path: string; replacements: number }> = [];
                const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const flags = matchCase ? "g" : "gi";
                const regex = new RegExp(escapedSearch, flags);

                for (const [filePath, content] of fileContentsMap.entries()) {
                    if (filePath.includes("node_modules/") || filePath.includes(".lock")) continue;
                    const matchList = content.match(regex);
                    if (matchList && matchList.length > 0) {
                        const newContent = content.replace(regex, replace);
                        fileContentsMap.set(filePath, newContent);
                        modifiedFiles.push({ path: filePath, replacements: matchList.length });
                    }
                }

                if (modifiedFiles.length === 0) {
                    return { success: false, message: `No occurrences of "${search}" found.` };
                }

                const totalReplacements = modifiedFiles.reduce((sum, f) => sum + f.replacements, 0);
                return {
                    success: true,
                    totalReplacements,
                    filesModified: modifiedFiles.length,
                    files: modifiedFiles,
                    message: `Replaced ${totalReplacements} occurrence(s) of "${search}" → "${replace}" across ${modifiedFiles.length} file(s).`,
                };
            },
        },
        write_file: {
            description: 'Write content to a file. Creates the file if it does not exist.',
            parameters: z.object({
                path: z.string().describe('File path starting with src/'),
                content: z.string().describe('File content to write'),
            }),
            execute: async ({ path, content }: { path: string; content: string }) => {
                const normalized = normalizePath(path);
                fileContentsMap.set(normalized, content);
                return { success: true, path: normalized, operation: 'write', content };
            },
        },
        read_file: {
            description: 'Read the contents of a file. Returns actual file content.',
            parameters: z.object({
                path: z.string().describe('File path to read'),
            }),
            execute: async ({ path }: { path: string }) => {
                const normalized = normalizePath(path);
                // Try exact match first, then fuzzy
                let content = fileContentsMap.get(normalized);
                if (!content) {
                    for (const [key, val] of fileContentsMap.entries()) {
                        if (key.endsWith(normalized) || normalized.endsWith(key)) {
                            content = val;
                            break;
                        }
                    }
                }
                if (!content) {
                    const available = Array.from(fileContentsMap.keys()).slice(0, 10);
                    return { error: `File not found: ${path}`, available };
                }
                const lines = content.split("\n");
                const numbered = lines.map((line, i) => `${i + 1}|${line}`);
                return { success: true, path: normalized, content: numbered.join("\n"), totalLines: lines.length };
            },
        },
        modify_file: {
            description: 'Modify a file by replacing text. Replaces ALL occurrences in the file.',
            parameters: z.object({
                path: z.string().describe('File path to modify'),
                oldText: z.string().describe('Text to find and replace'),
                newText: z.string().describe('Replacement text'),
            }),
            execute: async ({ path, oldText, newText }: { path: string; oldText: string; newText: string }) => {
                const normalized = normalizePath(path);
                const content = fileContentsMap.get(normalized);
                if (!content) {
                    return { success: false, error: `File not found: ${path}` };
                }
                const occurrences = content.split(oldText).length - 1;
                if (occurrences === 0) {
                    return { success: false, error: `Text not found in ${path}. Use read_file to see current content.` };
                }
                const newContent = content.split(oldText).join(newText);
                fileContentsMap.set(normalized, newContent);
                return { success: true, path: normalized, operation: 'modify', replacements: occurrences, oldText, newText };
            },
        },
    };
    return uiTools;
}

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

    // Build a mutable map of all file contents so tools can read/search/modify them
    const fileContentsMap = new Map<string, string>();
    for (const [path, content] of Object.entries(context.fileContents || {})) {
        fileContentsMap.set(normalizePath(path), content);
    }

    // Create tools that operate on the actual file map
    const uiTools = createUITools(fileContentsMap);

    // Build context with existing files (for the prompt)
    const fileContext = Object.entries(context.fileContents || {})
        .filter(([path]) => path.endsWith('.tsx') || path.endsWith('.css') || path.endsWith('.ts'))
        .map(([path, content]) => `### ${path}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``)
        .join('\n\n')
        .slice(0, 12000);

    // Also provide a file list so the agent knows all available files
    const fileList = Array.from(fileContentsMap.keys()).sort().join('\n');

    const userPrompt = fileContext
        ? `## Available Project Files\n${fileList}\n\n## Existing UI Files (truncated)\n${fileContext}\n\n## Request\n${context.message}`
        : `## Available Project Files\n${fileList || '(empty project)'}\n\n## Request\n${context.message}`;

    try {
        // Track initial file contents to diff later
        const initialContents = new Map<string, string>();
        for (const [path, content] of fileContentsMap.entries()) {
            initialContents.set(path, content);
        }

        const result = await generateText({
            model: openrouter.chat('google/gemini-3-flash-preview'),
            system: UI_SYSTEM_PROMPT + "\n\n" + ANIMATION_SKILLS_BRIEF + "\n\n" + IMPORT_REFERENCE + "\n\n" + IMAGE_RULES,
            prompt: userPrompt,
            tools: uiTools,
            stopWhen: stepCountIs(15),
            onStepFinish: async (step) => {
                iterations++;

                if (step.toolCalls) {
                    for (const toolCall of step.toolCalls) {
                        const name = toolCall.toolName;
                        const args = (toolCall as any).input || (toolCall as any).args || {};

                        // Emit step for UI
                        if (context.onStep) {
                            const fileName = args.path?.split('/').pop() || args.search || 'file';
                            let stepMessage = '';
                            if (name === 'write_file') stepMessage = `Writing ${fileName}`;
                            else if (name === 'modify_file') stepMessage = `Modifying ${fileName}`;
                            else if (name === 'read_file') stepMessage = `Reading ${fileName}`;
                            else if (name === 'grep_files') stepMessage = `Searching for "${args.pattern?.slice(0, 30)}"`;
                            else if (name === 'search_and_replace') stepMessage = `Replacing "${args.search?.slice(0, 20)}" → "${args.replace?.slice(0, 20)}" globally`;
                            else stepMessage = `${name}`;

                            await context.onStep(name, 'complete', stepMessage, {}, 300 + iterations);
                        }
                    }
                }
            },
        });

        // Diff the file map against initial contents to produce file operations
        for (const [path, newContent] of fileContentsMap.entries()) {
            const oldContent = initialContents.get(path);
            if (oldContent === undefined) {
                // New file created
                fileOperations.push({ type: 'write', path, content: newContent });
            } else if (oldContent !== newContent) {
                // File was modified — emit as full write since content may have changed via multiple tools
                fileOperations.push({ type: 'write', path, content: newContent });
            }
        }

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
