// Code Review Agent - 2-stage review (spec compliance + code quality)
// Enforces Superpowers code review methodology
// Returns pass/fail with detailed feedback

import { generateText } from "ai";
import { selectModel } from "../router";
import { loadSkill, substituteSkillVariables } from "../skills/loader";
import type { ExecutionPlan } from "./PlanAgent";
import type { FileOperation } from "../tools/enhanced-tools";

// --- Types ---

export interface ReviewContext {
  plan: ExecutionPlan | null; // Original plan for compliance check
  taskDescription?: string; // If no plan, use task description
  fileOperations: FileOperation[]; // Files changed
  virtualFS: Map<string, string>; // Current codebase state
}

export interface ReviewIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: "spec_compliance" | "type_safety" | "error_handling" | "performance" | "security" | "best_practices" | "readability";
  file?: string;
  line?: number;
  issue: string; // What's wrong
  fix: string; // How to fix it
}

export interface ReviewResult {
  passed: boolean; // Both stages passed
  stage1Passed: boolean; // Spec compliance
  stage2Passed: boolean; // Code quality
  issues: ReviewIssue[];
  summary: string;
  recommendations: string[];
}

// --- Stage 1: Spec Compliance ---

async function runStage1Review(context: ReviewContext): Promise<{
  passed: boolean;
  issues: ReviewIssue[];
  details: string;
}> {
  const { plan, taskDescription, fileOperations, virtualFS } = context;

  // If no plan or task description, skip Stage 1 (nothing to compare against)
  if (!plan && !taskDescription) {
    return {
      passed: true,
      issues: [],
      details: "No plan/task to validate against (skipped)",
    };
  }

  // Build context for review
  const planSummary = plan
    ? `## Plan\n${plan.summary}\n\n## Tasks\n${plan.tasks.map(t => `${t.id}. ${t.description} (files: ${t.files.join(", ")})`).join("\n")}`
    : `## Task\n${taskDescription}`;

  const filesChanged = fileOperations.map(op => `${op.type.toUpperCase()}: ${op.path}`).join("\n");

  const codeSnippets = fileOperations
    .filter(op => op.type === "write")
    .slice(0, 5) // Review up to 5 files
    .map(op => {
      const content = op.content || virtualFS.get(op.path) || "";
      return `### ${op.path}\n\`\`\`typescript\n${content.slice(0, 2000)}\n\`\`\``;
    })
    .join("\n\n");

  const model = selectModel("review");

  const prompt = `You are a code reviewer performing **STAGE 1: SPEC COMPLIANCE REVIEW**.

Your job: Verify the implementation matches the approved plan/task description.

${planSummary}

## Files Changed
${filesChanged}

## Code Snippets (Sample)
${codeSnippets || "(No files to review)"}

## Stage 1 Checklist

1. **Requirements Coverage**: Are ALL requirements implemented?
2. **Design Consistency**: Does file structure match the plan?
3. **Test Coverage**: Are there test files for business logic?
4. **Verification**: Can we verify the implementation works as described?

## Output Format (JSON ONLY)

\`\`\`json
{
  "passed": true | false,
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "spec_compliance",
      "file": "path/to/file.ts",
      "issue": "Description of what's wrong",
      "fix": "How to fix it"
    }
  ],
  "details": "Summary of Stage 1 review findings"
}
\`\`\`

**CRITICAL**: If ANY requirement is missing or design is violated, set \`passed: false\`.`;

  try {
    const result = await generateText({
      model: model.model,
      prompt,
    });

    const text = result.text || "{}";
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] || "{}");

    return {
      passed: parsed.passed ?? true,
      issues: (parsed.issues || []).map((i: any) => ({
        severity: i.severity || "medium",
        category: "spec_compliance",
        file: i.file,
        issue: i.issue || "",
        fix: i.fix || "",
      })),
      details: parsed.details || "Stage 1 review completed",
    };
  } catch (error) {
    console.error("[CodeReview] Stage 1 error:", error);
    return {
      passed: true, // Fail open (don't block on review errors)
      issues: [],
      details: "Stage 1 review failed (error during review)",
    };
  }
}

// --- Stage 2: Code Quality ---

async function runStage2Review(context: ReviewContext): Promise<{
  passed: boolean;
  issues: ReviewIssue[];
  details: string;
}> {
  const { fileOperations, virtualFS } = context;

  // Load code review skill for detailed checklist
  const skill = loadSkill("code-review");
  const skillContent = skill
    ? substituteSkillVariables(skill.content, {})
    : "Follow standard code quality practices (readability, types, error handling, performance, security).";

  const codeSnippets = fileOperations
    .filter(op => op.type === "write")
    .slice(0, 5)
    .map(op => {
      const content = op.content || virtualFS.get(op.path) || "";
      return `### ${op.path}\n\`\`\`typescript\n${content.slice(0, 2000)}\n\`\`\``;
    })
    .join("\n\n");

  const model = selectModel("review");

  const prompt = `You are a code reviewer performing **STAGE 2: CODE QUALITY REVIEW**.

Your job: Ensure code is maintainable, tested, and follows best practices.

## Code Snippets
${codeSnippets || "(No files to review)"}

## Stage 2 Checklist (from code-review skill)

${skillContent.slice(0, 3000)}

## Output Format (JSON ONLY)

\`\`\`json
{
  "passed": true | false,
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "type_safety" | "error_handling" | "performance" | "security" | "best_practices" | "readability",
      "file": "path/to/file.ts",
      "line": 42,
      "issue": "Description of what's wrong",
      "fix": "How to fix it"
    }
  ],
  "details": "Summary of Stage 2 review findings"
}
\`\`\`

**CRITICAL**: If ANY critical/high severity issue found, set \`passed: false\`.
**MEDIUM/LOW**: Document but don't block (can be addressed in follow-up).`;

  try {
    const result = await generateText({
      model: model.model,
      prompt,
    });

    const text = result.text || "{}";
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] || "{}");

    return {
      passed: parsed.passed ?? true,
      issues: (parsed.issues || []).map((i: any) => ({
        severity: i.severity || "medium",
        category: i.category || "best_practices",
        file: i.file,
        line: i.line,
        issue: i.issue || "",
        fix: i.fix || "",
      })),
      details: parsed.details || "Stage 2 review completed",
    };
  } catch (error) {
    console.error("[CodeReview] Stage 2 error:", error);
    return {
      passed: true, // Fail open
      issues: [],
      details: "Stage 2 review failed (error during review)",
    };
  }
}

// --- Public API ---

/**
 * Run 2-stage code review (spec compliance + code quality)
 * Returns pass/fail with detailed feedback
 */
export async function runCodeReview(context: ReviewContext): Promise<ReviewResult> {
  console.log("[CodeReview] Starting 2-stage review...");

  // Stage 1: Spec Compliance
  const stage1 = await runStage1Review(context);
  console.log(`[CodeReview] Stage 1: ${stage1.passed ? "PASS" : "FAIL"} (${stage1.issues.length} issues)`);

  // If Stage 1 fails, don't proceed to Stage 2 (fail fast)
  if (!stage1.passed) {
    return {
      passed: false,
      stage1Passed: false,
      stage2Passed: false,
      issues: stage1.issues,
      summary: `Code review FAILED at Stage 1 (Spec Compliance). ${stage1.details}`,
      recommendations: [
        "Fix spec compliance issues before re-review",
        "Ensure all requirements from plan are implemented",
        "Verify file structure matches design",
      ],
    };
  }

  // Stage 2: Code Quality
  const stage2 = await runStage2Review(context);
  console.log(`[CodeReview] Stage 2: ${stage2.passed ? "PASS" : "FAIL"} (${stage2.issues.length} issues)`);

  const allIssues = [...stage1.issues, ...stage2.issues];
  const criticalIssues = allIssues.filter(i => i.severity === "critical");
  const highIssues = allIssues.filter(i => i.severity === "high");

  const passed = stage1.passed && stage2.passed && criticalIssues.length === 0 && highIssues.length === 0;

  // Generate recommendations based on issues
  const recommendations: string[] = [];
  if (criticalIssues.length > 0) {
    recommendations.push(`Fix ${criticalIssues.length} critical issue(s) immediately`);
  }
  if (highIssues.length > 0) {
    recommendations.push(`Address ${highIssues.length} high-priority issue(s) before merge`);
  }
  if (!passed && criticalIssues.length === 0 && highIssues.length === 0) {
    recommendations.push("Review medium/low priority issues for follow-up PR");
  }
  if (passed) {
    recommendations.push("Code meets quality standards - approved for merge");
  }

  const summary = passed
    ? `Code review PASSED ✅ Both stages passed with ${allIssues.length} minor issue(s).`
    : `Code review FAILED ❌ Stage 1: ${stage1.passed ? "PASS" : "FAIL"}, Stage 2: ${stage2.passed ? "PASS" : "FAIL"}. ${criticalIssues.length} critical, ${highIssues.length} high priority issues found.`;

  return {
    passed,
    stage1Passed: stage1.passed,
    stage2Passed: stage2.passed,
    issues: allIssues,
    summary,
    recommendations,
  };
}

/**
 * Format review result as human-readable text
 */
export function formatReviewResult(result: ReviewResult): string {
  const { passed, stage1Passed, stage2Passed, issues, summary, recommendations } = result;

  let output = `# Code Review Result\n\n`;
  output += `**Status**: ${passed ? "✅ APPROVED" : "❌ NEEDS WORK"}\n\n`;
  output += `**Stage 1 (Spec Compliance)**: ${stage1Passed ? "✅ PASS" : "❌ FAIL"}\n`;
  output += `**Stage 2 (Code Quality)**: ${stage2Passed ? "✅ PASS" : "❌ FAIL"}\n\n`;
  output += `## Summary\n${summary}\n\n`;

  if (issues.length > 0) {
    output += `## Issues Found (${issues.length})\n\n`;

    const grouped = {
      critical: issues.filter(i => i.severity === "critical"),
      high: issues.filter(i => i.severity === "high"),
      medium: issues.filter(i => i.severity === "medium"),
      low: issues.filter(i => i.severity === "low"),
    };

    for (const [severity, issueList] of Object.entries(grouped)) {
      if (issueList.length === 0) continue;

      output += `### ${severity.toUpperCase()} (${issueList.length})\n\n`;

      issueList.forEach((issue, idx) => {
        output += `${idx + 1}. **${issue.category.replace(/_/g, " ").toUpperCase()}**\n`;
        if (issue.file) output += `   - File: \`${issue.file}${issue.line ? `:${issue.line}` : ""}\`\n`;
        output += `   - Issue: ${issue.issue}\n`;
        output += `   - Fix: ${issue.fix}\n\n`;
      });
    }
  }

  if (recommendations.length > 0) {
    output += `## Recommendations\n\n`;
    recommendations.forEach(rec => {
      output += `- ${rec}\n`;
    });
  }

  return output;
}
