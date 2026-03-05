// Artifact Emitter — Sends structured artifacts to the response stream
// Frontend parses <!--ARTIFACT:{json}--> tags and renders rich cards

import type { Artifact, ArtifactType, ArtifactData } from "./types";

let artifactCounter = 0;

/**
 * Create an artifact object with auto-generated ID.
 */
export function createArtifact(
  type: ArtifactType,
  title: string,
  data: ArtifactData,
): Artifact {
  return {
    id: `artifact_${type}_${++artifactCounter}`,
    type,
    title,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Emit an artifact to the response stream.
 * The frontend should parse these tags and render them as rich cards.
 */
export function emitArtifact(
  writer: any,
  type: ArtifactType,
  title: string,
  data: ArtifactData,
): void {
  const artifact = createArtifact(type, title, data);
  const tag = `\n<!--ARTIFACT:${JSON.stringify(artifact)}-->\n`;
  const textId = `artifact_emit_${Date.now()}_${artifact.id}`;
  try {
    writer.write({ type: "text-start", id: textId });
    writer.write({ type: "text-delta", id: textId, delta: tag });
    writer.write({ type: "text-end", id: textId });
  } catch {
    // Stream may be closed; silently ignore
  }
}

/**
 * Emit a plan artifact showing task breakdown.
 */
export function emitPlanArtifact(
  writer: any,
  tasks: Array<{ id: string; description: string; dependencies: string[]; complexity: string }>,
): void {
  emitArtifact(writer, "plan", "Execution Plan", {
    tasks: tasks.map(t => ({ ...t, status: "pending" as const })),
    totalTasks: tasks.length,
  });
}

/**
 * Emit a quality report artifact.
 */
export function emitQualityArtifact(
  writer: any,
  overall: number,
  fileScores: Array<{ path: string; score: number; issues: string[]; suggestions: string[] }>,
  criticalIssues: string[],
): void {
  emitArtifact(writer, "quality_report", `Code Quality: ${overall}/10`, {
    overall,
    fileScores,
    criticalIssues,
  });
}

/**
 * Emit a branch comparison artifact (for MCTS speculative editing).
 */
export function emitBranchComparisonArtifact(
  writer: any,
  branches: Array<{ id: number; strategy: string; qualityScore: number; errorCount: number; selected: boolean }>,
  selectedBranch: number,
  reason: string,
): void {
  emitArtifact(writer, "branch_comparison", `Explored ${branches.length} approaches`, {
    branches,
    selectedBranch,
    reason,
  });
}

/**
 * Emit a test result artifact.
 */
export function emitTestResultArtifact(
  writer: any,
  testFiles: Array<{ path: string; testCount: number; coverageEstimate: number }>,
): void {
  const total = testFiles.reduce((sum, f) => sum + f.testCount, 0);
  emitArtifact(writer, "test_result", `${total} tests generated`, {
    testsGenerated: total,
    testFiles,
  });
}

/**
 * Emit a brain update artifact.
 */
export function emitBrainUpdateArtifact(
  writer: any,
  entries: Array<{ category: string; content: string; confidence: number }>,
): void {
  emitArtifact(writer, "brain_update", `${entries.length} patterns learned`, {
    entriesAdded: entries.length,
    entries,
  });
}

/**
 * Emit a screenshot/visual verification artifact.
 */
export function emitScreenshotArtifact(
  writer: any,
  passed: boolean,
  issues: string[],
  suggestions: string[],
): void {
  emitArtifact(writer, "screenshot", passed ? "Visual Check Passed" : "Visual Issues Found", {
    passed,
    issues,
    suggestions,
  });
}

/**
 * Emit a proposal artifact with 3 implementation options.
 */
export function emitProposalArtifact(
  writer: any,
  options: Array<{ id: number; title: string; description: string; complexity: string; estimatedFiles: number; pros: string[]; cons: string[] }>,
  recommendation: number,
  recommendationReason: string,
  researchSummary: string,
): void {
  emitArtifact(writer, "proposal", "Choose your approach", {
    options,
    recommendation,
    recommendationReason,
    researchSummary,
  });
}

/**
 * Reset artifact counter (call at start of each request).
 */
export function resetArtifactCounter(): void {
  artifactCounter = 0;
}
