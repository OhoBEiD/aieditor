// AI Chat Route - Main entry point for the frontend (via Vercel AI SDK useChat)
// ENHANCED orchestrator: Classify → RepoMap → Brain → Explore → Interactive Proposals → Plan → Execute (MCTS + Reflection) → Tests → Build Validate → Visual Verify → Final Verify
// Includes: dynamic prompts, parallel execution, quality scoring, self-healing build loop, model fallback
// Plus: artifacts, persistent brain, speculative editing, auto test generation, visual verification, interactive mode
// Delivers file operations as <!--FILE_OP:--> markers and artifacts as <!--ARTIFACT:--> markers
// Thinking steps are emitted to Supabase Realtime for the ThinkingSteps component

import { NextRequest } from "next/server";
import {
  createUIMessageStreamResponse,
  createUIMessageStream,
} from "ai";
import { emitStep, getSupabaseClient } from "@/lib/ai/AIService";
import { classifyIntent } from "@/lib/ai/agents/IntentClassifier";
import { executeVercelUIAgent } from "@/lib/ai/agents/VercelUIAgent";
import { runExploreAgent } from "@/lib/ai/agents/ExploreAgent";
import { runPlanAgent, runReplanAgent, type ExecutionPlan } from "@/lib/ai/agents/PlanAgent";
import { runVerifyAgent, type VerificationResult } from "@/lib/ai/agents/VerifyAgent";
import { runBuildValidationLoop } from "@/lib/ai/agents/BuildValidator";
import { generateReflection, formatReflectionsForPrompt, type Reflection } from "@/lib/ai/agents/ReflectionAgent";
import { scoreTaskOutput } from "@/lib/ai/agents/QualityScorer";
import { speculativeExecute, shouldUseSpeculation } from "@/lib/ai/agents/SpeculativeExecutor";
import { generateTests } from "@/lib/ai/agents/TestGenerator";
import { getFlashModel, selectModel, selectModelWithFallback, generateTextWithFallback, type Complexity } from "@/lib/ai/router";
import { createEnhancedTools, type FileOperation, type DatabaseContext } from "@/lib/ai/tools/enhanced-tools";
import { compactToolResults } from "@/lib/ai/context/compaction";
import { buildRepoMap, getCompactRepoMap, type RepoMap } from "@/lib/ai/context/repo-map";
import { buildDynamicSystemPrompt, type DynamicPromptContext } from "@/lib/ai/prompts/dynamic-prompt-builder";
import { loadBrain, extractAndSaveLearnings, formatBrainForPrompt, type BrainEntry } from "@/lib/ai/context/brain";
import { resetArtifactCounter, emitPlanArtifact, emitQualityArtifact, emitBranchComparisonArtifact, emitTestResultArtifact, emitBrainUpdateArtifact, emitScreenshotArtifact, emitProposalArtifact } from "@/lib/ai/artifacts/emitter";
import { generateProposals, parseOptionSelection, shouldUseInteractiveMode, type ApproachOption } from "@/lib/ai/agents/InteractiveProposer";
import { z } from "zod";
import { generateText as generateTextBase, stepCountIs } from "ai";

export const maxDuration = 300;

// --- Retry wrapper (kept for fast path) ---

async function generateTextWithRetry(
  options: Parameters<typeof generateTextBase>[0],
  maxRetries = 2,
  delayMs = 2000,
): ReturnType<typeof generateTextBase> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateTextBase(options);
    } catch (err: any) {
      lastError = err;
      const status = err?.statusCode || err?.data?.error?.code;
      const isRetryable = status === 500 || status === 502 || status === 503 || status === 429
        || err?.message?.includes("Internal Server Error")
        || err?.message?.includes("Invalid JSON response");
      if (!isRetryable || attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

// --- Helpers ---

function normalizePath(p: string): string {
  return (p || "").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

interface SupabaseContext {
  projectUrl: string;
  schema: { tables: Array<{ name: string; columns: Array<{ name: string; type: string; is_nullable: boolean }> }> } | null;
  hasServiceRoleKey: boolean;
}

interface RequestBody {
  message: string;
  files?: Record<string, string>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  mode?: "thinking" | "fast" | "mastra";
  requestId?: string;
  siteId?: string;
  conversationId?: string;
  supabaseContext?: SupabaseContext;
  selectedOption?: number;                    // User's selected approach (1-3) from interactive proposals
  pendingProposal?: {                         // Stored proposal context for option selection
    originalMessage: string;
    options: ApproachOption[];
  };
}

// --- Base System Prompt ---

const BASE_EXECUTOR_PROMPT = `You are a world-class frontend engineer executing code changes to build stunning web experiences.
Your signature style: liquid glass morphism, GSAP scroll animations, premium typography, and cinematic layouts.

## WORKFLOW (CRITICAL)
1. SEARCH: Use grep_files to find relevant code before reading files
2. READ: Use read_file with line ranges to see current content before editing
3. WRITE: Use write_file (new files) or edit_file (surgical edits)
4. VERIFY: Use read_file to confirm your changes applied correctly

## DESIGN RULES
- **Glass morphism**: backdrop-blur-xl, bg-white/[0.05], border border-white/[0.08], rounded-2xl, shadow-[0_8px_32px_rgba(0,0,0,0.12)]
- **Floating orbs**: 3-5 gradient blurred circles as background decoration on every page
- **Grain overlay**: Subtle noise texture (use CSS SVG filter) on the body
- **Typography**: Use next/font/google — Inter for body, Space Grotesk for headings. Hero text: text-5xl md:text-7xl font-bold tracking-tight
- **GSAP animations**: ScrollTrigger on every section (fade up + stagger), word-by-word hero reveal, parallax images, floating orb animation, counter stats
- **Images**: ALWAYS use real Unsplash URLs (https://images.unsplash.com/photo-{id}?w=1920&q=80&fit=crop). Avatars from randomuser.me. NEVER placeholder images.
- **Icons**: Lucide React for all iconography
- **Spacing**: Full-width sections, max-w-7xl mx-auto px-4 sm:px-6 lg:px-8, py-24 lg:py-32 between sections
- **Color**: CSS variables for theming. Dark theme default for SaaS/tech.
- **Components**: Create 8-10 separate component files for landing pages (Navbar, Hero, LogoCloud, Features, Showcase, Testimonials, Stats, Pricing, CTA, Footer)
- Every animated component MUST have "use client" directive and guard GSAP with typeof window !== "undefined"

## CODE RULES
- "content" for write_file must be the COMPLETE file source code
- For edit_file, oldText must be an EXACT unique match. Read the file first.
- When modifying layout.tsx, PRESERVE <html> and <body> tags
- After updating package.json, MUST run npm install
- All files use .tsx extension for React, .ts for non-UI

## RESPONSE FORMAT
After completing all file operations, respond with a SHORT summary (2-3 sentences max).`;

// --- Main Route ---

export async function POST(req: NextRequest) {
  const body: RequestBody = await req.json();
  const {
    message,
    files = {},
    conversationHistory = [],
    mode = "mastra",
    requestId = `req_${Date.now()}`,
    siteId = "unknown",
    conversationId,
    supabaseContext,
    selectedOption,
    pendingProposal,
  } = body;

  const sessionId = conversationId;
  const supabaseDb = getSupabaseClient();

  // Build virtual filesystem
  const virtualFS = new Map<string, string>();
  for (const [filePath, content] of Object.entries(files)) {
    const n = normalizePath(filePath);
    if (n) virtualFS.set(n, content);
  }

  // Build database context for AI SQL tools
  const protocol = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "localhost:3000";
  const baseUrl = `${protocol}://${host}`;
  const dbContext: DatabaseContext | undefined =
    siteId && siteId !== "unknown" ? { siteId, baseUrl } : undefined;

  // Check if this is an option selection from interactive mode
  const optionFromMessage = parseOptionSelection(message);
  const resolvedOption = selectedOption || optionFromMessage;

  // Classify intent
  const classification = await classifyIntent(
    resolvedOption && pendingProposal ? pendingProposal.originalMessage : message,
  );
  console.log(`[AI Chat] Intent: ${classification.type}, complexity: ${classification.complexity}, route: ${classification.route}${resolvedOption ? `, selectedOption: ${resolvedOption}` : ""}`);

  // UI tasks route to VercelUIAgent
  if (classification.type === "ui_task") {
    return handleUITask({ message, files, requestId, siteId, sessionId });
  }

  // Questions route to direct LLM response
  if (classification.type === "question") {
    return handleQuestion({ message, files, conversationHistory, requestId, siteId, sessionId });
  }

  // --- All other tasks: Enhanced Orchestrated Pipeline ---
  const fileOperations: Array<FileOperation> = [];
  let stepCounter = 1;
  const msgId = `msg_${Date.now()}`;

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          writer.write({ type: "start", messageId: msgId });

          // Cancellation check
          const isCancelled = async () => {
            if (!supabaseDb || !sessionId) return false;
            const { data } = await supabaseDb
              .from("chat_sessions")
              .select("is_cancelled")
              .eq("id", sessionId)
              .maybeSingle();
            return data?.is_cancelled === true;
          };

          const basename = (p: unknown) =>
            typeof p === "string" ? p.split("/").filter(Boolean).pop() || p : "file";

          const sendFileOp = (op: FileOperation) => {
            const opId = `file_op_${fileOperations.length}`;
            writer.write({ type: "text-start", id: opId });
            writer.write({
              type: "text-delta",
              id: opId,
              delta: `\n<!--FILE_OP:${JSON.stringify(op)}-->\n`,
            });
            writer.write({ type: "text-end", id: opId });
          };

          // Reset artifact counter for this request
          resetArtifactCounter();

          await emitStep(requestId, siteId, stepCounter++, "thinking", "running", "Analyzing request...", undefined, sessionId);

          // ================================
          // PHASE 0: Build Repository Map
          // ================================
          let repoMap: RepoMap | null = null;
          if (virtualFS.size > 0) {
            repoMap = buildRepoMap(virtualFS);
            await emitStep(requestId, siteId, stepCounter++, "repo_map", "complete",
              `Mapped ${repoMap.files.size} files, ${repoMap.componentRegistry.length} components`,
              undefined, sessionId);
          }

          // ================================
          // PHASE 0.5: Load Persistent Brain
          // ================================
          let brainEntries: BrainEntry[] = [];
          if (siteId && siteId !== "unknown") {
            brainEntries = await loadBrain(siteId);
            if (brainEntries.length > 0) {
              await emitStep(requestId, siteId, stepCounter++, "brain_load", "complete",
                `Loaded ${brainEntries.length} learned patterns from previous sessions`,
                undefined, sessionId);
            }
          }

          // Build dynamic system prompt with project-aware context + brain
          const dynamicPromptContext: DynamicPromptContext = {
            repoMap,
            exploration: null,
            virtualFS,
          };
          let systemPrompt = buildDynamicSystemPrompt(BASE_EXECUTOR_PROMPT, dynamicPromptContext);

          // Inject brain knowledge into system prompt
          const brainContext = formatBrainForPrompt(brainEntries);
          if (brainContext) {
            systemPrompt += "\n\n" + brainContext;
          }

          // Inject connected database context
          if (supabaseContext?.schema?.tables?.length) {
            const tableNames = supabaseContext.schema.tables.map((t: any) => t.name);
            systemPrompt += `\n\n## Connected Database\nThis project has a connected Supabase database with ${tableNames.length} tables: ${tableNames.join(", ")}.\nYou have tools to read the schema (read_database_schema), list tables (list_database_tables), and execute SQL (execute_sql).\n- Use read_database_schema to see column details before writing queries.\n- Prefer SELECT queries when the user asks to "check" or "look at" data.\n- For INSERT/UPDATE/DELETE/DDL, confirm the operation is what the user intended.`;
          }

          // ==========================
          // FAST PATH (simple edits)
          // ==========================
          if (classification.route === "fast_path") {
            await emitStep(requestId, siteId, stepCounter++, "routing", "complete", `Fast path: ${classification.type}`, undefined, sessionId);

            const chain = selectModelWithFallback("execute", "simple");
            const tools = createEnhancedTools(virtualFS, dbContext);

            // Include repo map summary in fast path
            const repoMapSummary = repoMap ? getCompactRepoMap(repoMap, 400) : "";
            const fileList = Array.from(virtualFS.keys()).sort().join("\n");

            let prompt = `## Project Files\n${fileList || "(empty project)"}\n${repoMapSummary ? `\n${repoMapSummary}\n` : ""}\n## Request\n${message}`;
            if (conversationHistory.length > 0) {
              const recent = conversationHistory.slice(-4);
              prompt = recent.map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join("\n") + "\n\nUser: " + prompt;
            }

            const result = await generateTextWithFallback({
              model: chain.primary.model,
              system: systemPrompt,
              prompt,
              stopWhen: stepCountIs(chain.primary.maxSteps),
              tools,
              onStepFinish: async (step) => {
                if (await isCancelled()) throw new Error("EXECUTION_CANCELLED");
                await handleToolCalls(step, virtualFS, fileOperations, sendFileOp, emitStep, requestId, siteId, stepCounter++, sessionId, basename);
              },
            }, chain);

            // Run build validation on fast path too
            if (fileOperations.length > 0) {
              const buildResult = await runBuildValidationLoop(
                virtualFS, fileOperations,
                async (stepNum, toolName, status, msg, details) => {
                  await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, details, sessionId);
                },
                stepCounter,
                2, // max 2 iterations for fast path
              );
              stepCounter += buildResult.iterations * 3;

              // Send any fix file ops to the stream
              for (const op of buildResult.fileOperations) {
                sendFileOp(op);
                fileOperations.push(op);
              }
            }

            await emitStep(requestId, siteId, 999, "complete", "complete", `Done: ${fileOperations.length} file operations`, undefined, sessionId);

            writeTextToStream(writer, result.text || "Changes applied.", msgId);
            writeDoneMarker(writer, fileOperations.length);
            writer.write({ type: "finish", finishReason: "stop" });
            return;
          }

          // ==========================
          // FULL PIPELINE (complex tasks)
          // ==========================

          // --- Phase 1.5: Interactive Proposals (for complex/moderate tasks) ---
          // Show proposals BEFORE exploring — proposals are about approach, not existing code.
          // Exploration happens after the user picks an approach (more targeted).
          const isFollowUp = conversationHistory.length > 0 && !pendingProposal;
          let selectedApproach: string | null = null;

          if (shouldUseInteractiveMode(classification.complexity, isFollowUp) && !resolvedOption) {
            await emitStep(requestId, siteId, stepCounter++, "proposing", "running", "Researching approaches...", undefined, sessionId);

            // Light exploration: just pass file list for context, skip full agent explore
            const proposals = await generateProposals(message, null, virtualFS, brainEntries);

            // Emit proposal artifact for the frontend
            emitProposalArtifact(writer,
              proposals.options.map(opt => ({
                id: opt.id,
                title: opt.title,
                description: opt.description,
                complexity: opt.complexity,
                estimatedFiles: opt.estimatedFiles,
                pros: opt.tradeoffs.pros,
                cons: opt.tradeoffs.cons,
              })),
              proposals.recommendation,
              proposals.recommendationReason,
              proposals.researchSummary,
            );

            await emitStep(requestId, siteId, stepCounter++, "proposing", "complete",
              `Generated ${proposals.options.length} approaches — waiting for selection`,
              undefined, sessionId);
            writeDoneMarker(writer, 0);
            writer.write({ type: "finish", finishReason: "stop" });
            return; // Stop here — wait for user selection
          }

          // If user selected an option, use that approach for planning
          if (resolvedOption && pendingProposal) {
            const chosen = pendingProposal.options.find(o => o.id === resolvedOption);
            if (chosen) {
              selectedApproach = chosen.approach;
              await emitStep(requestId, siteId, stepCounter++, "option_selected", "complete",
                `Selected Option ${chosen.id}: ${chosen.title}`,
                undefined, sessionId);
            }
          }

          // --- Phase 1: Explore (after option selection or for non-interactive tasks) ---
          let exploration = null;
          if (virtualFS.size > 5) {
            // Only explore if the project has meaningful code (>5 files = not just a scaffold)
            await emitStep(requestId, siteId, stepCounter++, "exploring", "running", "Exploring codebase...", undefined, sessionId);

            exploration = await runExploreAgent(
              selectedApproach ? `${message}\n\nApproach: ${selectedApproach}` : message,
              virtualFS,
              async (toolName, status, msg) => {
                await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, undefined, sessionId);
              },
              dbContext,
            );

            // Update dynamic prompt with exploration results
            dynamicPromptContext.exploration = exploration;
            systemPrompt = buildDynamicSystemPrompt(BASE_EXECUTOR_PROMPT, dynamicPromptContext);

            await emitStep(requestId, siteId, stepCounter++, "exploring", "complete", "Codebase exploration complete", { content: exploration.summary.slice(0, 500) }, sessionId);
          }

          if (await isCancelled()) {
            writeTextToStream(writer, "Cancelled.", msgId);
            writer.write({ type: "finish", finishReason: "stop" });
            return;
          }

          // --- Phase 2: Plan ---
          const planStepNum = stepCounter++;
          await emitStep(requestId, siteId, planStepNum, "planning", "running", "Creating implementation plan...", undefined, sessionId);

          // If an approach was selected, augment the message with the approach details
          const planMessage = selectedApproach
            ? `${message}\n\n## Selected Approach\n${selectedApproach}`
            : message;

          const plan = await runPlanAgent(
            planMessage, exploration, virtualFS,
            classification.complexity,
            conversationHistory,
            async (toolName, status, msg, details) => {
              if (toolName === "planning") {
                await emitStep(requestId, siteId, planStepNum, "planning", status, msg, details, sessionId);
              } else {
                await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, details, sessionId);
              }
            },
            dbContext,
          );

          await emitStep(requestId, siteId, planStepNum, "planning", "complete", "Plan created", { content: plan.summary }, sessionId);

          // Emit plan artifact
          emitPlanArtifact(writer, plan.tasks.map(t => ({
            id: String(t.id),
            description: t.description,
            dependencies: (t.dependencies || []).map(String),
            complexity: t.complexity,
          })));

          if (await isCancelled()) {
            writeTextToStream(writer, "Cancelled.", msgId);
            writer.write({ type: "finish", finishReason: "stop" });
            return;
          }

          // --- Phase 3: Execute tasks with Reflection + Incremental Verification + MCTS ---
          await emitStep(requestId, siteId, stepCounter++, "executing", "running", "Executing implementation...", undefined, sessionId);

          let execOutput = "";
          let conversationMemory: Array<{ role: string; content: string }> = [];
          const reflections: Reflection[] = [];
          const taskResults: Array<{ taskId: number; success: boolean; error?: string }> = [];

          // Group tasks by dependency level for parallel execution
          const taskLevels = groupTasksByDependencyLevel(plan.tasks);

          for (const level of taskLevels) {
            if (await isCancelled()) break;

            // Execute tasks in this level in parallel
            const levelPromises = level.map(async (task) => {
              await emitStep(requestId, siteId, stepCounter++, "task_start", "running", `Task ${task.id}: ${task.description}`, undefined, sessionId);

              const taskComplexity = task.complexity as Complexity;

              // --- MCTS Speculative Execution for complex tasks ---
              if (shouldUseSpeculation(taskComplexity, plan.tasks.length)) {
                try {
                  await emitStep(requestId, siteId, stepCounter++, "speculative", "running",
                    `Exploring 3 approaches for Task ${task.id}...`, undefined, sessionId);

                  const specResult = await speculativeExecute(
                    { id: String(task.id), description: task.description, complexity: taskComplexity },
                    virtualFS,
                    systemPrompt,
                    repoMap,
                    3,
                    dbContext,
                  );

                  // Apply winning branch's file operations
                  for (const op of specResult.selectedBranch.fileOperations) {
                    fileOperations.push(op);
                    sendFileOp(op);
                  }

                  // Update virtualFS from winning branch
                  for (const [path, content] of specResult.selectedBranch.virtualFS.entries()) {
                    virtualFS.set(path, content);
                  }

                  execOutput = specResult.selectedBranch.text || "";
                  taskResults.push({ taskId: task.id, success: true });

                  // Emit branch comparison artifact
                  emitBranchComparisonArtifact(writer,
                    specResult.allBranches.map(b => ({
                      id: b.branchId,
                      strategy: b.strategy,
                      qualityScore: b.qualityScore,
                      errorCount: b.errorCount,
                      selected: b.branchId === specResult.selectedBranch.branchId,
                    })),
                    specResult.selectedBranch.branchId,
                    specResult.reason,
                  );

                  await emitStep(requestId, siteId, stepCounter++, "speculative", "complete",
                    `Selected ${specResult.selectedBranch.strategy} approach (score: ${specResult.selectedBranch.combinedScore})`,
                    undefined, sessionId);

                  const reflection = await generateReflection(
                    task.id, task.description, true, execOutput,
                  );
                  reflections.push(reflection);
                  conversationMemory = compactToolResults(conversationMemory, `Task ${task.id} completed (speculative): ${task.description}`);
                  return;
                } catch (specError: any) {
                  if (specError.message === "EXECUTION_CANCELLED") throw specError;
                  // Fall through to normal execution if speculation fails
                  console.warn(`[Speculative] Falling back to normal execution for task ${task.id}:`, specError.message);
                }
              }

              // --- Normal Execution ---
              const chain = selectModelWithFallback("execute", taskComplexity);
              const tools = createEnhancedTools(virtualFS, dbContext);

              // Build task prompt with reflections from previous tasks
              const reflectionContext = formatReflectionsForPrompt(reflections);
              const repoMapContext = repoMap ? getCompactRepoMap(repoMap, 500) : "";

              const taskPrompt = `## Current Task (${task.id}/${plan.tasks.length})
**${task.description}**
Type: ${task.type}
Files: ${task.files.join(", ")}
Verification: ${task.verification}

## Overall Plan: ${plan.summary}
${repoMapContext ? `\n${repoMapContext}\n` : ""}
## Available Files: ${Array.from(virtualFS.keys()).sort().join("\n")}
${reflectionContext}
Execute this task. Search/read first, then write, then verify.`;

              try {
                const taskResult = await generateTextWithFallback({
                  model: chain.primary.model,
                  system: systemPrompt,
                  prompt: taskPrompt,
                  stopWhen: stepCountIs(Math.min(chain.primary.maxSteps, 10)),
                  tools,
                  onStepFinish: async (step) => {
                    if (await isCancelled()) throw new Error("EXECUTION_CANCELLED");
                    await handleToolCalls(step, virtualFS, fileOperations, sendFileOp, emitStep, requestId, siteId, stepCounter++, sessionId, basename);
                  },
                }, chain);

                execOutput = taskResult.text || "";
                taskResults.push({ taskId: task.id, success: true });

                await emitStep(requestId, siteId, stepCounter++, "task_complete", "complete", `Task ${task.id}: ${task.description}`, undefined, sessionId);

                // Generate reflection for this task
                const reflection = await generateReflection(
                  task.id, task.description, true, execOutput,
                );
                reflections.push(reflection);

                // Compact memory after each task
                conversationMemory = compactToolResults(conversationMemory, `Task ${task.id} completed: ${task.description}`);
              } catch (taskError: any) {
                if (taskError.message === "EXECUTION_CANCELLED") throw taskError;

                taskResults.push({ taskId: task.id, success: false, error: taskError.message });
                await emitStep(requestId, siteId, stepCounter++, "task_failed", "error", `Task ${task.id} failed: ${taskError.message}`, undefined, sessionId);

                // Reflect on failure too
                const reflection = await generateReflection(
                  task.id, task.description, false, "", [taskError.message],
                );
                reflections.push(reflection);
              }
            });

            // Wait for all tasks in this level to complete
            await Promise.all(levelPromises);

            // Incremental verification after each level (except the last — we do full verify then)
            if (level !== taskLevels[taskLevels.length - 1] && !await isCancelled()) {
              const levelTaskIds = level.map(t => t.id);
              const anyFailed = taskResults.some(r => levelTaskIds.includes(r.taskId) && !r.success);

              if (anyFailed) {
                await emitStep(requestId, siteId, stepCounter++, "incremental_verify", "error",
                  `Level failed — attempting quick fix before continuing`, undefined, sessionId);

                // Quick re-plan for failed tasks only
                const failedTaskDescriptions = taskResults
                  .filter(r => !r.success && levelTaskIds.includes(r.taskId))
                  .map(r => `Task ${r.taskId} failed: ${r.error}`);

                const quickFixPlan = await runReplanAgent(
                  plan, failedTaskDescriptions, virtualFS,
                  async (toolName, status, msg) => {
                    await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, undefined, sessionId);
                  },
                  dbContext,
                );

                // Execute quick fixes
                for (const fixTask of quickFixPlan.tasks.slice(0, 3)) {
                  const fixChain = selectModelWithFallback("fix", "moderate");
                  const fixTools = createEnhancedTools(virtualFS, dbContext);

                  try {
                    await generateTextWithFallback({
                      model: fixChain.primary.model,
                      system: systemPrompt,
                      prompt: `## Quick Fix: ${fixTask.description}\nFiles: ${fixTask.files.join(", ")}\nAvailable: ${Array.from(virtualFS.keys()).sort().join("\n")}`,
                      stopWhen: stepCountIs(6),
                      tools: fixTools,
                      onStepFinish: async (step) => {
                        if (await isCancelled()) throw new Error("EXECUTION_CANCELLED");
                        await handleToolCalls(step, virtualFS, fileOperations, sendFileOp, emitStep, requestId, siteId, stepCounter++, sessionId, basename);
                      },
                    }, fixChain);
                  } catch { /* continue */ }
                }
              }
            }
          }

          if (await isCancelled()) {
            writeTextToStream(writer, "Cancelled.", msgId);
            writeDoneMarker(writer, fileOperations.length);
            writer.write({ type: "finish", finishReason: "stop" });
            return;
          }

          // --- Phase 4: Quality Scoring ---
          const qualityResult = scoreTaskOutput(
            fileOperations.filter(op => op.content).map(op => ({ path: op.path, content: op.content })),
            virtualFS,
            repoMap,
          );

          // Emit quality artifact
          emitQualityArtifact(writer,
            qualityResult.averageScore,
            Array.from(qualityResult.fileScores.entries()).map(([path, score]) => ({
              path,
              score: score.overall,
              issues: score.issues,
              suggestions: score.suggestions,
            })),
            qualityResult.criticalIssues,
          );

          if (qualityResult.criticalIssues.length > 0) {
            await emitStep(requestId, siteId, stepCounter++, "quality_check", "error",
              `Quality issues: ${qualityResult.criticalIssues.length} critical`,
              { content: qualityResult.criticalIssues.slice(0, 5).join("\n") },
              sessionId);
          } else {
            await emitStep(requestId, siteId, stepCounter++, "quality_check", "complete",
              `Quality score: ${qualityResult.averageScore}/10`,
              undefined, sessionId);
          }

          // --- Phase 4.5: Auto Test Generation ---
          if (fileOperations.length > 0) {
            try {
              await emitStep(requestId, siteId, stepCounter++, "test_gen", "running", "Generating tests...", undefined, sessionId);

              const testResult = await generateTests(
                fileOperations.filter(op => op.content).map(op => ({ type: op.type as any, path: op.path, content: op.content })),
                virtualFS,
                repoMap,
              );

              if (testResult.testFiles.length > 0) {
                // Add test file operations to the stream
                for (const testFile of testResult.testFiles) {
                  const testOp: FileOperation = { type: "write", path: testFile.path, content: testFile.content };
                  fileOperations.push(testOp);
                  sendFileOp(testOp);
                }

                // Emit test result artifact
                emitTestResultArtifact(writer, testResult.testFiles.map(f => ({
                  path: f.path,
                  testCount: f.testCount,
                  coverageEstimate: f.coverageEstimate,
                })));

                await emitStep(requestId, siteId, stepCounter++, "test_gen", "complete",
                  `Generated ${testResult.totalTests} tests in ${testResult.testFiles.length} files`,
                  undefined, sessionId);
              } else {
                await emitStep(requestId, siteId, stepCounter++, "test_gen", "complete", "No testable files found", undefined, sessionId);
              }
            } catch {
              // Test generation is non-critical — continue
              await emitStep(requestId, siteId, stepCounter++, "test_gen", "complete", "Test generation skipped", undefined, sessionId);
            }
          }

          // --- Phase 5: Self-Healing Build Validation ---
          await emitStep(requestId, siteId, stepCounter++, "build_validation", "running", "Running build validation...", undefined, sessionId);

          const buildResult = await runBuildValidationLoop(
            virtualFS, fileOperations,
            async (stepNum, toolName, status, msg, details) => {
              await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, details, sessionId);
            },
            stepCounter,
            3, // max 3 iterations
          );
          stepCounter += buildResult.iterations * 3;

          // Send any fix file ops to the stream
          for (const op of buildResult.fileOperations) {
            sendFileOp(op);
            fileOperations.push(op);
          }

          await emitStep(requestId, siteId, stepCounter++, "build_validation",
            buildResult.passed ? "complete" : "error",
            buildResult.passed
              ? `Build validation passed (${buildResult.fixesApplied} auto-fixes applied)`
              : `Build validation: ${buildResult.errors.length} remaining issues`,
            undefined, sessionId);

          // --- Phase 6: Final Verification ---
          await emitStep(requestId, siteId, stepCounter++, "verifying", "running", "Final verification...", undefined, sessionId);

          const execResult = {
            taskResults: plan.tasks.map((t) => {
              const result = taskResults.find(r => r.taskId === t.id);
              return {
                taskId: t.id,
                status: (result?.success ? "completed" : "failed") as "completed" | "failed",
                filesWritten: [] as string[],
                filesModified: [] as string[],
              };
            }),
            fileOperations,
            totalSteps: stepCounter,
            output: execOutput,
          };

          const verification = await runVerifyAgent(
            plan, execResult, virtualFS,
            async (toolName, status, msg) => {
              await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, undefined, sessionId);
            },
            dbContext,
          );

          await emitStep(
            requestId, siteId, stepCounter++, "verifying",
            verification.passed ? "complete" : "error",
            verification.passed ? "All checks passed" : `${verification.issues.length} issues found`,
            { content: verification.summary },
            sessionId,
          );

          // --- Phase 7: Error-Aware Re-plan if needed (max 1 cycle) ---
          if (!verification.passed && !await isCancelled()) {
            await emitStep(requestId, siteId, stepCounter++, "replanning", "running", "Re-planning to fix issues...", { content: verification.issues.join("\n") }, sessionId);

            const fixPlan = await runReplanAgent(
              plan, verification.issues, virtualFS,
              async (toolName, status, msg) => {
                await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, undefined, sessionId);
              },
              dbContext,
            );

            // Execute fix tasks with reflections
            const fixReflectionContext = formatReflectionsForPrompt(reflections);

            for (const task of fixPlan.tasks) {
              if (await isCancelled()) break;

              const fixChain = selectModelWithFallback("execute", "moderate");
              const tools = createEnhancedTools(virtualFS, dbContext);

              const fixPrompt = `## Fix Task: ${task.description}
Files: ${task.files.join(", ")}
Verification: ${task.verification}
Available Files: ${Array.from(virtualFS.keys()).sort().join("\n")}
${fixReflectionContext}`;

              try {
                const fixResult = await generateTextWithFallback({
                  model: fixChain.primary.model,
                  system: systemPrompt,
                  prompt: fixPrompt,
                  stopWhen: stepCountIs(6),
                  tools,
                  onStepFinish: async (step) => {
                    if (await isCancelled()) throw new Error("EXECUTION_CANCELLED");
                    await handleToolCalls(step, virtualFS, fileOperations, sendFileOp, emitStep, requestId, siteId, stepCounter++, sessionId, basename);
                  },
                }, fixChain);
                execOutput = fixResult.text || execOutput;
              } catch { /* continue with remaining tasks */ }
            }

            await emitStep(requestId, siteId, stepCounter++, "replanning", "complete", "Fix applied", undefined, sessionId);
          }

          // --- Phase 8: Save Learnings to Persistent Brain ---
          if (siteId && siteId !== "unknown" && reflections.length > 0) {
            try {
              const savedLearnings = await extractAndSaveLearnings(siteId, reflections, brainEntries);
              if (savedLearnings.length > 0) {
                emitBrainUpdateArtifact(writer, savedLearnings);
                await emitStep(requestId, siteId, stepCounter++, "brain_save", "complete",
                  `Saved ${savedLearnings.length} new patterns to knowledge base`,
                  undefined, sessionId);
              }
            } catch {
              // Brain saving is non-critical
            }
          }

          // --- Phase 9: Visual Verification Request ---
          // Emit a request for the frontend to capture a screenshot and send to /api/ai/visual-verify
          if (fileOperations.some(op => op.path.endsWith(".tsx") || op.path.endsWith(".jsx") || op.path.endsWith(".css"))) {
            emitScreenshotArtifact(writer, true, [], [
              "Frontend should capture a screenshot and POST to /api/ai/visual-verify for visual QA",
            ]);

            // Emit a marker that the frontend can parse to trigger screenshot capture
            const screenshotRequestId = `screenshot_req_${Date.now()}`;
            writer.write({ type: "text-start", id: screenshotRequestId });
            writer.write({
              type: "text-delta",
              id: screenshotRequestId,
              delta: `\n<!--REQUEST_SCREENSHOT:${JSON.stringify({
                taskDescription: message,
                planSummary: plan.summary,
                componentsCreated: fileOperations.filter(op => op.path.endsWith(".tsx")).map(op => op.path),
              })}-->\n`,
            });
            writer.write({ type: "text-end", id: screenshotRequestId });
          }

          // --- Done ---
          const successCount = taskResults.filter(r => r.success).length;
          const summaryText = `Completed ${successCount}/${plan.tasks.length} tasks with ${fileOperations.length} file operations.${verification.passed ? " All checks passed." : ""}${buildResult.fixesApplied > 0 ? ` ${buildResult.fixesApplied} auto-fixes applied.` : ""} Quality: ${qualityResult.averageScore}/10.`;
          await emitStep(requestId, siteId, 999, "complete", "complete", summaryText, undefined, sessionId);

          writeTextToStream(writer, execOutput || summaryText, msgId);
          writeDoneMarker(writer, fileOperations.length);
          writer.write({ type: "finish", finishReason: "stop" });
        } catch (error: any) {
          if (error.message === "EXECUTION_CANCELLED") {
            const textId = `cancelled_${Date.now()}`;
            writer.write({ type: "text-start", id: textId });
            writer.write({ type: "text-delta", id: textId, delta: "Execution stopped by user." });
            writer.write({ type: "text-end", id: textId });
          } else {
            console.error("[AI Chat Error]", error);
            const isProviderError = error?.message?.includes("Invalid JSON response")
              || error?.message?.includes("Internal Server Error")
              || error?.statusCode === 500;
            const userMessage = isProviderError
              ? "The AI provider returned an error. Please try again."
              : (error.message || "Internal server error");
            writer.write({ type: "error", errorText: userMessage });
          }
          writer.write({ type: "finish", finishReason: "error" });
        }
      },
    }),
  });
}

// --- Parallel Execution: Group tasks by dependency level ---

function groupTasksByDependencyLevel(
  tasks: ExecutionPlan["tasks"],
): ExecutionPlan["tasks"][] {
  const levels: ExecutionPlan["tasks"][] = [];
  const completed = new Set<number>();
  const remaining = [...tasks];

  while (remaining.length > 0) {
    const currentLevel: typeof tasks = [];

    for (let i = remaining.length - 1; i >= 0; i--) {
      const task = remaining[i];
      const deps = task.dependencies || [];
      const allDepsCompleted = deps.every(d => completed.has(d));

      if (allDepsCompleted) {
        currentLevel.push(task);
        remaining.splice(i, 1);
      }
    }

    // Safety: if no tasks can be scheduled (circular deps), push all remaining
    if (currentLevel.length === 0) {
      levels.push(remaining.splice(0));
      break;
    }

    // Sort by task ID for deterministic order within a level
    currentLevel.sort((a, b) => a.id - b.id);
    levels.push(currentLevel);

    for (const task of currentLevel) {
      completed.add(task.id);
    }
  }

  return levels;
}

// --- Tool Call Handler ---

async function handleToolCalls(
  step: any,
  virtualFS: Map<string, string>,
  fileOperations: FileOperation[],
  sendFileOp: (op: FileOperation) => void,
  emitStepFn: typeof emitStep,
  requestId: string,
  siteId: string,
  stepNumber: number,
  sessionId?: string,
  basename?: (p: unknown) => string,
) {
  const bn = basename || ((p: unknown) => typeof p === "string" ? p.split("/").filter(Boolean).pop() || p : "file");
  const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : [];

  for (const tc of toolCalls) {
    const name = tc.toolName;
    const args = (tc as any).args || (tc as any).input || {};

    if (name === "write_file" && typeof args.path === "string") {
      const content = typeof args.content === "string" ? args.content : "";
      const normalizedPath = normalizePath(args.path);
      const op: FileOperation = { type: "write", path: normalizedPath, content };
      fileOperations.push(op);
      sendFileOp(op);
      await emitStepFn(requestId, siteId, 200 + fileOperations.length, "write_file", "complete", `Writing ${bn(args.path)}`, { content: content.slice(0, 500) }, sessionId);
    } else if ((name === "edit_file" || name === "modify_file") && typeof args.path === "string") {
      const normalizedPath = normalizePath(args.path);
      const fullContent = virtualFS.get(normalizedPath) || "";
      const op: FileOperation = { type: "write", path: normalizedPath, content: fullContent };
      fileOperations.push(op);
      sendFileOp(op);
      await emitStepFn(requestId, siteId, 200 + fileOperations.length, name, "complete", `Editing ${bn(args.path)}`, { content: (args.newText || "").slice(0, 500) }, sessionId);
    } else if (name === "delete_file" && typeof args.path === "string") {
      const normalizedPath = normalizePath(args.path);
      const op: FileOperation = { type: "delete", path: normalizedPath };
      fileOperations.push(op);
      sendFileOp(op);
      await emitStepFn(requestId, siteId, 200 + fileOperations.length, "delete_file", "complete", `Deleting ${bn(args.path)}`, undefined, sessionId);
    } else if (name === "read_file") {
      await emitStepFn(requestId, siteId, stepNumber, "read_file", "complete", `Reading ${bn(args.path || "")}`, undefined, sessionId);
    } else if (name === "grep_files") {
      await emitStepFn(requestId, siteId, stepNumber, "grep_files", "complete", `Searching: "${(args.pattern || "").slice(0, 50)}"`, undefined, sessionId);
    } else if (name === "glob_files") {
      await emitStepFn(requestId, siteId, stepNumber, "glob_files", "complete", `Finding files: ${(args.pattern || "").slice(0, 50)}`, undefined, sessionId);
    } else if (name === "web_search") {
      await emitStepFn(requestId, siteId, stepNumber, "web_search", "complete", `Searching: "${(args.query || "").slice(0, 50)}"`, undefined, sessionId);
    } else if (name === "web_scrape") {
      await emitStepFn(requestId, siteId, stepNumber, "web_scrape", "complete", `Reading ${(args.url || "").slice(0, 60)}`, undefined, sessionId);
    } else if (name === "list_files" || name === "search_files") {
      await emitStepFn(requestId, siteId, stepNumber, name, "complete", "Listing project files", undefined, sessionId);
    } else if (name === "execute_sql") {
      const sqlPreview = (args.sql || "").slice(0, 60);
      await emitStepFn(requestId, siteId, stepNumber, "execute_sql", "complete", `SQL: ${sqlPreview}`, undefined, sessionId);
    } else if (name === "read_database_schema") {
      await emitStepFn(requestId, siteId, stepNumber, "read_database_schema", "complete", "Reading database schema", undefined, sessionId);
    } else if (name === "list_database_tables") {
      await emitStepFn(requestId, siteId, stepNumber, "list_database_tables", "complete", "Listing database tables", undefined, sessionId);
    }
  }
}

// --- Stream Helpers ---

function writeTextToStream(writer: any, text: string, msgId: string) {
  const textId = `text_${Date.now()}`;
  writer.write({ type: "text-start", id: textId });
  writer.write({ type: "text-delta", id: textId, delta: text });
  writer.write({ type: "text-end", id: textId });
}

function writeDoneMarker(writer: any, totalOps: number) {
  writer.write({ type: "text-start", id: "done_marker" });
  writer.write({
    type: "text-delta",
    id: "done_marker",
    delta: `\n<!--DONE:${JSON.stringify({ totalOps })}-->\n`,
  });
  writer.write({ type: "text-end", id: "done_marker" });
}

// --- UI Task Handler ---

async function handleUITask({
  message, files, requestId, siteId, sessionId,
}: { message: string; files: Record<string, string>; requestId: string; siteId: string; sessionId?: string }) {
  let stepCounter = 1;
  await emitStep(requestId, siteId, stepCounter++, "routing", "complete", "Routing to UI Agent", undefined, sessionId);

  const msgId = `ui_msg_${Date.now()}`;

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          writer.write({ type: "start", messageId: msgId });

          const uiResult = await executeVercelUIAgent({
            message,
            fileContents: files || {},
            requestId,
            siteId,
            sessionId,
            onStep: async (toolName, status, msg, details, stepIndex) => {
              const n = stepIndex !== undefined ? stepIndex : stepCounter++;
              await emitStep(requestId, siteId, n, toolName, status, msg, details, sessionId);
            },
          });

          await emitStep(requestId, siteId, 999, "complete", "complete", `Task completed with ${uiResult.fileOperations.length} file operations.`, undefined, sessionId);

          const ops = uiResult.fileOperations.map((op) => ({
            type: op.type === "read" ? "write" : op.type,
            path: op.path,
            content: op.content,
            oldText: op.oldText,
            newText: op.newText,
          }));

          for (let i = 0; i < ops.length; i++) {
            const opId = `ui_file_op_${i}`;
            writer.write({ type: "text-start", id: opId });
            writer.write({
              type: "text-delta",
              id: opId,
              delta: `\n<!--FILE_OP:${JSON.stringify(ops[i])}-->\n`,
            });
            writer.write({ type: "text-end", id: opId });
          }

          const textId = `ui_text_${Date.now()}`;
          writer.write({ type: "text-start", id: textId });
          writer.write({ type: "text-delta", id: textId, delta: uiResult.output });
          writer.write({ type: "text-end", id: textId });

          writer.write({ type: "text-start", id: "done_marker" });
          writer.write({
            type: "text-delta",
            id: "done_marker",
            delta: `\n<!--DONE:${JSON.stringify({ totalOps: ops.length })}-->\n`,
          });
          writer.write({ type: "text-end", id: "done_marker" });

          writer.write({ type: "finish", finishReason: "stop" });
        } catch (uiError: any) {
          console.error("[AI Chat] UI Agent failed:", uiError.message);
          await emitStep(requestId, siteId, 999, "error", "error", `UI Agent error: ${uiError.message}`, undefined, sessionId);
          writer.write({ type: "error", errorText: uiError.message });
          writer.write({ type: "finish", finishReason: "error" });
        }
      },
    }),
  });
}

// --- Question Handler ---

async function handleQuestion({
  message, files, conversationHistory, requestId, siteId, sessionId,
}: {
  message: string;
  files: Record<string, string>;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  requestId: string;
  siteId: string;
  sessionId?: string;
}) {
  const msgId = `q_msg_${Date.now()}`;

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          writer.write({ type: "start", messageId: msgId });

          const fileList = Object.keys(files).sort().join(", ");
          const historyContext = conversationHistory
            .slice(-4)
            .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
            .join("\n");

          const prompt = `${historyContext ? `Previous conversation:\n${historyContext}\n\n` : ""}Project files: ${fileList || "none"}\n\nUser question: ${message}`;

          const result = await generateTextBase({
            model: getFlashModel(),
            system: "You are a helpful web development assistant. Answer questions concisely based on the project context provided.",
            prompt,
          });

          await emitStep(requestId, siteId, 999, "complete", "complete", "Question answered", undefined, sessionId);

          const textId = `q_text_${Date.now()}`;
          writer.write({ type: "text-start", id: textId });
          writer.write({ type: "text-delta", id: textId, delta: result.text || "I'm not sure how to answer that." });
          writer.write({ type: "text-end", id: textId });
          writer.write({ type: "finish", finishReason: "stop" });
        } catch (error: any) {
          writer.write({ type: "error", errorText: error.message });
          writer.write({ type: "finish", finishReason: "error" });
        }
      },
    }),
  });
}
