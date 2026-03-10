// Executor Agent - Task-by-task execution with progress tracking
// Routes to Pro/Flash based on per-task complexity
// Uses observation masking to keep context lean

import { generateText, stepCountIs } from "ai";
import { selectModel, type Complexity } from "../router";
import { getExecutorTools, type FileOperation, type DatabaseContext } from "../tools/enhanced-tools";
import type { ExecutionPlan, PlanTask } from "./PlanAgent";
import { compactToolResults } from "../context/compaction";
import { ANIMATION_SKILLS, IMAGE_RULES } from "../prompts/skills";

// --- Types ---

export interface TaskResult {
  taskId: number;
  status: "completed" | "failed";
  filesWritten: string[];
  filesModified: string[];
  error?: string;
}

export interface ExecutionResult {
  taskResults: TaskResult[];
  fileOperations: FileOperation[];
  totalSteps: number;
  output: string;
}

export type EmitFn = (event: Record<string, unknown>) => void;
export type StepFn = (
  requestId: string,
  siteId: string,
  stepNumber: number,
  toolName: string,
  status: string,
  message: string,
  details?: any,
  sessionId?: string,
) => Promise<void>;

// --- System Prompt ---

const EXECUTOR_SYSTEM_PROMPT = `You are an expert full-stack developer executing a specific task from an implementation plan.

## WORKFLOW (CRITICAL)
1. SEARCH before reading: use grep_files to find relevant code, then read_file with line ranges
2. READ before writing: always read_file to see current content before editing
3. WRITE using write_file (new files) or edit_file (surgical edits to existing files)
4. VERIFY after writing: read_file the modified file to confirm changes are correct

## RULES
- Execute ONLY the current task. Do not work on other tasks.
- "content" for write_file must be the COMPLETE file source code.
- For edit_file, the oldText must be an EXACT unique match. Read the file first.
- Ensure all imports and syntax are correct.
- For images, use curated Unsplash IDs from the IMAGE RULES section or picsum.photos. NEVER invent Unsplash photo IDs.
- When modifying layout.tsx, PRESERVE <html> and <body> tags.
- After writing important files, use read_file to verify the content.

## BRAND RULES (CRITICAL)
- ALWAYS use the brand/store/company name from the user's request. If they say "for Furry", the brand name is "Furry" — use it in navbar, hero, footer, metadata. NEVER invent a different name.
- ALWAYS use the color theme the user specified. Do not override with defaults.

## MODIFICATION RULES (CRITICAL)
When modifying existing files:
- ONLY change what the task explicitly describes. Do not alter unrelated code.
- Preserve brand names, content text, layout structure, and image URLs unless the task says otherwise.
- Prefer edit_file (surgical edits) over write_file (full rewrite) for existing files.
- When user says "change X to Y", find X and replace with Y. Do NOT rewrite the entire file.

## RESPONSE FORMAT
After completing the task, respond with a ONE-SENTENCE summary of what was done.`;

// --- Fast Path Executor (simple edits, no plan needed) ---

export async function executeFastPath(
  message: string,
  virtualFS: Map<string, string>,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  emit: EmitFn,
  emitStep: StepFn,
  requestId: string,
  siteId: string,
  sessionId?: string,
): Promise<ExecutionResult> {
  const config = selectModel("execute", "simple");
  const tools = getExecutorTools(virtualFS);
  const fileOperations: FileOperation[] = [];
  let stepCounter = 1;

  // Build context with file list (not full contents)
  const fileList = Array.from(virtualFS.keys()).sort().join("\n");
  let prompt = `## Project Files\n${fileList || "(empty project)"}\n\n## Request\n${message}`;

  if (conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-4);
    prompt = recent.map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join("\n") + "\n\nUser: " + prompt;
  }

  try {
    const result = await generateText({
      model: config.model,
      system: EXECUTOR_SYSTEM_PROMPT + "\n\n" + ANIMATION_SKILLS + "\n\n" + IMAGE_RULES,
      prompt,
      tools,
      stopWhen: stepCountIs(config.maxSteps),
      onStepFinish: async (step) => {
        const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
        for (const tc of toolCalls) {
          const args = (tc as any).args || (tc as any).input || {};
          handleToolCallEmission(tc.toolName, args, virtualFS, fileOperations, emit, emitStep, requestId, siteId, stepCounter++, sessionId);
        }
      },
    });

    return {
      taskResults: [{ taskId: 0, status: "completed", filesWritten: fileOperations.filter((o) => o.type === "write").map((o) => o.path), filesModified: fileOperations.filter((o) => o.type === "modify").map((o) => o.path) }],
      fileOperations,
      totalSteps: stepCounter,
      output: result.text || "Changes applied.",
    };
  } catch (error: any) {
    return {
      taskResults: [{ taskId: 0, status: "failed", filesWritten: [], filesModified: [], error: error.message }],
      fileOperations,
      totalSteps: stepCounter,
      output: `Error: ${error.message}`,
    };
  }
}

// --- Plan Executor (task-by-task with tracking) ---

export async function executePlan(
  plan: ExecutionPlan,
  virtualFS: Map<string, string>,
  emit: EmitFn,
  emitStep: StepFn,
  requestId: string,
  siteId: string,
  sessionId?: string,
  isCancelled?: () => Promise<boolean>,
): Promise<ExecutionResult> {
  const allFileOps: FileOperation[] = [];
  const taskResults: TaskResult[] = [];
  let globalStepCounter = 10; // Start at 10 to leave room for explore/plan steps
  let conversationMemory: Array<{ role: string; content: string }> = [];

  // Emit initial task progress
  emitTaskProgress(plan.tasks, taskResults, emit);

  for (const task of plan.tasks) {
    // Check cancellation
    if (isCancelled && (await isCancelled())) {
      emit({ type: "status", message: "Execution cancelled by user." });
      break;
    }

    // Emit task started
    emit({ type: "task_started", taskId: task.id, description: task.description });
    await emitStep(requestId, siteId, globalStepCounter++, "task_start", "running", `Task ${task.id}: ${task.description}`, undefined, sessionId);

    const taskResult = await executeTask(
      task,
      plan,
      virtualFS,
      conversationMemory,
      emit,
      emitStep,
      requestId,
      siteId,
      globalStepCounter,
      sessionId,
    );

    globalStepCounter += taskResult.steps;
    allFileOps.push(...taskResult.fileOperations);

    taskResults.push({
      taskId: task.id,
      status: taskResult.success ? "completed" : "failed",
      filesWritten: taskResult.fileOperations.filter((o) => o.type === "write").map((o) => o.path),
      filesModified: taskResult.fileOperations.filter((o) => o.type === "modify").map((o) => o.path),
      error: taskResult.error,
    });

    // Emit task completion
    if (taskResult.success) {
      emit({ type: "task_completed", taskId: task.id });
      await emitStep(requestId, siteId, globalStepCounter++, "task_complete", "complete", `Task ${task.id}: ${task.description}`, undefined, sessionId);
    } else {
      emit({ type: "task_failed", taskId: task.id, error: taskResult.error });
      await emitStep(requestId, siteId, globalStepCounter++, "task_failed", "error", `Task ${task.id} failed: ${taskResult.error}`, undefined, sessionId);
    }

    // Update task progress
    emitTaskProgress(plan.tasks, taskResults, emit);

    // Observation masking: compact conversation memory after each task
    conversationMemory = compactToolResults(conversationMemory, taskResult.summary);
  }

  const successCount = taskResults.filter((t) => t.status === "completed").length;
  const output = `Completed ${successCount}/${plan.tasks.length} tasks. ${allFileOps.length} file operations total.`;

  return {
    taskResults,
    fileOperations: allFileOps,
    totalSteps: globalStepCounter,
    output,
  };
}

// --- Single Task Execution ---

interface SingleTaskResult {
  success: boolean;
  fileOperations: FileOperation[];
  steps: number;
  error?: string;
  summary: string;
}

async function executeTask(
  task: PlanTask,
  plan: ExecutionPlan,
  virtualFS: Map<string, string>,
  conversationMemory: Array<{ role: string; content: string }>,
  emit: EmitFn,
  emitStep: StepFn,
  requestId: string,
  siteId: string,
  stepBase: number,
  sessionId?: string,
): Promise<SingleTaskResult> {
  const complexity = task.complexity as Complexity;
  const config = selectModel("execute", complexity);
  const tools = getExecutorTools(virtualFS);
  const fileOperations: FileOperation[] = [];
  let stepCounter = 0;

  // Build task-specific prompt
  const taskFiles = task.files.join(", ");
  const deps = task.dependencies?.length
    ? `\nDependencies (already completed): Tasks ${task.dependencies.join(", ")}`
    : "";

  const prompt = `## Current Task (${task.id}/${plan.tasks.length})
**${task.description}**
Type: ${task.type}
Files: ${taskFiles}
Verification: ${task.verification}${deps}

## Overall Plan Summary
${plan.summary}

## Available Files
${Array.from(virtualFS.keys()).sort().join("\n")}

Execute this task using the tools. Remember: search/read first, then write, then verify.`;

  try {
    const result = await generateText({
      model: config.model,
      system: EXECUTOR_SYSTEM_PROMPT + "\n\n" + ANIMATION_SKILLS + "\n\n" + IMAGE_RULES,
      prompt,
      tools,
      stopWhen: stepCountIs(Math.min(config.maxSteps, 8)), // Cap at 8 steps per task
      onStepFinish: async (step) => {
        const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
        for (const tc of toolCalls) {
          stepCounter++;
          const args = (tc as any).args || (tc as any).input || {};
          await handleToolCallEmission(
            tc.toolName, args, virtualFS, fileOperations, emit, emitStep,
            requestId, siteId, stepBase + stepCounter, sessionId,
          );
        }
      },
    });

    return {
      success: true,
      fileOperations,
      steps: stepCounter + 1,
      summary: result.text || `Task ${task.id} completed.`,
    };
  } catch (error: any) {
    return {
      success: false,
      fileOperations,
      steps: stepCounter + 1,
      error: error.message,
      summary: `Task ${task.id} failed: ${error.message}`,
    };
  }
}

// --- Helpers ---

function normalizePath(p: string): string {
  return (p || "").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

async function handleToolCallEmission(
  toolName: string,
  args: Record<string, any>,
  virtualFS: Map<string, string>,
  fileOperations: FileOperation[],
  emit: EmitFn,
  emitStep: StepFn,
  requestId: string,
  siteId: string,
  stepNumber: number,
  sessionId?: string,
) {
  const basename = (p: unknown) =>
    typeof p === "string" ? p.split("/").filter(Boolean).pop() || p : "file";

  if (toolName === "write_file" && typeof args.path === "string") {
    const content = typeof args.content === "string" ? args.content : "";
    const normalizedPath = normalizePath(args.path);
    const op: FileOperation = { type: "write", path: normalizedPath, content };
    fileOperations.push(op);
    emit({ type: "file_op", operation: op });
    await emitStep(requestId, siteId, 200 + fileOperations.length, "write_file", "complete", `Writing ${basename(args.path)}`, { content: content.slice(0, 500) }, sessionId);
  } else if (toolName === "edit_file" && typeof args.path === "string") {
    const normalizedPath = normalizePath(args.path);
    const fullContent = virtualFS.get(normalizedPath) || "";
    const op: FileOperation = { type: "modify", path: normalizedPath, oldText: args.oldText, newText: args.newText, content: fullContent };
    fileOperations.push(op);
    emit({ type: "file_op", operation: { type: "write", path: normalizedPath, content: fullContent } });
    await emitStep(requestId, siteId, 200 + fileOperations.length, "edit_file", "complete", `Editing ${basename(args.path)}`, { content: (args.newText || "").slice(0, 500) }, sessionId);
  } else if (toolName === "delete_file" && typeof args.path === "string") {
    const normalizedPath = normalizePath(args.path);
    const op: FileOperation = { type: "delete", path: normalizedPath };
    fileOperations.push(op);
    emit({ type: "file_op", operation: op });
    await emitStep(requestId, siteId, 200 + fileOperations.length, "delete_file", "complete", `Deleting ${basename(args.path)}`, undefined, sessionId);
  } else if (toolName === "read_file") {
    await emitStep(requestId, siteId, stepNumber, "read_file", "complete", `Reading ${basename(args.path || "")}`, undefined, sessionId);
  } else if (toolName === "grep_files") {
    await emitStep(requestId, siteId, stepNumber, "grep_files", "complete", `Searching: "${(args.pattern || "").slice(0, 50)}"`, undefined, sessionId);
  } else if (toolName === "glob_files") {
    await emitStep(requestId, siteId, stepNumber, "glob_files", "complete", `Finding files: ${(args.pattern || "").slice(0, 50)}`, undefined, sessionId);
  } else if (toolName === "web_search") {
    await emitStep(requestId, siteId, stepNumber, "web_search", "complete", `Searching: "${(args.query || "").slice(0, 50)}"`, undefined, sessionId);
  } else if (toolName === "web_scrape") {
    await emitStep(requestId, siteId, stepNumber, "web_scrape", "complete", `Reading ${(args.url || "").slice(0, 60)}`, undefined, sessionId);
  } else if (toolName === "list_files" || toolName === "search_files") {
    await emitStep(requestId, siteId, stepNumber, toolName, "complete", "Listing project files", undefined, sessionId);
  }
}

function emitTaskProgress(
  allTasks: PlanTask[],
  completedResults: TaskResult[],
  emit: EmitFn,
) {
  const completedIds = new Set(completedResults.map((r) => r.taskId));
  const failedIds = new Set(
    completedResults.filter((r) => r.status === "failed").map((r) => r.taskId),
  );

  const tasks = allTasks.map((t) => ({
    id: t.id,
    description: t.description,
    status: failedIds.has(t.id)
      ? "failed"
      : completedIds.has(t.id)
        ? "completed"
        : "pending",
  }));

  emit({ type: "task_progress", tasks });
}
