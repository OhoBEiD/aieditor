// Intent Classifier - Determines request type, complexity, and routing
// Uses regex for fast path, falls back to LLM (Flash, minimal thinking)
// Returns classification with complexity and routing recommendation

import { generateText } from "ai";
import { selectModel, type Complexity } from "../router";

// --- Types ---

export interface ClassificationResult {
  type: "simple_edit" | "complex_feature" | "question" | "clarification" | "ui_task" | "backend_task" | "refactor" | "debug";
  complexity: Complexity;
  route: "fast_path" | "full_pipeline";
  confidence: number;
  source: "regex" | "llm" | "fallback";
}

// --- Regex Patterns ---

const SIMPLE_EDIT_PATTERNS = [
  /^(change|update|set|fix|replace|modify)\s+(the\s+)?(title|text|heading|name|color|background|font|size|padding|margin)/i,
  /^make\s+(it|the|this)\s+(bigger|smaller|larger|bolder|darker|lighter|centered)/i,
  /^(remove|delete|hide)\s+(the\s+)?\w{2,20}$/i,
  /^(add|put|insert)\s+(a\s+)?(comma|period|space|word)/i,
  /^(change|update|swap|switch)\s+(the\s+)?(icon|image|photo|logo)/i,
  /^(move|align|center)\s/i,
];

const QUESTION_PATTERNS = [
  /^(what|why|how|can you|could you|should|is it|explain|describe|tell me|where|when|who)/i,
  /^(do you|does it|have you|will it)/i,
  /\?\s*$/,
];

// Complex tasks that need planning + exploration
const COMPLEX_KEYWORDS = [
  "implement", "build from scratch", "new page", "new feature",
  "integrate", "authentication", "multi-page", "full",
  "landing page", "website", "dashboard", "e-commerce",
  "create table", "schema", "supabase auth", "sign up flow",
  "registration", "checkout", "shopping cart", "blog",
];

// Moderate tasks that need planning but not exploration
const MODERATE_KEYWORDS = [
  "create", "add feature", "new component", "form with",
  "api", "database", "add page", "build",
  "multiple", "login page", "contact form",
];

// UI tasks (route to Vercel UI Agent for fast execution)
const UI_KEYWORDS = [
  "button", "card", "modal", "navbar", "header", "footer", "sidebar",
  "form", "input", "dropdown", "menu", "carousel", "slider", "hero",
  "layout", "grid", "flex", "responsive", "mobile", "animation",
  "style", "css", "tailwind", "color", "theme", "dark mode",
  "component", "ui", "ux", "design", "section",
];

// Backend keywords
const BACKEND_KEYWORDS = [
  "api", "endpoint", "route", "server", "database", "supabase", "prisma",
  "authentication", "auth", "middleware", "webhook", "cron", "service",
  "function", "utility", "helper", "config", "env", "backend",
  "table", "sql", "query", "insert", "select", "rls", "policy",
  "migration", "seed data", "foreign key",
];

// Debug/fix patterns
const DEBUG_PATTERNS = [
  /fix\s+(the\s+)?(bug|error|issue|problem|crash)/i,
  /debug/i,
  /not\s+working/i,
  /broken/i,
  /error\s+in/i,
  /why\s+(is|does|doesn't)/i,
];

// Refactor patterns
const REFACTOR_PATTERNS = [
  /refactor/i,
  /clean\s*up/i,
  /reorganize/i,
  /restructure/i,
  /optimize/i,
  /improve\s+(the\s+)?(code|performance|structure)/i,
];

// --- Fast Classification ---

export function classifyIntentFast(message: string): ClassificationResult | null {
  const msgLower = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  // Questions
  const isQuestion = QUESTION_PATTERNS.some((p) => p.test(message));
  if (isQuestion && wordCount < 20 && !msgLower.includes("create") && !msgLower.includes("build")) {
    return { type: "question", complexity: "simple", route: "fast_path", confidence: 0.9, source: "regex" };
  }

  // Debug/fix requests
  const isDebug = DEBUG_PATTERNS.some((p) => p.test(message));
  if (isDebug) {
    return { type: "debug", complexity: "moderate", route: "full_pipeline", confidence: 0.85, source: "regex" };
  }

  // Refactor requests
  const isRefactor = REFACTOR_PATTERNS.some((p) => p.test(message));
  if (isRefactor) {
    return { type: "refactor", complexity: "complex", route: "full_pipeline", confidence: 0.85, source: "regex" };
  }

  // Complex keywords (always full pipeline)
  const hasComplexKeyword = COMPLEX_KEYWORDS.some((k) => msgLower.includes(k));
  if (hasComplexKeyword) {
    return { type: "complex_feature", complexity: "complex", route: "full_pipeline", confidence: 0.85, source: "regex" };
  }

  // Moderate keywords (planning but maybe skip exploration)
  const hasModerateKeyword = MODERATE_KEYWORDS.some((k) => msgLower.includes(k));
  const hasBackendKeyword = BACKEND_KEYWORDS.some((k) => msgLower.includes(k));
  const hasUIKeyword = UI_KEYWORDS.some((k) => msgLower.includes(k));

  if (hasModerateKeyword && hasBackendKeyword) {
    return { type: "backend_task", complexity: "moderate", route: "full_pipeline", confidence: 0.8, source: "regex" };
  }

  if (hasModerateKeyword) {
    return { type: "complex_feature", complexity: "moderate", route: "full_pipeline", confidence: 0.8, source: "regex" };
  }

  // Backend-only tasks
  if (hasBackendKeyword && !hasUIKeyword) {
    return { type: "backend_task", complexity: "moderate", route: "full_pipeline", confidence: 0.8, source: "regex" };
  }

  // UI-only tasks (fast execution via Vercel UI Agent)
  if (hasUIKeyword && !hasBackendKeyword && wordCount < 30) {
    return { type: "ui_task", complexity: "simple", route: "fast_path", confidence: 0.85, source: "regex" };
  }

  // Simple edits
  const isSimple = SIMPLE_EDIT_PATTERNS.some((p) => p.test(message));
  if (isSimple) {
    return { type: "simple_edit", complexity: "simple", route: "fast_path", confidence: 0.9, source: "regex" };
  }

  // Short messages (< 10 words) without complex keywords → fast path
  if (wordCount < 10 && !hasComplexKeyword && !hasModerateKeyword) {
    return { type: "simple_edit", complexity: "simple", route: "fast_path", confidence: 0.7, source: "regex" };
  }

  return null; // Need LLM classification
}

// --- LLM Classification ---

async function classifyIntentWithLLM(message: string): Promise<ClassificationResult> {
  const config = selectModel("classify");

  try {
    const result = await generateText({
      model: config.model,
      system: `Classify this coding request. Respond with ONLY JSON:
{"type":"simple_edit|complex_feature|ui_task|backend_task|question|debug|refactor","complexity":"simple|moderate|complex","confidence":0.X}

Types:
- simple_edit: Small changes (text, colors, styling, single-line fixes)
- complex_feature: New pages, multi-file features, integrations, landing pages
- ui_task: Single UI component creation/modification (button, card, form)
- backend_task: API endpoints, database changes, auth logic
- question: User asking about something
- debug: Fixing bugs, errors, broken functionality
- refactor: Code cleanup, restructuring, optimization

Complexity:
- simple: 1-2 files, < 5 minutes of work
- moderate: 3-5 files, needs planning
- complex: 6+ files, needs exploration + planning + verification`,
      prompt: message.slice(0, 400),
    });

    const text = result.text || "{}";
    const match = text.match(/\{[^}]+\}/);
    const parsed = JSON.parse(match?.[0] || "{}");

    const type = parsed.type || "simple_edit";
    const complexity = parsed.complexity || "moderate";

    return {
      type,
      complexity,
      route: complexity === "simple" || type === "question" ? "fast_path" : "full_pipeline",
      confidence: parsed.confidence || 0.7,
      source: "llm",
    };
  } catch (e) {
    console.error("[IntentClassifier] LLM error:", e);
    return {
      type: "simple_edit",
      complexity: "moderate",
      route: "full_pipeline",
      confidence: 0.5,
      source: "fallback",
    };
  }
}

// --- Public API ---

export async function classifyIntent(message: string): Promise<ClassificationResult> {
  // Try fast regex classification first
  const fastResult = classifyIntentFast(message);
  if (fastResult) return fastResult;

  // Fall back to LLM
  return classifyIntentWithLLM(message);
}
