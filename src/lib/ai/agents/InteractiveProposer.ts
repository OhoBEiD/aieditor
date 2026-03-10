// Interactive Proposer — Generates 3 implementation approaches for user selection
// After codebase exploration, presents options instead of auto-executing
// User picks their preferred approach, then the AI plans + executes accordingly

import { generateText } from "ai";
import { selectModel } from "../router";
import type { ExplorationResult } from "./ExploreAgent";
import type { BrainEntry } from "../context/brain";
import { ANIMATION_SKILLS_BRIEF } from "../prompts/skills";

// --- Types ---

export interface ApproachOption {
  id: number;
  title: string;           // Short name, e.g. "Full Redesign with GSAP"
  description: string;     // 2-3 sentence explanation
  approach: string;        // Detailed approach the planner will follow
  complexity: "simple" | "moderate" | "complex";
  estimatedFiles: number;  // Rough file count
  tradeoffs: {
    pros: string[];
    cons: string[];
  };
}

export interface ProposalResult {
  options: ApproachOption[];
  researchSummary: string;  // What the AI found during exploration
  recommendation: number;   // ID of recommended option (1, 2, or 3)
  recommendationReason: string;
}

// --- System Prompt ---

const PROPOSER_SYSTEM_PROMPT = `You are a senior software architect reviewing a codebase and proposing implementation approaches.

## YOUR JOB
After reviewing the codebase context, generate EXACTLY 3 distinct implementation approaches for the user's request.
Each approach should be meaningfully different — not just variations of the same idea.

## APPROACH STRATEGIES
- Option 1: **Safe/Conservative** — Minimal changes, reuses existing patterns, lowest risk
- Option 2: **Balanced/Recommended** — Good balance of quality and effort, follows best practices
- Option 3: **Ambitious/Premium** — Most polished result, more files, uses advanced techniques (GSAP, complex layouts, etc.)

## OUTPUT FORMAT (STRICT JSON)
You MUST output valid JSON in this EXACT structure:

\`\`\`json
{
  "researchSummary": "Brief summary of what you found in the codebase (2-3 sentences)",
  "options": [
    {
      "id": 1,
      "title": "Short title (3-5 words)",
      "description": "2-3 sentence explanation of this approach",
      "approach": "Detailed description for the planner agent: what files to create/modify, what patterns to use, what components to build",
      "complexity": "simple",
      "estimatedFiles": 6,
      "tradeoffs": {
        "pros": ["Pro 1", "Pro 2"],
        "cons": ["Con 1"]
      }
    },
    {
      "id": 2,
      "title": "...",
      "description": "...",
      "approach": "...",
      "complexity": "moderate",
      "estimatedFiles": 12,
      "tradeoffs": { "pros": ["..."], "cons": ["..."] }
    },
    {
      "id": 3,
      "title": "...",
      "description": "...",
      "approach": "...",
      "complexity": "complex",
      "estimatedFiles": 16,
      "tradeoffs": { "pros": ["..."], "cons": ["..."] }
    }
  ],
  "recommendation": 2,
  "recommendationReason": "Why this option is recommended for this specific case"
}
\`\`\`

## CRITICAL: USER INTENT
- ALL 3 options MUST directly address the user's request. Read it carefully.
- If the user asks for an "ecommerce furniture store", ALL options must be for an ecommerce furniture store — not a SaaS, dashboard, or any other type.
- Ignore any "learned patterns" that contradict the user's request. Those patterns are from previous projects and may be irrelevant.
- The options should differ in SCOPE and COMPLEXITY, not in what they build.

## BRAND NAME RULE (CRITICAL)
- If the user mentions a brand, store, or company name (e.g. "for Furry", "called Stellar", "my store X"), ALL 3 options MUST use that exact name in their title and approach description. NEVER invent an alternative brand name.
- If the user specifies a color theme, mention it in all 3 approaches.

## RULES
- Each option must be MEANINGFULLY different (different file count, different patterns, different scope)
- Be specific in the "approach" field — the planner agent will use this to create the execution plan
- Factor in what already exists in the codebase (don't suggest creating things that already exist)
- Estimated files should be realistic
- Keep the JSON clean and parseable`;

// --- Main Proposer ---

/**
 * Generate 3 implementation approaches for the user to choose from.
 * Called after codebase exploration, before planning.
 */
export async function generateProposals(
  userRequest: string,
  exploration: ExplorationResult | null,
  virtualFS: Map<string, string>,
  brainEntries: BrainEntry[],
): Promise<ProposalResult> {
  const config = selectModel("plan", "moderate");

  let prompt = `## USER INTENT (CRITICAL — ALL proposals must directly address this)\nTHE USER WANTS: ${userRequest}\n\n`;

  // Add exploration context
  if (exploration) {
    prompt += `## Codebase Analysis\n`;
    prompt += `### Project Structure\n${exploration.projectStructure}\n\n`;

    if (exploration.relevantFiles.length > 0) {
      prompt += `### Key Files Found\n`;
      for (const f of exploration.relevantFiles) {
        prompt += `- ${f.path}: ${f.relevance}\n`;
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
  } else {
    const fileList = Array.from(virtualFS.keys()).sort().join("\n");
    prompt += `## Project Files\n${fileList || "(empty project)"}\n\n`;
  }

  // Add brain context for informed proposals
  // Only include code-pattern and mistake entries — skip architecture/preference
  // entries as they may be from a different project type and could mislead the AI
  if (brainEntries.length > 0) {
    const safeEntries = brainEntries.filter(e =>
      e.category === 'mistake' || e.category === 'pattern' || e.category === 'component'
    );
    if (safeEntries.length > 0) {
      prompt += `## Code Patterns (from previous sessions — may not apply to current request)\n`;
      for (const entry of safeEntries.slice(0, 3)) {
        prompt += `- [${entry.category}] ${entry.content}\n`;
      }
      prompt += "\n";
    }
  }

  prompt += `Now generate 3 implementation approaches as JSON.`;

  try {
    const result = await generateText({
      model: config.model,
      system: PROPOSER_SYSTEM_PROMPT + "\n\n" + ANIMATION_SKILLS_BRIEF,
      prompt,
      temperature: 0.4, // Slightly creative for diverse options
    });

    return parseProposalOutput(result.text || "", userRequest);
  } catch (err: any) {
    console.error("[InteractiveProposer] Error:", err.message);
    return createFallbackProposal(userRequest);
  }
}

// --- Parser ---

function parseProposalOutput(text: string, userRequest: string): ProposalResult {
  // Try to extract JSON from the response
  let parsed: any = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    // Try markdown JSON block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch { /* continue */ }
    }

    // Try finding JSON object in text
    if (!parsed) {
      const braceMatch = text.match(/\{[\s\S]*"options"[\s\S]*\}/);
      if (braceMatch) {
        try {
          parsed = JSON.parse(braceMatch[0]);
        } catch { /* continue */ }
      }
    }
  }

  if (parsed && Array.isArray(parsed.options) && parsed.options.length >= 2) {
    return {
      researchSummary: parsed.researchSummary || "Analyzed codebase structure and patterns.",
      options: parsed.options.slice(0, 3).map((opt: any, i: number) => ({
        id: opt.id || i + 1,
        title: opt.title || `Approach ${i + 1}`,
        description: opt.description || "",
        approach: opt.approach || opt.description || "",
        complexity: opt.complexity || "moderate",
        estimatedFiles: opt.estimatedFiles || 5,
        tradeoffs: {
          pros: Array.isArray(opt.tradeoffs?.pros) ? opt.tradeoffs.pros : [],
          cons: Array.isArray(opt.tradeoffs?.cons) ? opt.tradeoffs.cons : [],
        },
      })),
      recommendation: parsed.recommendation || 2,
      recommendationReason: parsed.recommendationReason || "Best balance of quality and effort.",
    };
  }

  return createFallbackProposal(userRequest);
}

// --- Fallback ---

function createFallbackProposal(userRequest: string): ProposalResult {
  return {
    researchSummary: "Generated default approaches based on the request.",
    options: [
      {
        id: 1,
        title: "Quick & Minimal",
        description: "Implement the core functionality with minimal changes. Reuses existing components where possible.",
        approach: `Implement "${userRequest}" with minimal file changes. Reuse existing components and patterns. Focus on functionality over aesthetics.`,
        complexity: "simple",
        estimatedFiles: 6,
        tradeoffs: {
          pros: ["Fast to implement", "Low risk", "Fewer files to review"],
          cons: ["Basic styling", "Less polished"],
        },
      },
      {
        id: 2,
        title: "Balanced & Polished",
        description: "Well-structured implementation with good design. Follows best practices with proper component separation.",
        approach: `Implement "${userRequest}" with proper component architecture. Include responsive design, good typography, and clean code structure. Create separate components for each section.`,
        complexity: "moderate",
        estimatedFiles: 12,
        tradeoffs: {
          pros: ["Good quality", "Maintainable", "Proper architecture"],
          cons: ["More files", "Takes longer"],
        },
      },
      {
        id: 3,
        title: "Premium & Animated",
        description: "Full premium implementation with GSAP scroll animations, cinematic layout, and polished visual effects.",
        approach: `Implement "${userRequest}" with premium design: GSAP scroll animations with ScrollTrigger, parallax images, staggered card reveals, word-by-word hero text animation, counter stats with animation, and full responsive design. Choose a design style (solid, gradient, or glass) that best fits the site type. Create 8-10 separate components.`,
        complexity: "complex",
        estimatedFiles: 16,
        tradeoffs: {
          pros: ["Stunning visuals", "Professional quality", "Full animations"],
          cons: ["More complex", "More files", "Longer execution"],
        },
      },
    ],
    recommendation: 2,
    recommendationReason: "Best balance of quality and effort for most use cases.",
  };
}

/**
 * Check if a user message is selecting a previously proposed option.
 * Returns the option ID (1-3) or null if not a selection.
 */
export function parseOptionSelection(message: string): number | null {
  const lower = message.toLowerCase().trim();

  // Direct match: "option 1", "approach 2", "go with 3", "#2", "2"
  const directMatch = lower.match(/(?:option|approach|go\s+with|pick|choose|select|#)\s*(\d)/);
  if (directMatch) {
    const num = parseInt(directMatch[1]);
    if (num >= 1 && num <= 3) return num;
  }

  // Just a number: "1", "2", "3"
  if (/^[123]$/.test(lower)) {
    return parseInt(lower);
  }

  // Keywords that map to options
  if (lower.includes("quick") || lower.includes("minimal") || lower.includes("simple") || lower.includes("first")) {
    return 1;
  }
  if (lower.includes("balanced") || lower.includes("recommended") || lower.includes("second") || lower.includes("middle")) {
    return 2;
  }
  if (lower.includes("premium") || lower.includes("ambitious") || lower.includes("full") || lower.includes("third") || lower.includes("best")) {
    return 3;
  }

  return null;
}

/**
 * Determine if a task should use interactive mode.
 * Based on classification type and complexity — not conversation history.
 */
export function shouldUseInteractiveMode(
  classification: { type: string; complexity: string },
): boolean {
  // Don't ask for options on simple tasks
  if (classification.complexity === "simple") return false;

  // Simple edits and debug tasks skip proposals regardless of complexity
  if (classification.type === "simple_edit" || classification.type === "debug") return false;

  // Use interactive mode for moderate and complex tasks
  return true;
}
