// AI Chat Route - Main entry point for the frontend (via Vercel AI SDK useChat)
// Orchestrator: Classify → RepoMap → Brain → Explore → Interactive Proposals → Plan → Execute → Build Validate → Final Verify
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
import { runPlanAgent, type ExecutionPlan } from "@/lib/ai/agents/PlanAgent";
import { runVerifyAgent, type VerificationResult } from "@/lib/ai/agents/VerifyAgent";
import { runBuildValidationLoop } from "@/lib/ai/agents/BuildValidator";
import { getFlashModel, selectModel, selectModelWithFallback, generateTextWithFallback, type Complexity, type UserModel } from "@/lib/ai/router";
import { createEnhancedTools, type FileOperation, type DatabaseContext } from "@/lib/ai/tools/enhanced-tools";
import { compactToolResults } from "@/lib/ai/context/compaction";
import { buildRepoMap, getCompactRepoMap, type RepoMap } from "@/lib/ai/context/repo-map";
import { buildDynamicSystemPrompt, type DynamicPromptContext } from "@/lib/ai/prompts/dynamic-prompt-builder";
import { loadBrain, formatBrainForPrompt, type BrainEntry } from "@/lib/ai/context/brain";
import { saveConversationMemory, loadConversationMemory, formatMemoryForPrompt } from "@/lib/ai/context/agent-memory";
import { resetArtifactCounter, emitPlanArtifact, emitProposalArtifact } from "@/lib/ai/artifacts/emitter";
import { generateProposals, parseOptionSelection, shouldUseInteractiveMode, type ApproachOption } from "@/lib/ai/agents/InteractiveProposer";
import { z } from "zod";
import { generateText as generateTextBase, stepCountIs } from "ai";
import { IMAGE_RULES, IMPORT_REFERENCE } from "@/lib/ai/prompts/skills";

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

// Strip AI markers from message content for clean conversation context
function cleanMessageContent(text: string): string {
  return text
    .replace(/\n?<!--FILE_OP:[\s\S]*?-->\n?/g, "")
    .replace(/\n?<!--DONE:[\s\S]*?-->\n?/g, "")
    .replace(/\n?<!--ARTIFACT:[\s\S]*?-->\n?/g, "")
    .replace(/\n?<!--PROPOSAL_OPTIONS:[\s\S]*?-->\n?/g, "")
    .replace(/\n?<!--REQUEST_SCREENSHOT:[\s\S]*?-->\n?/g, "")
    .trim();
}

// Load conversation history from Supabase (server-side, authoritative)
async function loadServerConversationHistory(
  supabaseDb: ReturnType<typeof getSupabaseClient>,
  sessionId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!supabaseDb) return [];
  try {
    const { data, error } = await supabaseDb
      .from("messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error || !data) return [];

    return data
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: cleanMessageContent(m.content || ""),
      }))
      .filter((m: { content: string }) => m.content.length > 0);
  } catch {
    return [];
  }
}

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
  image?: string;                             // Base64 data URL from user screenshot/image
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
  selectedModel?: UserModel;                  // User's model choice (flash/pro/sonnet/opus) — applies to plan + execute
  uploadedFiles?: Array<{ path: string }>;    // Files written to WebContainer public/ for AI to reference in code
}

// --- Base System Prompt ---

const BASE_EXECUTOR_PROMPT = `You are a world-class frontend engineer executing code changes to build stunning web experiences.
Adapt your design style to match the type of website being built.

## WORKFLOW (CRITICAL)
1. SEARCH: Use grep_files to find relevant code before reading files
2. READ: Use read_file with line ranges to see current content before editing
3. WRITE: Use write_file (new files) or edit_file (surgical edits)
4. VERIFY: Use read_file to confirm your changes applied correctly

## DESIGN RULES
- **Theme**: Match the theme to the site type. Light for ecommerce, business, portfolios, blogs, medical, education. Dark for SaaS, dev tools, gaming. Follow user preference if stated.
- **Headers/Navbars**: SOLID backgrounds by default (bg-white, bg-gray-900, bg-primary). Only use glass/transparency if the user requests it.
- **Typography**: Use next/font/google. Choose fonts that fit the brand — pick from Inter, Space Grotesk, Poppins, DM Sans, Playfair Display, Outfit, Sora, etc. Don't always use the same combination.
- **Images**: Use plain \`<img>\` tags (NOT next/image \`<Image>\`) for all external images. URL: \`https://images.unsplash.com/photo-{ID}?w={width}&h={height}&fit=crop\` — use REAL photo IDs from the IMAGE BANK section below. NEVER invent IDs. NEVER use source.unsplash.com (dead). Avatars: \`https://i.pravatar.cc/150?img={1-70}\`.
- **Icons**: Lucide React for all iconography
- **Layout**: Design UNIQUE layouts for each project. Vary section count (7-12), order, and composition. For landing pages, create at least 7 separate component files. NOT every site needs Pricing, Testimonials, or Stats — choose sections that make sense for the project. Use creative layouts: asymmetric grids, split-screen hero, editorial columns, card-based, magazine-style, full-bleed images.
- **No duplicate sections**: NEVER create two footers, two navbars, two hero sections, or two of any structural section. Each page should have exactly ONE navbar, ONE footer, ONE hero. If you want a pre-footer CTA/newsletter section, it must be a distinct component (e.g., Newsletter, CTA) — NOT a second Footer.
- **Styling variety**: Choose from flat/clean, gradient, bold/colorful, minimalist, editorial, brutalist, or soft/rounded styles based on the brand. Do NOT default to glass morphism on every site.
- **Animations**: GSAP + ScrollTrigger for scroll animations when appropriate. Guard with "use client" + typeof window !== "undefined". Don't over-animate — sometimes subtle is better.

## BRAND RULES (CRITICAL)
- ALWAYS use the brand/store/company name from the user's request. If they say "for Furry", the brand name is "Furry" — use it in navbar logo, hero heading, footer, layout.tsx metadata. NEVER invent a different name.
- ALWAYS use the color theme the user specified. Do not override with defaults.

## CODE RULES
- "content" for write_file must be the COMPLETE file source code
- For edit_file, oldText must be an EXACT unique match. Read the file first.
- When modifying layout.tsx, PRESERVE <html> and <body> tags
- After updating package.json, MUST run npm install
- All files use .tsx extension for React, .ts for non-UI

## MODIFICATION RULES
When modifying existing files (not creating new ones):
- ONLY change what was explicitly requested. "Change colors" means ONLY colors.
- NEVER change brand names, text content, layout structure, or component hierarchy unless asked.
- When the user says "change X to Y", find X in the existing code and replace it with Y. Do NOT rewrite the entire file.
- Use edit_file for surgical changes. Only use write_file if the entire file needs replacing.

## RESPONSE FORMAT
After completing all file operations, respond with a SHORT summary (2-3 sentences max).

` + IMPORT_REFERENCE + "\n\n" + IMAGE_RULES;

// --- Main Route ---

export async function POST(req: NextRequest) {
  const body: RequestBody = await req.json();
  const {
    message,
    image,
    files = {},
    conversationHistory = [],
    mode = "mastra",
    requestId = `req_${Date.now()}`,
    siteId = "unknown",
    conversationId,
    supabaseContext,
    selectedOption,
    pendingProposal,
    selectedModel,
    uploadedFiles,
  } = body;

  // effectiveMessage starts as `message` but gets overridden with the original
  // user request when the current message is just an option selection ("Option 3")
  let effectiveMessage = message;

  const sessionId = conversationId;
  const supabaseDb = getSupabaseClient();

  // Load authoritative conversation history from Supabase (server-side)
  // This is more reliable than the frontend-sent history, which can be empty after page reload
  const serverHistory = sessionId
    ? await loadServerConversationHistory(supabaseDb, sessionId)
    : [];
  const authHistory = serverHistory.length > 0 ? serverHistory : conversationHistory;

  // Build virtual filesystem
  const virtualFS = new Map<string, string>();
  for (const [filePath, content] of Object.entries(files)) {
    const n = normalizePath(filePath);
    if (n) virtualFS.set(n, content);
  }

  // For new projects, replace starter template files with minimal stubs
  // so the AI creates everything from scratch instead of building on the template
  const isNewProject = authHistory.length === 0;
  if (isNewProject) {
    virtualFS.set("src/app/page.tsx",
      `export default function Home() {\n  return <main></main>\n}`
    );
    virtualFS.set("src/app/layout.tsx",
      `import './globals.css'\nimport type { Metadata } from 'next'\n\nexport const metadata: Metadata = { title: 'My App', description: '' }\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  )\n}`
    );
    virtualFS.set("src/app/globals.css",
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
    );
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

  // Classify intent (hint about attached image so classifier routes appropriately)
  const classifyMessage = resolvedOption && pendingProposal
    ? pendingProposal.originalMessage
    : image ? `${message}\n[User attached a screenshot/image for visual reference]` : message;
  const classification = await classifyIntent(classifyMessage);

  // Override: option selection from interactive mode ALWAYS uses full pipeline
  // Interactive proposals are only shown for complex/moderate tasks, so selecting
  // an option should never route to fast path (which would skip planning)
  if (resolvedOption) {
    classification.route = "full_pipeline";
    classification.type = "complex_feature";
    classification.complexity = "complex";
  }

  console.log(`[AI Chat] Intent: ${classification.type}, complexity: ${classification.complexity}, route: ${classification.route}${resolvedOption ? `, selectedOption: ${resolvedOption}` : ""}`);

  // Detect if this is a modification request (change X to Y, update colors, rename, etc.)
  // These need search_and_replace tools from the fast path, not the limited VercelUIAgent
  const isModificationRequest = /\b(change|rename|replace|swap|update|switch)\b.*\b(to|with|into)\b/i.test(message)
    || /\b(change|update|switch)\s+(the\s+)?(color|theme|palette|scheme|brand|name)/i.test(message)
    || /\bmake\s+(it|the|everything|all)\s+(blue|red|green|white|black|dark|light|purple|orange|pink)/i.test(message);

  // UI tasks route to VercelUIAgent — but only for creation tasks, not modifications
  // Modification requests need the full tool suite (grep, search_and_replace) from the fast path
  if (classification.type === "ui_task" && !isModificationRequest) {
    return handleUITask({ message, files, requestId, siteId, sessionId });
  }

  // Modification requests (rename, color changes, etc.) always use fast path
  // They need search_and_replace, not planning + proposals
  if (isModificationRequest) {
    classification.type = "simple_edit";
    classification.route = "fast_path";
  }

  // Questions route to direct LLM response
  if (classification.type === "question") {
    return handleQuestion({ message, image, files, conversationHistory: authHistory, requestId, siteId, sessionId });
  }

  // --- All other tasks: Enhanced Orchestrated Pipeline ---
  const fileOperations: Array<FileOperation> = [];
  let stepCounter = 1;
  const msgId = `msg_${Date.now()}`;

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer: rawWriter }) => {
        // Wrap writer to survive client disconnects (page refresh)
        // If the client closes the connection, writes silently fail
        // but the pipeline continues executing server-side
        let streamBroken = false;
        const writer = {
          write: (data: any) => {
            if (streamBroken) return;
            try {
              rawWriter.write(data);
            } catch {
              streamBroken = true;
            }
          },
        };

        // Server-side message persistence: update the streaming placeholder
        // created by the client. This ensures the message is saved even if
        // the client disconnects (page refresh) before onFinish fires.
        const persistMessageServerSide = async (content: string, status: 'completed' | 'error' = 'completed') => {
          if (!supabaseDb || !sessionId) return;
          try {
            // Find the latest assistant message for this session
            const { data: rows } = await supabaseDb
              .from('messages')
              .select('id')
              .eq('session_id', sessionId)
              .eq('role', 'assistant')
              .order('created_at', { ascending: false })
              .limit(1);

            if (rows && rows.length > 0) {
              await supabaseDb.from('messages').update({
                content,
                metadata: { requestId, status },
              }).eq('id', rows[0].id);
            } else {
              // No placeholder exists — insert directly
              await supabaseDb.from('messages').insert({
                session_id: sessionId,
                role: 'assistant',
                content,
                metadata: { requestId, status },
              });
            }
          } catch (e) {
            console.error('[route] Failed to persist message server-side:', e);
          }
        };

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

          const thinkingStepNum = stepCounter++;
          await emitStep(requestId, siteId, thinkingStepNum, "thinking", "running", "Analyzing request...", undefined, sessionId);

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
          // PHASE 0.5: Load Persistent Brain + Conversation Memory
          // ================================
          let brainEntries: BrainEntry[] = [];
          let conversationMemories: Awaited<ReturnType<typeof loadConversationMemory>> = [];

          if (siteId && siteId !== "unknown") {
            // Load brain and conversation memory in parallel
            const [brain, memories] = await Promise.all([
              loadBrain(siteId),
              loadConversationMemory({ projectId: siteId, sessionId }),
            ]);
            brainEntries = brain;
            conversationMemories = memories;

            if (brainEntries.length > 0) {
              await emitStep(requestId, siteId, stepCounter++, "brain_load", "complete",
                `Loaded ${brainEntries.length} learned patterns from previous sessions`,
                undefined, sessionId);
            }
            if (conversationMemories.length > 0) {
              await emitStep(requestId, siteId, stepCounter++, "memory_load", "complete",
                `Loaded ${conversationMemories.length} conversation memories`,
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

          // Inject brain knowledge — filter aggressively to prevent stale patterns from leaking
          const filteredBrainEntries = brainEntries.filter(e => {
            if (e.category === "mistake" || e.category === "pattern" || e.category === "component") return true;
            // Architecture/preference entries only if high confidence
            if (e.category === "architecture" || e.category === "preference") return e.confidence >= 0.8;
            return true;
          });
          const brainContext = formatBrainForPrompt(filteredBrainEntries);
          if (brainContext) {
            systemPrompt += "\n\n" + brainContext;
          }

          // Inject conversation memory so the AI knows what was previously discussed
          const memoryContext = formatMemoryForPrompt(conversationMemories);
          if (memoryContext) {
            systemPrompt += "\n\n" + memoryContext;
          }

          // Inject connected database context
          if (supabaseContext?.schema?.tables?.length) {
            const tableNames = supabaseContext.schema.tables.map((t: any) => t.name);
            systemPrompt += `\n\n## Connected Database\nThis project has a connected Supabase database with ${tableNames.length} tables: ${tableNames.join(", ")}.\nYou have tools to read the schema (read_database_schema), list tables (list_database_tables), and execute SQL (execute_sql).\n- Use read_database_schema to see column details before writing queries.\n- Prefer SELECT queries when the user asks to "check" or "look at" data.\n- For INSERT/UPDATE/DELETE/DDL, confirm the operation is what the user intended.`;
          }

          // For new projects, instruct the AI to create everything from scratch
          if (isNewProject) {
            systemPrompt += `\n\n## NEW PROJECT — START FROM SCRATCH
This is a brand new project. The user wants a completely fresh website.
- Write page.tsx from scratch with entirely new content, layout, and styling
- Write layout.tsx with appropriate fonts (use next/font/google), metadata, and structure for THIS specific project
- Write globals.css with fresh CSS variables and a color scheme that matches the user's request
- Create all components as new files — do NOT reference or copy from any existing code
- Choose a unique design style (flat, gradient, bold, minimalist, editorial, etc.) that fits the project type`;
          }

          // Inject installed packages context so AI knows what's available
          const pkgJson = virtualFS.get("package.json");
          if (pkgJson) {
            try {
              const pkg = JSON.parse(pkgJson);
              const deps = Object.keys(pkg.dependencies || {});
              const devDeps = Object.keys(pkg.devDependencies || {});
              systemPrompt += `\n\n## INSTALLED PACKAGES (only use these — do NOT import packages not listed here)
Dependencies: ${deps.join(", ")}
DevDependencies: ${devDeps.join(", ")}
If you need a package not listed above, you MUST add it to package.json first using write_file or edit_file BEFORE importing it in any component.`;
            } catch { /* skip if malformed */ }
          }

          // Mark thinking step as complete now that setup is done
          await emitStep(requestId, siteId, thinkingStepNum, "thinking", "complete", "Analyzed request & project context", undefined, sessionId);

          // ==========================
          // FAST PATH (simple edits)
          // ==========================
          if (classification.route === "fast_path") {
            await emitStep(requestId, siteId, stepCounter++, "routing", "complete", `Fast path: ${classification.type}`, undefined, sessionId);

            const chain = selectModelWithFallback("execute", "simple");
            const tools = createEnhancedTools(virtualFS, dbContext);

            // Include repo map summary in fast path
            const repoMapSummary = repoMap ? getCompactRepoMap(repoMap, 800) : "";
            const fileList = Array.from(virtualFS.keys())
              .filter(f => !f.endsWith(".lock") && !f.includes("node_modules/"))
              .sort().join(", ");

            let prompt = `## USER INTENT (CRITICAL — do NOT deviate from this request)\n${message}\n\n## Project Files\n${fileList || "(empty project)"}\n${repoMapSummary ? `\n${repoMapSummary}\n` : ""}`;
            if (uploadedFiles?.length) {
              prompt += `\n\n## UPLOADED FILES\nThe user uploaded file(s) that are now available in the project: ${uploadedFiles.map(f => `/${f.path}`).join(", ")}\nUse them directly in code with src="/${uploadedFiles[0].path}" (they are in the public/ folder, so Next.js serves them as static assets).\nIf the user wants to use an uploaded image as a logo, hero image, etc., reference it with the path above instead of using picsum.photos.\n`;
            }
            if (authHistory.length > 0) {
              // Compressed history: recent messages get more detail, older ones get summaries
              const historyLines: string[] = [];
              const recent = authHistory.slice(-6);
              recent.forEach((m, i) => {
                const fromEnd = recent.length - i;
                const maxLen = fromEnd <= 3 ? 500 : 100; // Last 3: 500 chars, older: 100 chars
                historyLines.push(`${m.role}: ${m.content.slice(0, maxLen)}`);
              });
              prompt = `## Recent Conversation\n` + historyLines.join("\n") + "\n\n" + prompt;
            }

            if (isModificationRequest) {
              prompt += `\n\n## CRITICAL: GLOBAL REPLACEMENT REQUIRED
This is a rename/replacement request. You MUST:
1. First call grep_files to find ALL occurrences of the old text across every file
2. Then call search_and_replace to replace ALL occurrences at once (it handles all files automatically)
3. Do NOT use edit_file for this — use search_and_replace which replaces globally
4. Verify: the old text should appear in ZERO files after replacement`;
            }

            const result = await generateTextWithFallback({
              model: chain.primary.model,
              system: systemPrompt,
              // When user attached an image, use multimodal messages format
              ...(image
                ? { messages: [{ role: "user" as const, content: [
                    { type: "text" as const, text: prompt },
                    { type: "image" as const, image },
                  ]}]}
                : { prompt }),
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
                3, // max 3 iterations for fast path
                selectedModel,
              );
              stepCounter += buildResult.iterations * 3;

              // Send any fix file ops to the stream
              for (const op of buildResult.fileOperations) {
                sendFileOp(op);
                fileOperations.push(op);
              }
            }

            await emitStep(requestId, siteId, 999, "complete", "complete", `Done: ${fileOperations.length} file operations`, undefined, sessionId);

            const fastPathText = result.text || "Changes applied.";
            writeTextToStream(writer, fastPathText, msgId);
            writeDoneMarker(writer, fileOperations.length);
            // Persist server-side in case client disconnected
            await persistMessageServerSide(fastPathText);

            // Save conversation memory for fast path too
            if (siteId && siteId !== "unknown" && sessionId) {
              try {
                await saveConversationMemory({
                  projectId: siteId,
                  sessionId,
                  userMessage: message,
                  classification,
                  selectedApproach: null,
                  planSummary: null,
                  filesChanged: fileOperations.map(op => op.path),
                  sequenceNumber: conversationMemories.length + 1,
                });
              } catch {
                // Non-critical
              }
            }

            writer.write({ type: "finish", finishReason: "stop" });
            return;
          }

          // ==========================
          // FULL PIPELINE (complex tasks)
          // ==========================

          // --- Phase 1.5: Interactive Proposals (for complex/moderate tasks) ---
          // Show proposals BEFORE exploring — proposals are about approach, not existing code.
          // Exploration happens after the user picks an approach (more targeted).
          let selectedApproach: string | null = null;

          if (shouldUseInteractiveMode(classification) && !resolvedOption) {
            const proposingStepNum = stepCounter++;
            await emitStep(requestId, siteId, proposingStepNum, "proposing", "running", "Researching approaches...", undefined, sessionId);

            // Light exploration: just pass file list for context, skip full agent explore
            // Include memory context so proposals reflect what was previously discussed
            const proposalMessage = memoryContext
              ? `${message}\n\n${memoryContext}`
              : message;
            const proposals = await generateProposals(proposalMessage, null, virtualFS, brainEntries);

            // Build proposal options for both stream and persistence
            const proposalOptions = proposals.options.map(opt => ({
              id: opt.id,
              title: opt.title,
              description: opt.description,
              complexity: opt.complexity,
              estimatedFiles: opt.estimatedFiles,
              pros: opt.tradeoffs.pros,
              cons: opt.tradeoffs.cons,
            }));

            // Emit proposal artifact for the frontend (stream)
            emitProposalArtifact(writer,
              proposalOptions,
              proposals.recommendation,
              proposals.recommendationReason,
              proposals.researchSummary,
            );

            // Build the same ARTIFACT content for server-side persistence
            // This ensures proposals survive even if the client disconnected
            const proposalArtifactData = {
              id: `artifact_proposal_server_${Date.now()}`,
              type: 'proposal',
              title: 'Choose your approach',
              data: {
                options: proposalOptions,
                recommendation: proposals.recommendation,
                recommendationReason: proposals.recommendationReason,
                researchSummary: proposals.researchSummary,
              },
              timestamp: Date.now(),
            };
            const proposalContent = `\n<!--ARTIFACT:${JSON.stringify(proposalArtifactData)}-->\n`;
            await persistMessageServerSide(proposalContent);

            await emitStep(requestId, siteId, proposingStepNum, "proposing", "complete",
              `Generated ${proposals.options.length} approaches — waiting for selection`,
              undefined, sessionId);
            writeDoneMarker(writer, 0);
            writer.write({ type: "finish", finishReason: "stop" });
            return; // Stop here — wait for user selection
          }

          // If user selected an option, use that approach for planning
          // Reconstruct pendingProposal from Supabase if frontend didn't send it
          let effectiveProposal = pendingProposal;
          if (resolvedOption && !effectiveProposal && sessionId) {
            try {
              const { data: rawMsgs } = await supabaseDb!
                .from("messages")
                .select("role, content")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: false })
                .limit(10);
              if (rawMsgs) {
                // Find last assistant message with proposal artifact
                for (const msg of rawMsgs) {
                  if (msg.role !== "assistant") continue;
                  const artifactMatch = msg.content?.match(/<!--ARTIFACT:([\s\S]*?)-->/);
                  if (!artifactMatch) continue;
                  try {
                    const artifact = JSON.parse(artifactMatch[1]);
                    if (artifact.type === "proposal" && artifact.data?.options) {
                      // Find the original user message (first user msg before proposals)
                      const originalMsg = rawMsgs.find(m => m.role === "user" && m.content && !/^Option\s+\d$/i.test(m.content.trim()));
                      effectiveProposal = {
                        originalMessage: originalMsg?.content || message,
                        options: artifact.data.options.map((o: any) => ({
                          id: o.id,
                          title: o.title,
                          description: o.description || "",
                          approach: o.approach || o.description || "",
                          complexity: o.complexity || "complex",
                          estimatedFiles: o.estimatedFiles || 15,
                          tradeoffs: { pros: o.pros || [], cons: o.cons || [] },
                        })),
                      };
                      break;
                    }
                  } catch { /* skip malformed artifacts */ }
                }
              }
            } catch (err) {
              console.error("[AI Chat] Failed to reconstruct proposal:", err);
            }
          }

          if (resolvedOption && effectiveProposal) {
            const chosen = effectiveProposal.options.find((o: any) => o.id === resolvedOption);
            if (chosen) {
              selectedApproach = chosen.approach;
              await emitStep(requestId, siteId, stepCounter++, "option_selected", "complete",
                `Selected Option ${chosen.id}: ${chosen.title}`,
                undefined, sessionId);
            }
            // Restore original user request — `message` is "Option 3" but downstream
            // phases need the actual request (company name, services, theme, etc.)
            effectiveMessage = effectiveProposal.originalMessage || message;
          }

          // Fallback: if option was selected but proposal couldn't be reconstructed,
          // recover original request from conversation history
          if (resolvedOption && !effectiveProposal) {
            const originalFromHistory = authHistory.find(
              m => m.role === "user" && m.content && !/^Option\s+\d$/i.test(m.content.trim())
            );
            if (originalFromHistory) {
              effectiveMessage = originalFromHistory.content;
            }
          }

          // --- Phase 1: Explore (after option selection or for non-interactive tasks) ---
          let exploration = null;
          if (virtualFS.size > 5) {
            // Only explore if the project has meaningful code (>5 files = not just a scaffold)
            const exploringStepNum = stepCounter++;
            await emitStep(requestId, siteId, exploringStepNum, "exploring", "running", "Exploring codebase...", undefined, sessionId);

            exploration = await runExploreAgent(
              selectedApproach ? `${effectiveMessage}\n\nApproach: ${selectedApproach}` : effectiveMessage,
              virtualFS,
              async (toolName, status, msg) => {
                await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, undefined, sessionId);
              },
              dbContext,
            );

            // Update dynamic prompt with exploration results
            dynamicPromptContext.exploration = exploration;
            systemPrompt = buildDynamicSystemPrompt(BASE_EXECUTOR_PROMPT, dynamicPromptContext);
            // Re-inject brain + memory context (system prompt was rebuilt)
            if (brainContext) systemPrompt += "\n\n" + brainContext;
            if (memoryContext) systemPrompt += "\n\n" + memoryContext;

            await emitStep(requestId, siteId, exploringStepNum, "exploring", "complete", "Codebase exploration complete", { content: exploration.summary.slice(0, 500) }, sessionId);
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
          let planMessage = selectedApproach
            ? `${effectiveMessage}\n\n## Selected Approach\n${selectedApproach}`
            : effectiveMessage;

          // Include memory context so planner knows what was previously built
          if (memoryContext) {
            planMessage += `\n\n${memoryContext}`;
          }

          const plan = await runPlanAgent(
            planMessage, exploration, virtualFS,
            classification.complexity,
            authHistory,
            async (toolName, status, msg, details) => {
              if (toolName === "planning") {
                await emitStep(requestId, siteId, planStepNum, "planning", status, msg, details, sessionId);
              } else {
                await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, details, sessionId);
              }
            },
            dbContext,
            selectedModel,
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

          // --- Phase 3: Execute tasks ---
          const executingStepNum = stepCounter++;
          await emitStep(requestId, siteId, executingStepNum, "executing", "running", "Executing implementation...", undefined, sessionId);

          let execOutput = "";
          let conversationMemory: Array<{ role: string; content: string }> = [];
          const taskResults: Array<{ taskId: number; success: boolean; error?: string }> = [];

          // Group tasks by dependency level for parallel execution
          const taskLevels = groupTasksByDependencyLevel(plan.tasks);

          for (const level of taskLevels) {
            if (await isCancelled()) break;

            // Execute tasks in this level in parallel
            const levelPromises = level.map(async (task) => {
              await emitStep(requestId, siteId, stepCounter++, "task_start", "running", `Task ${task.id}: ${task.description}`, undefined, sessionId);

              // --- Execute Task (always Flash — planner provides detailed instructions) ---
              const chain = selectModelWithFallback("execute", "simple");
              const tools = createEnhancedTools(virtualFS, dbContext);

              const uploadedFilesContext = uploadedFiles?.length
                ? `\n## UPLOADED FILES\nThe user uploaded file(s) available in the project: ${uploadedFiles.map(f => `/${f.path}`).join(", ")}\nUse them directly in code with src="/${uploadedFiles[0].path}" (public/ folder, served as static assets).\nReference uploaded files instead of picsum.photos when the user wants to use their own image.\n`
                : "";

              let taskPrompt = `## USER INTENT (CRITICAL — do NOT deviate from this request)
THE USER WANTS: ${effectiveMessage}
${selectedApproach ? `SELECTED APPROACH: ${selectedApproach}` : ""}
${uploadedFilesContext}
## Current Task (${task.id}/${plan.tasks.length})
**${task.description}**
Type: ${task.type}
Files: ${task.files.join(", ")}

## INSTRUCTIONS (follow these exactly)
${(task as any).instructions || task.description}
${(task as any).codeHints ? `\n## Code Hints\n${(task as any).codeHints}` : ""}
${(task as any).libraries?.length ? `\n## Libraries needed: ${(task as any).libraries.join(", ")}` : ""}

Verification: ${task.verification}

## Available Files
${Array.from(virtualFS.keys()).filter(f => !f.endsWith(".lock") && !f.includes("node_modules/")).sort().join(", ")}

Execute this task. Follow the instructions precisely. Write complete, working code.`;

              // Append component manifest for page composition tasks
              const isPageCompositionTask = task.files.some((f: string) => f.includes("page.tsx"));
              if (isPageCompositionTask) {
                const existingComponents = Array.from(virtualFS.keys()).filter(
                  (p: string) => p.startsWith("src/components/") && /\.(tsx|jsx)$/.test(p)
                );
                if (existingComponents.length > 0) {
                  const manifest = existingComponents.map((p: string) => {
                    const name = p.split("/").pop()!.replace(/\.(tsx|jsx)$/, "");
                    return `- import ${name} from "@/components/${name}"`;
                  }).join("\n");
                  taskPrompt += `\n\n## COMPONENT MANIFEST (CRITICAL — import ALL of these in page.tsx)\nThe following components exist and MUST be imported and rendered in page.tsx:\n${manifest}\n\nRender them in logical order: Navbar → Hero → content sections → Footer.\nDo NOT skip any component. Every file listed above MUST appear in page.tsx.`;
                }
              }

              try {
                const taskResult = await generateTextWithFallback({
                  model: chain.primary.model,
                  system: systemPrompt,
                  // Include user's image on the first task for visual context
                  ...(image && task.id === 1
                    ? { messages: [{ role: "user" as const, content: [
                        { type: "text" as const, text: taskPrompt },
                        { type: "image" as const, image },
                      ]}]}
                    : { prompt: taskPrompt }),
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

                // Compact memory after each task
                conversationMemory = compactToolResults(conversationMemory, `Task ${task.id} completed: ${task.description}`);
              } catch (taskError: any) {
                if (taskError.message === "EXECUTION_CANCELLED") throw taskError;

                taskResults.push({ taskId: task.id, success: false, error: taskError.message });
                await emitStep(requestId, siteId, stepCounter++, "task_failed", "error", `Task ${task.id} failed: ${taskError.message}`, undefined, sessionId);
              }
            });

            // Wait for all tasks in this level to complete
            await Promise.all(levelPromises);
          }

          // Mark executing step as complete
          const completedTasks = taskResults.filter(r => r.success).length;
          await emitStep(requestId, siteId, executingStepNum, "executing", "complete",
            `Executed ${completedTasks}/${taskResults.length} tasks`, undefined, sessionId);

          if (await isCancelled()) {
            writeTextToStream(writer, "Cancelled.", msgId);
            writeDoneMarker(writer, fileOperations.length);
            writer.write({ type: "finish", finishReason: "stop" });
            return;
          }

          // --- Phase 4: Self-Healing Build Validation ---
          const buildStepNum = stepCounter++;
          await emitStep(requestId, siteId, buildStepNum, "build_validation", "running", "Running build validation...", undefined, sessionId);

          const buildResult = await runBuildValidationLoop(
            virtualFS, fileOperations,
            async (stepNum, toolName, status, msg, details) => {
              await emitStep(requestId, siteId, stepCounter++, toolName, status, msg, details, sessionId);
            },
            stepCounter,
            3, // max 3 iterations
            selectedModel,
          );
          stepCounter += buildResult.iterations * 3;

          // Send any fix file ops to the stream
          for (const op of buildResult.fileOperations) {
            sendFileOp(op);
            fileOperations.push(op);
          }

          await emitStep(requestId, siteId, buildStepNum, "build_validation",
            buildResult.passed ? "complete" : "error",
            buildResult.passed
              ? `Build validation passed (${buildResult.fixesApplied} auto-fixes applied)`
              : `Build validation: ${buildResult.errors.length} remaining issues`,
            undefined, sessionId);

          // --- Phase 5: Final Verification ---
          const verifyStepNum = stepCounter++;
          await emitStep(requestId, siteId, verifyStepNum, "verifying", "running", "Final verification...", undefined, sessionId);

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
            requestId, siteId, verifyStepNum, "verifying",
            verification.passed ? "complete" : "error",
            verification.passed ? "All checks passed" : `${verification.issues.length} issues found`,
            { content: verification.summary },
            sessionId,
          );

          // --- Save Conversation Memory ---
          if (siteId && siteId !== "unknown" && sessionId) {
            try {
              await saveConversationMemory({
                projectId: siteId,
                sessionId,
                userMessage: effectiveMessage,
                classification,
                selectedApproach,
                planSummary: plan?.summary || null,
                filesChanged: fileOperations.map(op => op.path),
                sequenceNumber: conversationMemories.length + 1,
              });
            } catch {
              // Memory saving is non-critical
            }
          }

          // --- Done ---
          const successCount = taskResults.filter(r => r.success).length;
          const summaryText = `Completed ${successCount}/${plan.tasks.length} tasks with ${fileOperations.length} file operations.${verification.passed ? " All checks passed." : ""}${buildResult.fixesApplied > 0 ? ` ${buildResult.fixesApplied} auto-fixes applied.` : ""}`;
          await emitStep(requestId, siteId, 999, "complete", "complete", summaryText, undefined, sessionId);

          const finalText = execOutput || summaryText;
          writeTextToStream(writer, finalText, msgId);
          writeDoneMarker(writer, fileOperations.length);
          // Persist server-side in case client disconnected
          await persistMessageServerSide(finalText);
          writer.write({ type: "finish", finishReason: "stop" });
        } catch (error: any) {
          const errorTextId = `error_${Date.now()}`;
          let errorContent: string;
          if (error.message === "EXECUTION_CANCELLED") {
            errorContent = "Execution stopped by user.";
            try {
              writer.write({ type: "text-start", id: errorTextId });
              writer.write({ type: "text-delta", id: errorTextId, delta: errorContent });
              writer.write({ type: "text-end", id: errorTextId });
            } catch { /* stream may be closed */ }
          } else {
            console.error("[AI Chat Error]", error);
            const isProviderError = error?.message?.includes("Invalid JSON response")
              || error?.message?.includes("Internal Server Error")
              || error?.statusCode === 500;
            errorContent = isProviderError
              ? "The AI provider returned an error. Please try again."
              : (error.message || "Internal server error");
            // Always write visible text so onFinish has content to persist
            try {
              writer.write({ type: "text-start", id: errorTextId });
              writer.write({ type: "text-delta", id: errorTextId, delta: errorContent });
              writer.write({ type: "text-end", id: errorTextId });
            } catch { /* stream may be closed */ }
          }
          // Persist error message server-side
          await persistMessageServerSide(errorContent, 'error');
          try {
            writer.write({ type: "finish", finishReason: "error" });
          } catch { /* stream may be closed */ }
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
    } else if (name === "search_and_replace") {
      // search_and_replace modifies virtualFS directly — emit FILE_OPs for each modified file
      const searchText = args.search || "";
      const replaceText = args.replace || "";
      let modifiedCount = 0;
      if (replaceText && searchText) {
        for (const [filePath, content] of virtualFS.entries()) {
          if (filePath.includes("node_modules/") || filePath.includes(".lock")) continue;
          // Emit FILE_OP for every file containing the replacement text
          // Don't skip already-tracked files — search_and_replace may have re-modified them
          if (content.includes(replaceText)) {
            const op: FileOperation = { type: "write", path: filePath, content };
            fileOperations.push(op);
            sendFileOp(op);
            modifiedCount++;
          }
        }
      }
      await emitStepFn(requestId, siteId, 200 + fileOperations.length, "search_and_replace", "complete",
        `Replaced "${searchText.slice(0, 30)}" → "${replaceText.slice(0, 30)}" across ${modifiedCount} file(s)`,
        undefined, sessionId);
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
  message, image, files, conversationHistory, requestId, siteId, sessionId,
}: {
  message: string;
  image?: string;
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
          // Compressed history: recent messages get more detail, older ones get summaries
          const recentHistory = conversationHistory.slice(-6);
          const historyContext = recentHistory
            .map((m, i) => {
              const fromEnd = recentHistory.length - i;
              const maxLen = fromEnd <= 3 ? 500 : 100;
              return `${m.role}: ${m.content.slice(0, maxLen)}`;
            })
            .join("\n");

          const prompt = `${historyContext ? `Previous conversation:\n${historyContext}\n\n` : ""}Project files: ${fileList || "none"}\n\nUser question: ${message}`;

          const result = await generateTextBase({
            model: getFlashModel(),
            system: "You are a helpful web development assistant. Answer questions concisely based on the project context provided. If the user attached an image/screenshot, analyze it and respond accordingly.",
            ...(image
              ? { messages: [{ role: "user" as const, content: [
                  { type: "text" as const, text: prompt },
                  { type: "image" as const, image },
                ]}]}
              : { prompt }),
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
