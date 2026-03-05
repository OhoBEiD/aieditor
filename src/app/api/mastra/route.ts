// Orchestrator - Multi-agent AI workflow
// Routes requests through: Classify → Explore → Plan → Execute → Verify → Re-plan
// Uses Gemini 3.1 Pro for complex reasoning, Flash for fast execution

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { emitStep, getSupabaseClient } from "@/lib/ai/AIService";
import { classifyIntent, type ClassificationResult } from "@/lib/ai/agents/IntentClassifier";
import { executeVercelUIAgent } from "@/lib/ai/agents/VercelUIAgent";
import { runExploreAgent } from "@/lib/ai/agents/ExploreAgent";
import { runPlanAgent, runReplanAgent, type ExecutionPlan } from "@/lib/ai/agents/PlanAgent";
import { executePlan, executeFastPath, type ExecutionResult } from "@/lib/ai/agents/ExecutorAgent";
import { runVerifyAgent, type VerificationResult } from "@/lib/ai/agents/VerifyAgent";
import { webSearch, webScrape } from "@/lib/ai/tools/web";

export const maxDuration = 300; // 5 minutes timeout

// --- Types ---

interface SupabaseContext {
  projectUrl: string;
  schema: {
    tables: Array<{
      name: string;
      columns: Array<{ name: string; type: string; is_nullable: boolean }>;
    }>;
  } | null;
  hasServiceRoleKey: boolean;
}

interface RequestBody {
  message: string;
  files?: Record<string, string>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  mode?: "thinking" | "fast" | "mastra";
  maxSteps?: number;
  requestId?: string;
  siteId?: string;
  conversationId?: string;
  supabaseContext?: SupabaseContext;
}

// --- Helpers ---

function normalizePath(p: string): string {
  return (p || "").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

function buildSupabasePrompt(ctx: SupabaseContext): string {
  let prompt = `\n\n## SUPABASE INTEGRATION (Connected)
The user has connected their Supabase project at: ${ctx.projectUrl}

### How to use Supabase in generated code:
- Import the client: \`import { supabase } from '@/lib/supabase'\`
- The client is already configured with the user's project URL and anon key.
- Use \`supabase.from('table_name').select('*')\` for queries.
- Use \`supabase.auth\` for authentication operations.
- Always handle errors: \`const { data, error } = await supabase.from(...)\`
`;

  if (ctx.schema && ctx.schema.tables && ctx.schema.tables.length > 0) {
    prompt += `\n### Available Database Tables:\n`;
    for (const table of ctx.schema.tables) {
      const cols =
        table.columns
          ?.map(
            (c) =>
              `${c.name} (${c.type}${c.is_nullable ? ", nullable" : ""})`,
          )
          .join(", ") || "unknown columns";
      prompt += `- **${table.name}**: ${cols}\n`;
    }
  }

  if (ctx.hasServiceRoleKey) {
    prompt += `\n### SQL Execution
You have a \`run_sql\` tool available. Use it to:
- Create tables: \`CREATE TABLE ...\`
- Alter tables: \`ALTER TABLE ...\`
- Insert seed data: \`INSERT INTO ...\`
- Enable RLS: \`ALTER TABLE ... ENABLE ROW LEVEL SECURITY\`
- Create policies: \`CREATE POLICY ...\`
After creating/altering tables, also generate the React code that queries them.
`;
  }

  return prompt;
}

// --- Main Route Handler ---

export async function POST(req: NextRequest) {
  const body: RequestBody = await req.json();
  const {
    message,
    files = {},
    conversationHistory = [],
    mode = "thinking",
    requestId = `mastra_${Date.now()}`,
    siteId = "unknown",
    conversationId,
    supabaseContext,
  } = body;

  const sessionId = conversationId;
  const supabase = getSupabaseClient();

  // --- Build virtual filesystem ---
  const virtualFS = new Map<string, string>();
  for (const [filePath, content] of Object.entries(files)) {
    const normalized = normalizePath(filePath);
    if (normalized) virtualFS.set(normalized, content);
  }
  console.log(`[Orchestrator] Virtual FS: ${virtualFS.size} files, mode: ${mode}`);

  // --- Step 1: Classify Intent ---
  const classification = await classifyIntent(message);
  console.log(`[Orchestrator] Intent: ${classification.type}, complexity: ${classification.complexity}, route: ${classification.route}`);

  // --- Handle UI tasks with non-streaming JSON (Vercel UI Agent) ---
  if (classification.type === "ui_task") {
    return handleUITask(message, files, requestId, siteId, sessionId);
  }

  // --- Handle questions directly ---
  if (classification.type === "question") {
    return handleQuestion(message, files, conversationHistory, requestId, siteId, sessionId);
  }

  // --- For all other tasks: NDJSON streaming orchestrator ---
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // Stream may be closed
        }
      };

      let stepCounter = 1;

      // Cancellation checker
      const isCancelled = async () => {
        if (!supabase || !sessionId) return false;
        const { data } = await supabase
          .from("chat_sessions")
          .select("is_cancelled")
          .eq("id", sessionId)
          .maybeSingle();
        return data?.is_cancelled === true;
      };

      // Step emission helper
      const emitStepFn = async (
        rid: string, sid: string, stepNum: number,
        toolName: string, status: string, msg: string,
        details?: any, sessId?: string,
      ) => {
        await emitStep(rid, sid, stepNum, toolName, status, msg, details, sessId);
      };

      try {
        // ============================================
        // FAST PATH - Simple edits (no plan, no explore)
        // ============================================
        if (classification.route === "fast_path") {
          send({ type: "status", message: "Executing..." });
          await emitStepFn(requestId, siteId, stepCounter++, "routing", "complete", `Fast path: ${classification.type}`, undefined, sessionId);

          const result = await executeFastPath(
            message, virtualFS, conversationHistory,
            send, emitStepFn, requestId, siteId, sessionId,
          );

          await emitStepFn(requestId, siteId, 999, "complete", "complete", `Done: ${result.fileOperations.length} file operations`, undefined, sessionId);
          send({
            type: "done",
            text: result.output,
            fileOperations: result.fileOperations,
            totalOps: result.fileOperations.length,
          });
          return;
        }

        // ============================================
        // FULL PIPELINE - Complex tasks
        // ============================================

        // --- Phase 1: Explore (complex tasks only) ---
        let exploration = null;
        if (classification.complexity === "complex" && virtualFS.size > 0) {
          send({ type: "status", message: "Exploring codebase..." });
          send({ type: "explore_start" });
          await emitStepFn(requestId, siteId, stepCounter++, "exploring", "running", "Exploring codebase...", undefined, sessionId);

          exploration = await runExploreAgent(
            message, virtualFS,
            async (toolName, status, msg) => {
              send({ type: "explore_step", tool: toolName, message: msg });
              await emitStepFn(requestId, siteId, stepCounter++, toolName, status, msg, undefined, sessionId);
            },
          );

          send({ type: "explore_complete", summary: exploration.summary.slice(0, 300) });
          await emitStepFn(requestId, siteId, stepCounter++, "exploring", "complete", "Codebase exploration complete", { content: exploration.summary.slice(0, 500) }, sessionId);
        }

        if (await isCancelled()) {
          send({ type: "done", text: "Cancelled.", fileOperations: [], cancelled: true });
          return;
        }

        // --- Phase 2: Plan ---
        send({ type: "status", message: "Creating implementation plan..." });
        const planStepNum = stepCounter++;
        await emitStepFn(requestId, siteId, planStepNum, "planning", "running", "Creating implementation plan...", undefined, sessionId);

        const plan = await runPlanAgent(
          message, exploration, virtualFS,
          classification.complexity,
          conversationHistory,
          async (toolName, status, msg, details) => {
            if (toolName === "planning") {
              // Stream plan content to frontend
              await emitStepFn(requestId, siteId, planStepNum, "planning", status, msg, details, sessionId);
              if (details?.content) {
                send({ type: "plan", content: details.content });
              }
            } else {
              await emitStepFn(requestId, siteId, stepCounter++, toolName, status, msg, details, sessionId);
            }
          },
        );

        await emitStepFn(requestId, siteId, planStepNum, "planning", "complete", "Plan created", { content: plan.summary }, sessionId);
        send({ type: "plan", content: JSON.stringify(plan, null, 2) });

        console.log(`[Orchestrator] Plan: ${plan.tasks.length} tasks, complexity: ${plan.complexity}`);

        if (await isCancelled()) {
          send({ type: "done", text: "Cancelled.", fileOperations: [], cancelled: true });
          return;
        }

        // --- Phase 3: Execute + Verify Loop (max 2 re-plan cycles) ---
        let currentPlan = plan;
        let execResult: ExecutionResult | null = null;
        let verification: VerificationResult | null = null;
        let attempts = 0;
        const MAX_REPLAN_CYCLES = 2;

        while (attempts <= MAX_REPLAN_CYCLES) {
          // Execute
          send({ type: "status", message: attempts > 0 ? `Re-executing (attempt ${attempts + 1})...` : "Executing implementation..." });
          await emitStepFn(requestId, siteId, stepCounter++, "executing", "running", attempts > 0 ? `Re-executing (attempt ${attempts + 1})` : "Executing implementation...", undefined, sessionId);

          execResult = await executePlan(
            currentPlan, virtualFS, send, emitStepFn,
            requestId, siteId, sessionId, isCancelled,
          );

          if (await isCancelled()) {
            send({ type: "done", text: "Cancelled.", fileOperations: execResult.fileOperations, cancelled: true });
            return;
          }

          // Verify
          send({ type: "status", message: "Verifying changes..." });
          send({ type: "verify_start" });
          await emitStepFn(requestId, siteId, stepCounter++, "verifying", "running", "Verifying changes...", undefined, sessionId);

          verification = await runVerifyAgent(
            currentPlan, execResult, virtualFS,
            async (toolName, status, msg) => {
              await emitStepFn(requestId, siteId, stepCounter++, toolName, status, msg, undefined, sessionId);
            },
          );

          send({
            type: "verify_result",
            passed: verification.passed,
            issues: verification.issues,
            summary: verification.summary,
          });
          await emitStepFn(
            requestId, siteId, stepCounter++, "verifying",
            verification.passed ? "complete" : "error",
            verification.passed ? "All checks passed" : `${verification.issues.length} issues found`,
            { content: verification.summary },
            sessionId,
          );

          if (verification.passed) {
            console.log(`[Orchestrator] Verification passed on attempt ${attempts + 1}`);
            break;
          }

          // Re-plan if verification failed and we have attempts left
          attempts++;
          if (attempts <= MAX_REPLAN_CYCLES) {
            console.log(`[Orchestrator] Re-planning (attempt ${attempts})...`);
            send({ type: "status", message: `Re-planning to fix ${verification.issues.length} issues...` });
            send({ type: "replan", reason: verification.issues.join("; "), attempt: attempts });
            await emitStepFn(requestId, siteId, stepCounter++, "replanning", "running", `Re-planning (attempt ${attempts})`, { content: verification.issues.join("\n") }, sessionId);

            currentPlan = await runReplanAgent(
              currentPlan, verification.issues, virtualFS,
              async (toolName, status, msg) => {
                await emitStepFn(requestId, siteId, stepCounter++, toolName, status, msg, undefined, sessionId);
              },
            );

            await emitStepFn(requestId, siteId, stepCounter++, "replanning", "complete", "Re-plan complete", undefined, sessionId);
          }
        }

        // --- Final Result ---
        const allFileOps = execResult?.fileOperations || [];
        const successCount = execResult?.taskResults.filter((t) => t.status === "completed").length || 0;
        const totalTasks = currentPlan.tasks.length;
        const passed = verification?.passed ?? false;

        const summaryText = passed
          ? `Completed ${successCount}/${totalTasks} tasks with ${allFileOps.length} file operations. All checks passed.`
          : `Completed ${successCount}/${totalTasks} tasks with ${allFileOps.length} file operations. ${verification?.issues.length || 0} issues remain.`;

        await emitStepFn(requestId, siteId, 999, "complete", "complete", summaryText, undefined, sessionId);

        send({
          type: "done",
          text: execResult?.output || summaryText,
          fileOperations: allFileOps,
          totalOps: allFileOps.length,
          verification: {
            passed,
            issues: verification?.issues || [],
          },
        });
      } catch (error: any) {
        if (error.message === "EXECUTION_CANCELLED") {
          send({ type: "done", text: "Execution stopped by user.", fileOperations: [], cancelled: true });
        } else {
          console.error("[Orchestrator Error]", error);
          const isProviderError =
            error?.message?.includes("Invalid JSON response") ||
            error?.message?.includes("Internal Server Error") ||
            error?.statusCode === 500;
          const userMessage = isProviderError
            ? "The AI provider returned an error. Please try again."
            : error.message || "Internal server error";
          send({ type: "error", message: userMessage });
          await emitStep(requestId, siteId, 999, "error", "error", userMessage, undefined, sessionId);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}

// --- UI Task Handler (non-streaming, uses VercelUIAgent) ---

async function handleUITask(
  message: string,
  files: Record<string, string>,
  requestId: string,
  siteId: string,
  sessionId?: string,
) {
  let stepCounter = 1;
  await emitStep(requestId, siteId, stepCounter++, "routing", "complete", "Routing to UI Agent", undefined, sessionId);

  try {
    const uiResult = await executeVercelUIAgent({
      message,
      fileContents: files,
      requestId,
      siteId,
      sessionId,
      onStep: async (toolName, status, msg, details, stepIndex) => {
        const finalStepNumber = stepIndex !== undefined ? stepIndex : stepCounter++;
        await emitStep(requestId, siteId, finalStepNumber, toolName, status, msg, details, sessionId);
      },
    });

    await emitStep(requestId, siteId, 999, "complete", "complete", `UI task completed: ${uiResult.fileOperations.length} file operations`, undefined, sessionId);

    return NextResponse.json({
      success: true,
      text: uiResult.output,
      summary: uiResult.output,
      fileOperations: uiResult.fileOperations.map((op) => ({
        type: op.type === "read" ? "write" : op.type,
        path: op.path,
        content: op.content,
        oldText: op.oldText,
        newText: op.newText,
      })),
      steps: [],
      usage: { totalTokens: 0 },
    });
  } catch (uiError: any) {
    console.error("[Orchestrator] UI Agent failed:", uiError.message);
    await emitStep(requestId, siteId, 999, "error", "error", `UI Agent error: ${uiError.message}`, undefined, sessionId);
    return NextResponse.json(
      {
        success: false,
        error: uiError.message,
        summary: `Error: ${uiError.message}`,
        text: `Error: ${uiError.message}`,
        fileOperations: [],
      },
      { status: 500 },
    );
  }
}

// --- Question Handler (direct LLM response, no tools) ---

async function handleQuestion(
  message: string,
  files: Record<string, string>,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  requestId: string,
  siteId: string,
  sessionId?: string,
) {
  const { getFlashModel } = await import("@/lib/ai/router");

  try {
    const fileList = Object.keys(files).sort().join(", ");
    const historyContext = conversationHistory
      .slice(-4)
      .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
      .join("\n");

    const prompt = `${historyContext ? `Previous conversation:\n${historyContext}\n\n` : ""}Project files: ${fileList || "none"}\n\nUser question: ${message}`;

    const result = await generateText({
      model: getFlashModel(),
      system: "You are a helpful web development assistant. Answer questions concisely based on the project context provided.",
      prompt,
    });

    await emitStep(requestId, siteId, 999, "complete", "complete", "Question answered", undefined, sessionId);

    return NextResponse.json({
      success: true,
      text: result.text || "I'm not sure how to answer that.",
      summary: result.text?.slice(0, 200) || "",
      fileOperations: [],
      steps: [],
      usage: { totalTokens: 0 },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message, text: `Error: ${error.message}`, fileOperations: [] },
      { status: 500 },
    );
  }
}
