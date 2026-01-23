import { NextRequest, NextResponse } from "next/server";
import { generateText, streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { emitStep, getSupabaseClient } from "@/lib/ai/AIService";
import { classifyIntent } from "@/lib/ai/agents/IntentClassifier";
import { executeVercelUIAgent } from "@/lib/ai/agents/VercelUIAgent";
import fs from "node:fs/promises";
import path from "node:path";

export const maxDuration = 300; // 5 minutes timeout

// OpenRouter client
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// System prompts
const EXECUTOR_SYSTEM_PROMPT = `You are an expert full-stack developer. Your job is to implement the plan using the tools.
 
 ## ITERATIVE WORKFLOW
 1. If you need to modify a file, READ IT FIRST using "read_file" to see the content.
 2. Apply changes using "write_file" (new files) or "modify_file" (surpical edits).
 3. If a tool call fails or you see an error, READ the file again to diagnose and FIX it.
 4. You can loop multiple times: READ -> EDIT -> READ (verify) -> EDIT if needed.
 
 ## MANDATORY RULES
 - NEVER call tools with empty arguments {}.
 - "content" for write_file must be the COMPLETE file source code.
 - Ensure all imports and syntax are correct.
 - **DO NOT USE run_command**. START by assuming all dependencies are already installed.
 - **PERFORM ALL STEPS** in the plan. Do not stop until all files are created.
 - **FOCUS ON FILE CREATION**. Your primary job is to create the files described in the plan.
 - **YOU MUST NOT STOP** until you have created the files. If you only list files or read files, you have FAILED. Return to the loop and WRITE the files.
 - **LAYOUT SAFETY**: When modifying \`layout.tsx\`, YOU MUST PRESERVE the \`<html>\` and \`<body>\` tags. Do not remove them or the preview will break.
 `;

const PLANNER_SYSTEM_PROMPT = `You are a senior software architect and codebase investigator. 
 
 Your goal is to create a DETAILED execution plan for a user request.
 
 ## WORKFLOW (CRITICAL)
 1. **PHASE 1: INVESTIGATION (Optional but Recommended)**
    - Use "list_files", "search_files", or "read_file" to understand the codebase.
    - Do NOT guess. Verify existing file paths and contents.
    - **LIMIT**: Max 2-3 investigation steps. Do not get stuck here.
 
 2. **PHASE 2: PLANNING (MANDATORY)**
    - AFTER investigation, you MUST output the Implementation Plan in Markdown.
    - **DO NOT STOP** after using tools. You MUST write the plan.
    - If you are confident, you can skip investigation and write the plan immediately.
 
 ## Output Format (for Phase 2):
 ### FILES TO CREATE/MODIFY
 1. [path] - [brief description of changes]
 (list all files)
 
 ### DESIGN SPECIFICATIONS
 - Colors, typography, GSAP animations, layout details.
 
 Keep the final plan concise but technically complete. The executor will follow this plan exactly.`;

// Define tools - using same pattern as VercelUIAgent
const writeFileTool = tool({
  description: "Create or overwrite a file with content. Use this to create new files.",
  parameters: z.object({
    path: z.string().describe("File path (e.g., 'src/components/Hero.tsx')"),
    content: z.string().describe("Complete file content"),
  }),
  execute: async ({ path, content }: { path: string; content: string }) => {
    return { success: true, path, content, operation: 'write' };
  },
});

const modifyFileTool = tool({
  description: "Modify a file by replacing specific text.",
  parameters: z.object({
    path: z.string().describe("File path to modify"),
    oldText: z.string().describe("Exact text to find"),
    newText: z.string().describe("Replacement text"),
  }),
  execute: async ({ path, oldText, newText }: { path: string; oldText: string; newText: string }) => {
    return { success: true, path, oldText, newText, operation: 'modify' };
  },
});

const deleteFileTool = tool({
  description: "Delete a file from the project.",
  parameters: z.object({
    path: z.string().describe("File path to delete"),
  }),
  execute: async ({ path }: { path: string }) => {
    return { success: true, path, operation: 'delete' };
  },
});

const runCommandTool = tool({
  description: "Run a shell command like npm install.",
  parameters: z.object({
    command: z.string().describe("Command to run"),
  }),
  execute: async ({ command }: { command: string }) => {
    return { success: true, command, operation: 'command' };
  },
});

const listFilesTool = tool({
  description: "List files in the project to understand the structure.",
  parameters: z.object({
    directory: z.string().describe("Directory to list (e.g., 'src/components')").default("src"),
  }),
  execute: async ({ directory }) => {
    try {
      const projectRoot = process.cwd();
      const targetDir = path.resolve(projectRoot, directory);
      if (!targetDir.startsWith(projectRoot)) return { error: "Invalid directory" };
      const files = await fs.readdir(targetDir, { recursive: true });
      return { files: files.filter(f => !f.includes('node_modules') && !f.startsWith('.')) };
    } catch (e: any) {
      return { error: e.message };
    }
  }
});

const searchFilesTool = tool({
  description: "Search for text within files (grep).",
  parameters: z.object({
    query: z.string().describe("Text to search for"),
  }),
  execute: async ({ query }) => {
    try {
      const projectRoot = process.cwd();
      const results: string[] = [];
      const searchDir = path.join(projectRoot, 'src');
      async function walk(dir: string) {
        const filesExists = await fs.access(dir).then(() => true).catch(() => false);
        if (!filesExists) return;
        const files = await fs.readdir(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            if (file !== 'node_modules' && !file.startsWith('.')) await walk(fullPath);
          } else {
            const content = await fs.readFile(fullPath, 'utf8');
            if (content.includes(query)) results.push(path.relative(projectRoot, fullPath));
          }
        }
      }
      await walk(searchDir);
      return { matches: results.slice(0, 20) };
    } catch (e: any) {
      return { error: e.message };
    }
  }
});

const readFileTool = tool({
  description: "Read the content of a file.",
  parameters: z.object({
    path: z.string().describe("File path to read"),
  }),
  execute: async ({ path: filePath }) => {
    try {
      const projectRoot = process.cwd();
      const absolutePath = path.resolve(projectRoot, filePath);
      if (!absolutePath.startsWith(projectRoot)) return { error: "Invalid path" };
      const content = await fs.readFile(absolutePath, "utf8");
      return { content };
    } catch (e: any) {
      return { error: e.message };
    }
  }
});

interface FileContext {
  [path: string]: string;
}

interface RequestBody {
  message: string;
  files?: FileContext;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  mode?: "thinking" | "fast" | "mastra";
  maxSteps?: number;
  requestId?: string;
  siteId?: string;
  applyToDisk?: boolean;
  conversationId?: string;
}

function resolveSafeProjectPath(projectRoot: string, filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\0")) return null;

  // Restrict writes to src/ by default to prevent unexpected filesystem access.
  if (!trimmed.startsWith("src/")) return null;

  const resolved = path.resolve(projectRoot, trimmed);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const {
      message,
      files = {},
      conversationHistory = [],
      mode = "thinking",
      maxSteps = 20,
      requestId = `mastra_${Date.now()} `,
      siteId = "unknown",
      applyToDisk = false,
      conversationId
    } = body;

    const sessionId = conversationId;
    const supabase = getSupabaseClient();
    let stepCounter = 1;

    const isThinking = mode === "thinking" || mode === "mastra";

    // Build context with file contents
    const fileContext = Object.entries(files)
      .map(([path, content]) => `### ${path} \n\`\`\`\n${content}\n\`\`\``)
      .join("\n\n");

    const contextualPrompt = fileContext
      ? `## Current Project Files\n${fileContext}\n\n## User Request\n${message}`
      : message;

    // Build prompt with history
    let executionPrompt = contextualPrompt;
    if (conversationHistory.length > 0) {
      const historyText = conversationHistory
        .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n\n");
      executionPrompt = `${historyText}\n\nUser: ${contextualPrompt}`;
    }

    await emitStep(requestId, siteId, stepCounter++, 'thinking', 'running', 'AutoMate analyzing context...');

    // Classify intent
    const intent = await classifyIntent(message);
    console.log('[Mastra] Intent classified:', intent.type);

    // Route UI tasks to Vercel UI Agent
    if (intent.type === 'ui_task') {
      await emitStep(requestId, siteId, stepCounter++, 'routing', 'complete', 'Routing to UI Agent', undefined, sessionId);

      const uiResult = await executeVercelUIAgent({
        message,
        fileContents: files,
        requestId,
        siteId,
        sessionId,
        onStep: async (toolName, status, msg, details, stepIndex) => {
          const finalStepNumber = stepIndex !== undefined ? stepIndex : stepCounter++;
          await emitStep(requestId, siteId, finalStepNumber, toolName, status, msg, details, sessionId);
        }
      });

      // Emit completion
      await emitStep(requestId, siteId, 999, 'complete', 'complete', `Task completed with ${uiResult.fileOperations.length} file operations.`, undefined, sessionId);

      return NextResponse.json({
        success: true,
        text: uiResult.output,
        fileOperations: uiResult.fileOperations.map(op => ({
          type: op.type === 'read' ? 'write' : op.type,
          path: op.path,
          content: op.content,
          oldText: op.oldText,
          newText: op.newText,
        })),
        steps: [],
        usage: { totalTokens: 0 },
      });
    }

    // For complex tasks, run planner first
    let plan = "";
    if (isThinking) {
      console.log("[Mastra] Running Planner...");
      const planningStepNumber = stepCounter++;
      await emitStep(requestId, siteId, planningStepNumber, 'planning', 'running', 'Generating Architecture Plan...');

      // Stream the plan with live updates
      const planStream = await streamText({
        model: openrouter.chat("google/gemini-3-flash-preview"),
        system: PLANNER_SYSTEM_PROMPT,
        prompt: executionPrompt,
        maxSteps: 20,
        tools: {
          list_files: listFilesTool,
          search_files: searchFilesTool,
          read_file: readFileTool,
        },
        onStepFinish: async (step) => {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const tc of step.toolCalls) {
              await emitStep(requestId, siteId, stepCounter++, tc.toolName, 'complete', `Investigating: ${tc.toolName}`, (tc as any).args, sessionId);
            }
          }
        }
      });

      // Accumulate plan text and update step details as chunks arrive
      let accumulatedPlan = '';
      let chunkCount = 0;

      for await (const chunk of planStream.textStream) {
        accumulatedPlan += chunk;
        chunkCount++;

        // Throttling: Update DB only every 50 chunks to prevent Realtime flooding
        if (chunkCount % 50 === 0) {
          await emitStep(requestId, siteId, planningStepNumber, 'planning', 'running', 'Generating Architecture Plan...', { content: accumulatedPlan }, sessionId);
        }
      }

      // Final update with complete plan
      plan = accumulatedPlan;

      // Validate that plan is not empty
      let isPlanEmpty = !plan || plan.trim().length === 0;
      if (isPlanEmpty) {
        console.warn("[Mastra] Plan is empty! Retrying planner to force text output...");

        try {
          await emitStep(requestId, siteId, planningStepNumber, 'planning', 'running', 'Retrying plan generation...', undefined, sessionId);

          // Retry with blocking generateText WITHOUT tools to force text output
          const retryResult = await generateText({
            model: openrouter.chat("google/gemini-3-flash-preview"),
            system: PLANNER_SYSTEM_PROMPT + "\n\nIMPORTANT: Do not use tools. Just write the plan immediately based on your knowledge.",
            prompt: executionPrompt,
            // tools: disabled to ensure text output
          });

          plan = retryResult.text || "";
          if (plan) {
            console.log("[Mastra] Retry successful. Plan length:", plan.length);
            isPlanEmpty = false;
          }
        } catch (retryError) {
          console.error("[Mastra] Planner retry failed:", retryError);
        }
      } else {
        console.log("[Mastra] Plan generated.", `Plan length: ${plan.trim().length} characters`);
      }

      await emitStep(requestId, siteId, planningStepNumber, 'planning', isPlanEmpty ? 'error' : 'complete', isPlanEmpty ? 'Plan generation failed' : 'Generating Architecture Plan...', { content: plan }, sessionId);

      executionPrompt = `${executionPrompt}\n\n## Implementation Plan\n${plan}\n\nIMPORTANT: Execute this plan using the tools. Call write_file for each file you need to create.`;
    }

    // Track file operations
    const fileOperations: Array<{
      type: "write" | "modify" | "delete";
      path: string;
      content?: string;
      oldText?: string;
      newText?: string;
    }> = [];

    const projectRoot = process.cwd();

    const applyOperationsToDisk = async () => {
      if (!applyToDisk) return;

      for (const op of fileOperations) {
        const absolutePath = resolveSafeProjectPath(projectRoot, op.path);
        if (!absolutePath) {
          console.warn(`[Mastra] Skipping unsafe path: ${op.path}`);
          continue;
        }

        try {
          if (op.type === "write") {
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.writeFile(absolutePath, op.content ?? "", "utf8");
          } else if (op.type === "modify") {
            const current = await fs.readFile(absolutePath, "utf8");
            if (!op.oldText || !op.newText) {
              console.warn(`[Mastra] Skipping modify without old/new text: ${op.path}`);
              continue;
            }
            if (!current.includes(op.oldText)) {
              console.warn(`[Mastra] Modify oldText not found in ${op.path}`);
              continue;
            }
            await fs.writeFile(absolutePath, current.replace(op.oldText, op.newText), "utf8");
          } else if (op.type === "delete") {
            const stat = await fs.lstat(absolutePath).catch(() => null);
            if (stat?.isDirectory()) {
              console.warn(`[Mastra] Refusing to delete directory: ${op.path}`);
              continue;
            }
            await fs.rm(absolutePath, { force: true });
          }
        } catch (e) {
          console.error(`[Mastra] Failed to apply ${op.type} on ${op.path}:`, e);
        }
      }
    };

    // Check cancellation helper
    const isCancelled = async () => {
      if (!supabase || !sessionId) return false;
      const { data } = await supabase
        .from('chat_sessions')
        .select('is_cancelled')
        .eq('id', sessionId)
        .maybeSingle();
      return data?.is_cancelled === true;
    };

    // Execute with tools using Vercel AI SDK
    console.log("[Mastra] Running Executor...");
    await emitStep(requestId, siteId, stepCounter++, 'executing', 'running', 'Executing implementation...', undefined, sessionId);

    const result = await generateText({
      model: openrouter.chat("google/gemini-3-flash-preview"),
      system: EXECUTOR_SYSTEM_PROMPT,
      prompt: executionPrompt,
      maxSteps: 15,
      tools: {
        write_file: writeFileTool,
        modify_file: modifyFileTool,
        delete_file: deleteFileTool,
        list_files: listFilesTool,
        search_files: searchFilesTool,
        read_file: readFileTool,
      },
      onStepFinish: async (step) => {
        if (await isCancelled()) {
          throw new Error("EXECUTION_CANCELLED");
        }

        const asObject = (value: unknown) => {
          if (value == null) return {};
          if (typeof value === "string") {
            try {
              const parsed = JSON.parse(value);
              return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
            } catch {
              return {};
            }
          }
          return typeof value === "object" && !Array.isArray(value) ? value : {};
        };

        const basename = (p: unknown) =>
          typeof p === "string" ? p.split("/").filter(Boolean).pop() || p : "file";

        const toolResults = Array.isArray((step as any)?.toolResults) ? (step as any).toolResults : [];
        const toolCalls = Array.isArray((step as any)?.toolCalls) ? (step as any).toolCalls : [];

        // Prefer toolResults (executed tools) so we can reliably capture validated inputs/outputs.
        const events =
          toolResults.length > 0
            ? toolResults.map((tr: any) => ({
              name: tr?.toolName,
              input: asObject(tr?.input),
              output: asObject(tr?.output),
            }))
            : toolCalls.map((tc: any) => ({
              name: tc?.toolName,
              input: asObject(tc?.input ?? tc?.args ?? tc?.parameters ?? tc?.arguments),
              output: asObject(tc?.result ?? tc?.output),
            }));

        for (const ev of events) {
          const name = ev.name;
          const input = ev.input as any;
          const output = ev.output as any;

          const payload =
            input && typeof input === "object" && Object.keys(input).length > 0 ? input : output;

          console.log(`[Executor] ${name}:`, payload?.path || payload?.command || JSON.stringify(payload || {}));

          if (name === "write_file" && typeof payload?.path === "string") {
            const content = typeof payload.content === "string" ? payload.content : "";
            fileOperations.push({ type: "write", path: payload.path, content });
            await emitStep(
              requestId,
              siteId,
              200 + fileOperations.length,
              "write_file",
              "complete",
              `Writing ${basename(payload.path)}`,
              { content: content.slice(0, 500) },
              sessionId
            );
          } else if (name === "modify_file" && typeof payload?.path === "string") {
            const oldText = typeof payload.oldText === "string" ? payload.oldText : "";
            const newText = typeof payload.newText === "string" ? payload.newText : "";
            fileOperations.push({ type: "modify", path: payload.path, oldText, newText });
            await emitStep(
              requestId,
              siteId,
              200 + fileOperations.length,
              "modify_file",
              "complete",
              `Modifying ${basename(payload.path)}`,
              { content: newText.slice(0, 500) },
              sessionId
            );
          } else if (name === "delete_file" && typeof payload?.path === "string") {
            fileOperations.push({ type: "delete", path: payload.path });
            await emitStep(
              requestId,
              siteId,
              200 + fileOperations.length,
              "delete_file",
              "complete",
              `Deleting ${basename(payload.path)}`,
              undefined,
              sessionId
            );
          } else if (name === "run_command" && typeof payload?.command === "string") {
            await emitStep(
              requestId,
              siteId,
              200 + fileOperations.length + 1,
              "run_command",
              "complete",
              `Running: ${payload.command}`,
              undefined,
              sessionId
            );
          } else if (["list_files", "search_files", "read_file"].includes(name || "")) {
            // Just log read operations without emitting a step to keep UI clean
            // or emit a debug step if needed. For now, silence the warning.
          } else {
            console.warn(`[Executor] ${name}: missing args/result payload`, { payload });
          }
        }
      },
    });

    console.log(`[Mastra] Execution complete. ${fileOperations.length} file operations.`);

    await applyOperationsToDisk();

    // Emit completion
    await emitStep(requestId, siteId, 999, 'complete', 'complete', `Task completed with ${fileOperations.length} file operations.`, undefined, sessionId);

    return NextResponse.json({
      success: true,
      text: result.text || "Task completed.",
      fileOperations,
      appliedToDisk: applyToDisk,
      steps: result.steps?.map((s: any, i: number) => ({
        stepNumber: i,
        toolCalls: s.toolCalls || [],
      })) || [],
      usage: result.usage || {},
    });
  } catch (error: any) {
    if (error.message === "EXECUTION_CANCELLED") {
      return NextResponse.json({ success: false, cancelled: true, text: "Execution stopped by user." });
    }
    console.error("[Mastra API Error]", error);
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}
