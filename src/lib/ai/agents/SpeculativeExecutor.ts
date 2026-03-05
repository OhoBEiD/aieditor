// Speculative Executor — MCTS-inspired parallel branch exploration
// Instead of generating one solution, explores 2-3 alternatives and picks the best
// Based on SWE-Search (ICLR 2025) — nobody has this in production yet

import { generateText, stepCountIs } from "ai";
import { selectModel } from "../router";
import { createEnhancedTools, type DatabaseContext } from "../tools/enhanced-tools";
import { scoreTaskOutput, type QualityScore } from "./QualityScorer";
import { validateBuild } from "./BuildValidator";
import type { RepoMap } from "../context/repo-map";

// --- Types ---

interface Task {
  id: string;
  description: string;
  complexity: string;
}

interface FileOperation {
  type: "write" | "modify" | "delete";
  path: string;
  content?: string;
}

interface BranchResult {
  branchId: number;
  strategy: string;
  fileOperations: FileOperation[];
  virtualFS: Map<string, string>;
  qualityScore: number;
  errorCount: number;
  combinedScore: number;
  text: string;
}

export interface SpeculativeResult {
  selectedBranch: BranchResult;
  allBranches: BranchResult[];
  reason: string;
}

// --- Branch Strategies ---

interface BranchStrategy {
  id: number;
  name: string;
  temperature: number;
  promptSuffix: string;
}

const STRATEGIES: BranchStrategy[] = [
  {
    id: 1,
    name: "safe",
    temperature: 0.1,
    promptSuffix: "\n\nApproach: Use established patterns. Prefer existing components and utilities. Minimize new code.",
  },
  {
    id: 2,
    name: "creative",
    temperature: 0.4,
    promptSuffix: "\n\nApproach: Aim for the most elegant and clean implementation. Optimize for readability and maintainability.",
  },
  {
    id: 3,
    name: "minimal",
    temperature: 0.1,
    promptSuffix: "\n\nApproach: Implement with the absolute minimum code changes. Only touch what is strictly necessary.",
  },
];

// --- Main Speculative Executor ---

/**
 * Execute a task using multiple parallel branches.
 * Each branch uses a different strategy (safe, creative, minimal).
 * Scores all branches and returns the best one.
 *
 * Only use for complex tasks — simple tasks should use direct execution.
 */
export async function speculativeExecute(
  task: Task,
  virtualFS: Map<string, string>,
  systemPrompt: string,
  repoMap: RepoMap | null,
  numBranches: number = 3,
  dbContext?: DatabaseContext,
): Promise<SpeculativeResult> {
  const strategies = STRATEGIES.slice(0, numBranches);

  // Run all branches in parallel
  const branchPromises = strategies.map(strategy =>
    executeBranch(task, virtualFS, systemPrompt, strategy, repoMap, dbContext),
  );

  const branches = await Promise.all(branchPromises);

  // Filter out failed branches
  const validBranches = branches.filter(b => b.fileOperations.length > 0);

  if (validBranches.length === 0) {
    // All branches failed — return first branch as-is (let the main pipeline handle errors)
    return {
      selectedBranch: branches[0],
      allBranches: branches,
      reason: "All branches produced no file operations",
    };
  }

  // Select the best branch
  const sorted = [...validBranches].sort((a, b) => b.combinedScore - a.combinedScore);
  const best = sorted[0];

  const reason = buildSelectionReason(best, sorted);

  return {
    selectedBranch: best,
    allBranches: branches,
    reason,
  };
}

// --- Branch Execution ---

async function executeBranch(
  task: Task,
  originalFS: Map<string, string>,
  systemPrompt: string,
  strategy: BranchStrategy,
  repoMap: RepoMap | null,
  dbContext?: DatabaseContext,
): Promise<BranchResult> {
  // Clone virtualFS for isolation
  const branchFS = new Map(originalFS);
  const tools = createEnhancedTools(branchFS, dbContext);
  const fileOperations: FileOperation[] = [];

  // Select model with reduced step budget
  const config = selectModel("execute", task.complexity as any);
  const maxSteps = Math.max(3, Math.floor(config.maxSteps / 2));

  const prompt = `${task.description}${strategy.promptSuffix}`;

  try {
    const result = await generateText({
      model: config.model,
      system: systemPrompt,
      prompt,
      temperature: strategy.temperature,
      tools,
      stopWhen: stepCountIs(maxSteps),
      onStepFinish: async (step) => {
        // Collect file operations from tool calls
        if (step.toolCalls) {
          for (const call of step.toolCalls) {
            const input = (call as any).input || (call as any).args || {};
            if (call.toolName === "write_file" && input.path) {
              fileOperations.push({
                type: "write",
                path: input.path,
                content: branchFS.get(input.path) || input.content,
              });
            } else if ((call.toolName === "edit_file" || call.toolName === "modify_file") && input.path) {
              fileOperations.push({
                type: "modify",
                path: input.path,
                content: branchFS.get(input.path),
              });
            } else if (call.toolName === "delete_file" && input.path) {
              fileOperations.push({
                type: "delete",
                path: input.path,
              });
            }
          }
        }
      },
    });

    // Score this branch
    const { qualityScore, errorCount } = scoreBranch(
      fileOperations,
      branchFS,
      repoMap,
    );

    // Combined score: quality weighted + inverse error count + file operations productivity
    const productivityBonus = Math.min(2, fileOperations.length * 0.2);
    const combinedScore =
      qualityScore * 0.4 +
      Math.max(0, 10 - errorCount * 2) * 0.4 +
      productivityBonus * 0.2;

    return {
      branchId: strategy.id,
      strategy: strategy.name,
      fileOperations,
      virtualFS: branchFS,
      qualityScore,
      errorCount,
      combinedScore: Math.round(combinedScore * 10) / 10,
      text: result.text,
    };
  } catch {
    // Branch failed — return empty result with score 0
    return {
      branchId: strategy.id,
      strategy: strategy.name,
      fileOperations: [],
      virtualFS: branchFS,
      qualityScore: 0,
      errorCount: 99,
      combinedScore: 0,
      text: "",
    };
  }
}

// --- Branch Scoring ---

function scoreBranch(
  fileOperations: FileOperation[],
  virtualFS: Map<string, string>,
  repoMap: RepoMap | null,
): { qualityScore: number; errorCount: number } {
  // Quality score from QualityScorer
  const { averageScore } = scoreTaskOutput(fileOperations, virtualFS, repoMap);

  // Error count from BuildValidator
  const errors = validateBuild(virtualFS);
  const errorCount = errors.filter(e => e.severity === "error").length;

  return {
    qualityScore: averageScore,
    errorCount,
  };
}

// --- Selection Reasoning ---

function buildSelectionReason(
  best: BranchResult,
  sorted: BranchResult[],
): string {
  if (sorted.length === 1) {
    return `Only one viable branch (${best.strategy}): score ${best.combinedScore}`;
  }

  const runner = sorted[1];
  const gap = Math.round((best.combinedScore - runner.combinedScore) * 10) / 10;

  if (gap > 2) {
    return `Branch ${best.branchId} (${best.strategy}) clearly best: ${best.combinedScore} vs ${runner.combinedScore} (gap: ${gap})`;
  }

  return `Branch ${best.branchId} (${best.strategy}) narrowly selected: ${best.combinedScore} vs ${runner.combinedScore}. Quality: ${best.qualityScore}/10, Errors: ${best.errorCount}`;
}

/**
 * Determine if a task should use speculative execution.
 * Only complex tasks benefit — simple tasks are faster with direct execution.
 */
export function shouldUseSpeculation(
  complexity: string,
  taskCount: number,
): boolean {
  // Only speculate on complex tasks
  if (complexity !== "complex") return false;

  // Don't speculate if there are many tasks (too expensive)
  if (taskCount > 4) return false;

  return true;
}
