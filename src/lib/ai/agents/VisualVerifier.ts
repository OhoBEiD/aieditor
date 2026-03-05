// Visual Verifier — Evaluates screenshots of generated UI using vision models
// Catches "Potemkin interfaces" — code that compiles but looks broken
// Inspired by Replit Agent 3's browser-based self-testing

import { generateText } from "ai";
import { selectModel } from "../router";

// --- Types ---

export interface VisualVerificationResult {
  passed: boolean;
  overallScore: number; // 0-10
  issues: string[];
  suggestions: string[];
  fixInstructions: string | null; // Only if passed === false
}

export interface VisualContext {
  taskDescription: string;
  planSummary: string;
  componentsCreated: string[];
}

// --- Main Verifier ---

/**
 * Evaluate a screenshot of the generated UI.
 * Sends the image to a vision-capable model and analyzes the result.
 *
 * @param screenshotBase64 - Base64 encoded screenshot (PNG/JPEG)
 * @param context - Task context for the vision model to compare against
 * @returns Structured verification result
 */
export async function verifyScreenshot(
  screenshotBase64: string,
  context: VisualContext,
): Promise<VisualVerificationResult> {
  if (!screenshotBase64) {
    return {
      passed: true,
      overallScore: 5,
      issues: ["No screenshot provided — skipping visual verification"],
      suggestions: [],
      fixInstructions: null,
    };
  }

  const config = selectModel("verify", "moderate");

  try {
    const result = await generateText({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildVisionPrompt(context),
            },
            {
              type: "image",
              image: screenshotBase64,
            },
          ],
        },
      ],
      temperature: 0.1,
    });

    return parseVerificationResponse(result.text);
  } catch (err: any) {
    // Vision not supported or model error — skip gracefully
    console.warn("[VisualVerifier] Vision verification failed:", err.message);
    return {
      passed: true,
      overallScore: 5,
      issues: [`Visual verification unavailable: ${err.message}`],
      suggestions: [],
      fixInstructions: null,
    };
  }
}

// --- Vision Prompt ---

function buildVisionPrompt(context: VisualContext): string {
  return `You are a senior UI/UX reviewer evaluating a screenshot of a generated web page.

## What was requested:
${context.taskDescription}

## Components that should be visible:
${context.componentsCreated.map(c => `- ${c}`).join("\n")}

## Evaluate this screenshot on these dimensions:

1. **Layout** (0-10): Is the page structure correct? No overlapping elements? Proper spacing?
2. **Visual Hierarchy** (0-10): Headers visible and prominent? Sections clearly separated? CTAs stand out?
3. **Design Quality** (0-10): Glass morphism effects present? Floating orbs? Grain texture? Premium look?
4. **Typography** (0-10): Headings large and bold? Body text readable? Font sizes appropriate?
5. **Completeness** (0-10): Are all requested sections/components visible? No blank sections? No placeholder text?
6. **Responsiveness** (0-10): Content properly contained? No horizontal overflow? Images sized correctly?

## Response format (STRICT JSON):
{
  "passed": true/false,
  "overallScore": 0-10,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "fixInstructions": "Detailed fix instructions if passed is false, or null if passed"
}

A score of 6+ means PASSED. Below 6 means FAILED and needs fixes.
Be specific about what's wrong and where (e.g., "Hero section text is cut off on the right side").`;
}

// --- Response Parser ---

function parseVerificationResponse(text: string): VisualVerificationResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackParse(text);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      passed: parsed.passed ?? true,
      overallScore: Math.max(0, Math.min(10, parsed.overallScore ?? 5)),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      fixInstructions: parsed.fixInstructions || null,
    };
  } catch {
    return fallbackParse(text);
  }
}

function fallbackParse(text: string): VisualVerificationResult {
  const lower = text.toLowerCase();
  const hasIssues = lower.includes("issue") || lower.includes("problem") ||
                    lower.includes("broken") || lower.includes("missing");

  return {
    passed: !hasIssues,
    overallScore: hasIssues ? 4 : 7,
    issues: hasIssues ? [text.slice(0, 300)] : [],
    suggestions: [],
    fixInstructions: hasIssues ? text.slice(0, 500) : null,
  };
}

// --- Fix Generator ---

/**
 * Generate specific code fixes based on visual verification feedback.
 * Returns a prompt that can be fed to the FixerAgent.
 */
export function buildVisualFixPrompt(
  verificationResult: VisualVerificationResult,
  fileOperations: Array<{ path: string; content?: string }>,
): string {
  const lines = [
    "## Visual Verification Found Issues",
    "",
    `Overall visual score: ${verificationResult.overallScore}/10`,
    "",
    "### Issues detected:",
    ...verificationResult.issues.map(i => `- ${i}`),
    "",
    "### Fix instructions:",
    verificationResult.fixInstructions || "Fix the issues listed above.",
    "",
    "### Files to fix:",
    ...fileOperations
      .filter(op => op.content && (op.path.endsWith(".tsx") || op.path.endsWith(".jsx") || op.path.endsWith(".css")))
      .map(op => `- ${op.path}`),
    "",
    "Fix the visual issues while maintaining all existing functionality.",
    "Focus on layout, spacing, visibility, and design consistency.",
  ];

  return lines.join("\n");
}
