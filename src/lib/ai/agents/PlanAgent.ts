// Plan Agent - Creates structured execution plans
// Uses Pro with high thinking for complex tasks, Flash for moderate
// Receives exploration summary (not raw files) for token efficiency

import { generateText, stepCountIs } from "ai";
import { selectModel, type Complexity, type UserModel } from "../router";
import { getPlannerTools, type DatabaseContext } from "../tools/enhanced-tools";
import type { ExplorationResult } from "./ExploreAgent";
import { ANIMATION_SKILLS_BRIEF } from "../prompts/skills";

// --- Types ---

export interface PlanTask {
  id: number;
  description: string;
  type: "create" | "modify" | "delete";
  files: string[];
  dependencies?: number[];      // IDs of tasks this depends on
  verification: string;         // How to verify this task completed correctly
  complexity: "simple" | "moderate" | "complex";
  // Detailed executor instructions — the executor follows these precisely
  instructions: string;         // Step-by-step what the executor must do
  libraries?: string[];         // npm packages needed (e.g. ["gsap", "framer-motion"])
  codeHints?: string;           // Key imports, component signatures, code patterns to use
}

export interface ExecutionPlan {
  summary: string;
  tasks: PlanTask[];
  verificationPlan: {
    buildMustPass: boolean;
    criticalFiles: string[];
    importChecks: string[];
  };
  complexity: Complexity;
}

// --- System Prompt ---

const PLAN_SYSTEM_PROMPT = `You are a senior software architect creating execution plans for a coding agent.

## YOUR JOB
Create a precise, structured plan that an executor agent will follow step-by-step.

## RULES
1. If you need to investigate the codebase, use tools (grep_files, read_file, etc.) - but limit to 3 investigation steps max.
2. After investigation, output the plan as a JSON object (described below).
3. Order tasks by dependency - earlier tasks should not depend on later ones.
4. Each task should modify 1-3 files max. Split larger changes into multiple tasks.
5. Include verification criteria for each task so the executor knows when it's done.
6. Mark complexity per task so the executor can use the right model.

## PLAN FORMAT
You MUST output valid JSON in this exact structure:

\`\`\`json
{
  "summary": "Brief description of what will be built/changed",
  "tasks": [
    {
      "id": 1,
      "description": "Create globals.css with brand color scheme",
      "type": "create",
      "files": ["src/app/globals.css"],
      "dependencies": [],
      "verification": "globals.css has @tailwind directives and CSS variables for brand colors",
      "complexity": "simple",
      "instructions": "Write globals.css with: 1) @tailwind base/components/utilities 2) :root CSS variables: --background: #0a0a0a, --foreground: #fafafa, --primary: #6366f1, --primary-foreground: #fff, --muted: #27272a, --muted-foreground: #a1a1aa 3) body base styles with antialiased",
      "libraries": [],
      "codeHints": "@tailwind base;\\n@tailwind components;\\n@tailwind utilities;"
    },
    {
      "id": 2,
      "description": "Create Hero component with scroll animation",
      "type": "create",
      "files": ["src/components/Hero.tsx"],
      "dependencies": [1],
      "verification": "Hero.tsx exports default, uses 'use client', imports gsap",
      "complexity": "moderate",
      "instructions": "Create Hero with: 1) 'use client' directive 2) Full-viewport section with bg-[#0a0a0a] 3) h1 'Acme' in text-6xl font-bold text-white 4) Subtitle 'AI-powered solutions' in text-xl text-gray-400 5) Two CTA buttons (Get Started with bg-indigo-500, Learn More with border border-white/20) 6) GSAP fadeUp animation with ScrollTrigger, typeof window guard in useEffect",
      "libraries": ["gsap"],
      "codeHints": "import { useEffect, useRef } from 'react';\\nimport gsap from 'gsap';\\nimport { ScrollTrigger } from 'gsap/ScrollTrigger';"
    }
  ],
  "verificationPlan": {
    "buildMustPass": true,
    "criticalFiles": ["src/app/page.tsx", "src/app/layout.tsx"],
    "importChecks": ["All new components imported in page.tsx"]
  },
  "complexity": "complex"
}
\`\`\`

## TASK DETAIL RULES (CRITICAL)
Each task MUST include these fields:
- "instructions": Precise step-by-step instructions for a code-writing agent. Include exact content (headings, text, section names), exact styling (colors, spacing, Tailwind classes), and exact behavior (animations, interactions). The executor is a fast model that follows instructions — it does NOT make design decisions.
- "libraries": Any npm packages the task needs that are NOT already in package.json (empty array if none)
- "codeHints": Key imports, component signatures, or code patterns the executor should use

Be VERY SPECIFIC in instructions. Instead of "Create a hero section", write "Create a full-viewport hero with: dark bg-[#0a0a0a], centered h1 'Acme' in text-6xl font-bold text-white, subtitle 'AI-powered solutions' in text-xl text-gray-400, two CTA buttons (Get Started primary bg-indigo-500, Learn More outline border-white/20), GSAP fadeUp on scroll."

## DESIGN VARIETY (CRITICAL)
Do NOT default to the same layout patterns every time. Vary hero designs across projects:
- Full-screen background image with text overlay and dark gradient overlay
- Centered text-only with gradient background and animated elements
- Video or image background with bold typography
- Asymmetric layouts with text on one side and creative graphics
- Split hero with angled dividers or clip paths
Choose the style that best fits the project type and brand. Do NOT always use "text left, image right" split layout.

## BRAND RULES (CRITICAL)
- Extract the brand/store/company name from the user's request. If they say "for Furry", the brand is "Furry".
- Use that EXACT brand name in ALL generated files: navbar logo text, hero heading, footer, layout.tsx metadata title.
- NEVER invent a different brand name. The user's specified name is the brand identity.
- If the user specifies a color theme (e.g. "white and green"), include a task to set those exact colors in globals.css.

## DEPENDENCY MANAGEMENT (CRITICAL — prevents missing module errors)
Pre-installed packages: next, react, react-dom, gsap, lucide-react, motion, lenis
- If ANY task needs a package NOT in the list above, you MUST include an EARLY task (before component tasks) that updates package.json to add the new dependency
- The "libraries" field on each task is for documentation — the executor still needs package.json updated
- Prefer pre-installed packages: use \`motion\` (not framer-motion), \`gsap\` for timelines, \`lenis\` for smooth scroll
- ONLY use @react-spring/web or animejs if specifically requested — they require adding to package.json first

## "use client" RULES (CRITICAL — prevents hydration errors)
- Every component using React hooks (useState, useEffect, useRef, etc.), event handlers, animation libraries, or browser APIs MUST have "use client" as line 1
- Include this in your task instructions: "Add 'use client' directive as line 1"
- layout.tsx must remain a Server Component — NEVER add "use client" to layout.tsx
- GSAP/Lenis code must be inside useEffect — never in the component body

## HYDRATION PREVENTION
- Never instruct nesting <div>/<section>/<h1>-<h6> inside <p> tags
- Never nest <a> inside <a> or <button> inside <button>
- For conditional client rendering, use useState + useEffect pattern, NOT typeof window in JSX

## IMPORTANT
- For NEW PROJECTS: include config files (package.json, tailwind.config) as task 1
- For MODIFICATIONS: only plan the files that need to change
- Use Tailwind CSS, React 18+, TypeScript, Next.js App Router
- Always include real image URLs using \`https://images.unsplash.com/photo-{ID}?w={w}&h={h}&fit=crop\` with REAL photo IDs from the curated bank — NEVER use source.unsplash.com or picsum.photos
- Keep tasks atomic - each task should be independently verifiable

## PAGE COMPOSITION (CRITICAL)
When creating multiple new components (Hero, Navbar, Footer, etc.), you MUST include a FINAL task that:
1. Updates \`src/app/page.tsx\` to import and render ALL new components in the correct order
2. Updates \`src/app/layout.tsx\` with proper metadata (title, description) matching the project
This task MUST depend on all component-creation tasks and should list both page.tsx and layout.tsx in its files array.
Do NOT assume earlier tasks will handle this — page composition MUST be its own explicit task.`;

// --- Agent ---

export async function runPlanAgent(
  userRequest: string,
  exploration: ExplorationResult | null,
  virtualFS: Map<string, string>,
  complexity: Complexity = "complex",
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  onStep?: (toolName: string, status: string, message: string, details?: any) => Promise<void>,
  dbContext?: DatabaseContext,
  userModel?: UserModel,
): Promise<ExecutionPlan> {
  const config = selectModel("plan", complexity, userModel);
  const tools = getPlannerTools(virtualFS, dbContext);

  // Build the prompt with exploration context
  let prompt = `## User Request\n${userRequest}\n\n`;

  if (exploration) {
    prompt += `## Codebase Exploration Summary\n`;
    prompt += `### Project Structure\n${exploration.projectStructure}\n\n`;

    if (exploration.relevantFiles.length > 0) {
      prompt += `### Relevant Files\n`;
      for (const f of exploration.relevantFiles) {
        prompt += `- ${f.path}${f.keyLines ? ` (lines ${f.keyLines})` : ""}: ${f.relevance}\n`;
      }
      prompt += "\n";
    }

    if (exploration.patterns.length > 0) {
      prompt += `### Existing Patterns\n`;
      for (const p of exploration.patterns) {
        prompt += `- ${p}\n`;
      }
      prompt += "\n";
    }

    if (exploration.suggestions.length > 0) {
      prompt += `### Suggestions\n`;
      for (const s of exploration.suggestions) {
        prompt += `- ${s}\n`;
      }
      prompt += "\n";
    }
  } else {
    // No exploration - provide basic file list
    const fileList = Array.from(virtualFS.keys()).sort().join("\n");
    prompt += `## Project Files\n${fileList || "(empty project)"}\n\n`;
  }

  // Add conversation history for context (10 messages, 500 chars each for richer context)
  if (conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-10);
    prompt += `## Recent Conversation\n`;
    for (const msg of recent) {
      prompt += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content.slice(0, 2000)}\n`;
    }
    prompt += "\n";
  }

  prompt += `Now create the execution plan as JSON. Remember: output ONLY the JSON plan after any investigation.`;

  let planText = "";

  try {
    const result = await generateText({
      model: config.model,
      system: PLAN_SYSTEM_PROMPT + "\n\n" + ANIMATION_SKILLS_BRIEF,
      prompt,
      tools,
      stopWhen: stepCountIs(config.maxSteps),
      onStepFinish: async (step) => {
        if (onStep && step.toolCalls) {
          for (const tc of step.toolCalls) {
            const args = (tc as any).args || (tc as any).input || {};
            let msg = `Planning: ${tc.toolName}`;
            if (tc.toolName === "grep_files") msg = `Searching: "${args.pattern}"`;
            else if (tc.toolName === "read_file") msg = `Reading ${args.path}`;
            else if (tc.toolName === "web_search") msg = `Researching: "${args.query}"`;
            await onStep(tc.toolName, "complete", msg);
          }
        }
      },
    });

    planText = result.text || "";
  } catch (error: any) {
    console.error("[PlanAgent] Error:", error.message);
    // Fall back to a simple plan
    return createFallbackPlan(userRequest, virtualFS);
  }

  // Stream the plan text to the frontend
  if (onStep) {
    await onStep("planning", "complete", "Plan generated", { content: planText });
  }

  // Parse the JSON plan from the response
  return parsePlanOutput(planText, userRequest, virtualFS);
}

// --- Re-planning ---

export async function runReplanAgent(
  originalPlan: ExecutionPlan,
  issues: string[],
  virtualFS: Map<string, string>,
  onStep?: (toolName: string, status: string, message: string, details?: any) => Promise<void>,
  dbContext?: DatabaseContext,
): Promise<ExecutionPlan> {
  const config = selectModel("replan");
  const tools = getPlannerTools(virtualFS, dbContext);

  const prompt = `## Original Plan
${JSON.stringify(originalPlan, null, 2)}

## Verification Issues Found
${issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

## Current Files
${Array.from(virtualFS.keys()).sort().join("\n")}

## Task
Fix the plan to address the verification issues. Only include tasks that need to be re-done or added.
Output the corrected plan as JSON in the same format as the original.`;

  try {
    const result = await generateText({
      model: config.model,
      system: PLAN_SYSTEM_PROMPT + "\n\n" + ANIMATION_SKILLS_BRIEF + "\n\nYou are RE-PLANNING after verification failures. Focus only on fixing the issues listed. Do not redo tasks that already succeeded.",
      prompt,
      tools,
      stopWhen: stepCountIs(config.maxSteps),
      onStepFinish: async (step) => {
        if (onStep && step.toolCalls) {
          for (const tc of step.toolCalls) {
            await onStep(tc.toolName, "complete", `Re-planning: ${tc.toolName}`);
          }
        }
      },
    });

    return parsePlanOutput(result.text || "", "Fix issues", virtualFS);
  } catch {
    // If re-planning fails, return original plan's failed tasks
    return {
      ...originalPlan,
      summary: "Re-plan failed, retrying original tasks",
      tasks: originalPlan.tasks.slice(0, 3), // Just retry first 3 tasks
    };
  }
}

// --- Parsers ---

function parsePlanOutput(
  text: string,
  userRequest: string,
  virtualFS: Map<string, string>,
): ExecutionPlan {
  // Try to extract JSON from the response
  let plan: ExecutionPlan | null = null;

  // Try full text as JSON
  try {
    plan = JSON.parse(text);
  } catch {
    // Try to extract JSON block from markdown
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        plan = JSON.parse(jsonMatch[1]);
      } catch { /* continue to fallback */ }
    }

    // Try to find a JSON object in the text
    if (!plan) {
      const braceMatch = text.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
      if (braceMatch) {
        try {
          plan = JSON.parse(braceMatch[0]);
        } catch { /* continue to fallback */ }
      }
    }
  }

  if (plan && plan.tasks && plan.tasks.length > 0) {
    // Validate and normalize the plan
    return {
      summary: plan.summary || userRequest,
      tasks: plan.tasks.map((t: any, i: number) => ({
        id: t.id || i + 1,
        description: t.description || `Task ${i + 1}`,
        type: t.type || "create",
        files: Array.isArray(t.files) ? t.files : [],
        dependencies: t.dependencies || [],
        verification: t.verification || "Files created successfully",
        complexity: t.complexity || "moderate",
        instructions: t.instructions || t.description || `Task ${i + 1}`,
        libraries: Array.isArray(t.libraries) ? t.libraries : [],
        codeHints: t.codeHints || "",
      })),
      verificationPlan: plan.verificationPlan || {
        buildMustPass: true,
        criticalFiles: [],
        importChecks: [],
      },
      complexity: plan.complexity || "moderate",
    };
  }

  // Fallback: try to create a plan from the free-form text
  return createFallbackPlan(userRequest, virtualFS, text);
}

function createFallbackPlan(
  userRequest: string,
  virtualFS: Map<string, string>,
  planText?: string,
): ExecutionPlan {
  const isEmpty = virtualFS.size === 0;

  const tasks: PlanTask[] = isEmpty
    ? [
        {
          id: 1,
          description: "Create project configuration files",
          type: "create",
          files: ["package.json", "tailwind.config.ts", "src/lib/utils.ts", "src/app/globals.css"],
          verification: "Config files exist with correct content",
          complexity: "simple",
          instructions: "Create package.json with Next.js 14, React 18, Tailwind CSS, TypeScript. Create tailwind.config with content paths. Create globals.css with @tailwind directives. Create utils.ts with cn() helper.",
          libraries: [],
          codeHints: "",
        },
        {
          id: 2,
          description: "Create components and compose them in page.tsx and layout.tsx",
          type: "create",
          files: ["src/app/layout.tsx", "src/app/page.tsx"],
          dependencies: [1],
          verification: "page.tsx imports and renders all created components",
          complexity: "moderate",
          instructions: `Implement the user's request: ${userRequest}. Create layout.tsx with html/body structure, appropriate fonts, and metadata. Create page.tsx with all necessary sections and components.`,
          libraries: [],
          codeHints: "",
        },
      ]
    : [
        {
          id: 1,
          description: `Implement: ${userRequest}`,
          type: "modify",
          files: Array.from(virtualFS.keys()).slice(0, 5),
          verification: "Changes applied correctly",
          complexity: "moderate",
          instructions: userRequest,
          libraries: [],
          codeHints: "",
        },
      ];

  return {
    summary: planText?.slice(0, 200) || userRequest,
    tasks,
    verificationPlan: {
      buildMustPass: true,
      criticalFiles: ["src/app/page.tsx"],
      importChecks: [],
    },
    complexity: "moderate",
  };
}
