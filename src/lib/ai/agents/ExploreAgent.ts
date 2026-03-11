// Explore Sub-Agent - Fast, read-only codebase exploration
// Runs on Flash with low thinking, isolated context window
// Returns a compressed summary to the orchestrator (not raw file contents)

import { generateText, stepCountIs } from "ai";
import { selectModel } from "../router";
import { getExploreTools, type DatabaseContext } from "../tools/enhanced-tools";

// --- Types ---

export interface ExplorationResult {
  summary: string;
  relevantFiles: Array<{
    path: string;
    relevance: string;
    keyLines?: string; // e.g., "42-65" for the important section
  }>;
  patterns: string[];     // e.g., ["Uses Tailwind", "App Router", "TypeScript interfaces for props"]
  suggestions: string[];  // e.g., ["Reuse existing Button component at src/components/ui/button.tsx"]
  projectStructure: string; // Compact directory listing
}

// --- System Prompt ---

const EXPLORE_SYSTEM_PROMPT = `You are a fast codebase explorer. Your job is to quickly understand the relevant parts of a project for a given task.

## RULES
1. Start with list_files or glob_files to understand the project structure
2. Use grep_files to find relevant patterns, imports, function definitions, and component names
3. Use read_file with line ranges to read ONLY the relevant sections (e.g., read_file({path: "src/app/page.tsx", startLine: 1, endLine: 30}))
4. NEVER read entire files unless they are small (<50 lines). Use grep_files to find the exact lines you need, then read just those lines.
5. Be FAST - you have max 8 tool calls. Don't waste them reading boilerplate.
6. Focus on finding: existing components to reuse, imports to follow, patterns to match, and files that will be affected.

## OUTPUT FORMAT
After exploring, return a structured summary in this EXACT format:

### PROJECT STRUCTURE
[Compact directory listing of key folders]

### RELEVANT FILES
- [path] (lines X-Y): [why it's relevant]
- [path] (lines X-Y): [why it's relevant]

### PATTERNS
- [pattern 1: e.g., "Components use forwardRef + cn() utility"]
- [pattern 2: e.g., "Tailwind config has custom colors: primary, secondary"]

### SUGGESTIONS
- [suggestion 1: e.g., "Reuse Button from src/components/ui/button.tsx"]
- [suggestion 2: e.g., "Follow the existing layout pattern in src/app/layout.tsx"]

Keep the summary under 1500 tokens. Only include information relevant to the user's task.`;

// --- Agent ---

export async function runExploreAgent(
  userRequest: string,
  virtualFS: Map<string, string>,
  onStep?: (toolName: string, status: string, message: string) => Promise<void>,
  dbContext?: DatabaseContext,
): Promise<ExplorationResult> {
  const config = selectModel("explore");
  const tools = getExploreTools(virtualFS, dbContext);

  const fileCount = virtualFS.size;
  const prompt = `## Task
${userRequest}

## Context
This project has ${fileCount} files. Explore the codebase to understand what exists and what's relevant to the task.`;

  try {
    const result = await generateText({
      model: config.model,
      system: EXPLORE_SYSTEM_PROMPT,
      prompt,
      tools,
      stopWhen: stepCountIs(config.maxSteps),
      onStepFinish: async (step) => {
        if (onStep && step.toolCalls) {
          for (const tc of step.toolCalls) {
            const args = (tc as any).args || (tc as any).input || {};
            let msg = `Exploring: ${tc.toolName}`;
            if (tc.toolName === "grep_files" && args.pattern) {
              msg = `Searching for "${args.pattern}"`;
            } else if (tc.toolName === "glob_files" && args.pattern) {
              msg = `Finding files: ${args.pattern}`;
            } else if (tc.toolName === "read_file" && args.path) {
              const range = args.startLine ? ` (lines ${args.startLine}-${args.endLine || "end"})` : "";
              msg = `Reading ${args.path}${range}`;
            } else if (tc.toolName === "list_files") {
              msg = `Listing project files`;
            }
            await onStep(tc.toolName, "complete", msg);
          }
        }
      },
    });

    // Parse the exploration summary into structured format
    return parseExplorationOutput(result.text || "", virtualFS);
  } catch (error: any) {
    console.error("[ExploreAgent] Error:", error.message);
    // Return a minimal exploration result on failure
    return {
      summary: "Exploration failed, proceeding with available context.",
      relevantFiles: [],
      patterns: [],
      suggestions: [],
      projectStructure: Array.from(virtualFS.keys()).sort().join("\n"),
    };
  }
}

// --- Parser ---

function parseExplorationOutput(
  text: string,
  virtualFS: Map<string, string>,
): ExplorationResult {
  const relevantFiles: ExplorationResult["relevantFiles"] = [];
  const patterns: string[] = [];
  const suggestions: string[] = [];

  // Parse sections from the text
  const sections = text.split(/###\s*/);

  for (const section of sections) {
    const lines = section.trim().split("\n").filter(Boolean);
    const header = lines[0]?.toLowerCase() || "";

    if (header.includes("relevant")) {
      for (const line of lines.slice(1)) {
        const match = line.match(/^[-*]\s*(.+?)(?:\s*\(lines?\s*([\d-]+)\))?\s*:\s*(.+)/);
        if (match) {
          relevantFiles.push({
            path: match[1].trim(),
            keyLines: match[2],
            relevance: match[3].trim(),
          });
        }
      }
    } else if (header.includes("pattern")) {
      for (const line of lines.slice(1)) {
        const cleaned = line.replace(/^[-*]\s*/, "").trim();
        if (cleaned) patterns.push(cleaned);
      }
    } else if (header.includes("suggestion")) {
      for (const line of lines.slice(1)) {
        const cleaned = line.replace(/^[-*]\s*/, "").trim();
        if (cleaned) suggestions.push(cleaned);
      }
    }
  }

  // Build compact project structure
  const allFiles = Array.from(virtualFS.keys()).sort();
  const dirs = new Set<string>();
  for (const f of allFiles) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/") + "/");
    }
  }

  return {
    summary: text.slice(0, 5000), // Cap at ~5000 chars (~1250 tokens)
    relevantFiles,
    patterns,
    suggestions,
    projectStructure: allFiles.join("\n"),
  };
}
