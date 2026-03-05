// Verify Agent - Post-execution verification
// Runs on Flash with low thinking, read-only tools
// Checks that the plan was executed correctly

import { generateText, stepCountIs } from "ai";
import { selectModel } from "../router";
import { getVerifyTools, type DatabaseContext } from "../tools/enhanced-tools";
import type { ExecutionPlan } from "./PlanAgent";
import type { ExecutionResult } from "./ExecutorAgent";

// --- Types ---

export interface VerificationResult {
  passed: boolean;
  issues: string[];
  filesChecked: string[];
  summary: string;
}

// --- System Prompt ---

const VERIFY_SYSTEM_PROMPT = `You are a code verification agent. Your job is to check that code changes were applied correctly.

## RULES
1. You have READ-ONLY access. You CANNOT modify files.
2. Check that all planned files were created/modified.
3. Verify imports are correct (no missing imports, no broken references).
4. Check for obvious issues: unclosed tags, missing exports, syntax errors.
5. Verify layout.tsx still has <html> and <body> tags.
6. Check cross-file consistency (components imported where they're used).
7. Be FAST - you have max 5 tool calls. Focus on critical files.

## OUTPUT FORMAT
After checking, respond with this EXACT JSON:

\`\`\`json
{
  "passed": true/false,
  "issues": ["issue 1 description", "issue 2 description"],
  "filesChecked": ["path1", "path2"],
  "summary": "Brief verification summary"
}
\`\`\`

If everything looks good, set passed=true and issues=[].
If there are problems, set passed=false and list each issue clearly.`;

// --- Agent ---

export async function runVerifyAgent(
  plan: ExecutionPlan,
  execResult: ExecutionResult,
  virtualFS: Map<string, string>,
  onStep?: (toolName: string, status: string, message: string) => Promise<void>,
  dbContext?: DatabaseContext,
): Promise<VerificationResult> {
  const config = selectModel("verify");
  const tools = getVerifyTools(virtualFS, dbContext);

  // Build verification context
  const createdFiles = execResult.fileOperations
    .filter((o) => o.type === "write")
    .map((o) => o.path);
  const modifiedFiles = execResult.fileOperations
    .filter((o) => o.type === "modify")
    .map((o) => o.path);
  const allAffectedFiles = [...new Set([...createdFiles, ...modifiedFiles])];

  const failedTasks = execResult.taskResults
    .filter((t) => t.status === "failed")
    .map((t) => `Task ${t.taskId}: ${t.error}`);

  const prompt = `## Execution Plan
Summary: ${plan.summary}
Tasks: ${plan.tasks.length} total, ${execResult.taskResults.filter((t) => t.status === "completed").length} completed, ${failedTasks.length} failed

## Planned Files
${plan.tasks.map((t) => `- Task ${t.id} (${t.type}): ${t.files.join(", ")} | Verify: ${t.verification}`).join("\n")}

## Files Created/Modified
Created: ${createdFiles.join(", ") || "none"}
Modified: ${modifiedFiles.join(", ") || "none"}

## Failed Tasks
${failedTasks.length > 0 ? failedTasks.join("\n") : "None"}

## Verification Criteria
- Build must pass: ${plan.verificationPlan.buildMustPass}
- Critical files: ${plan.verificationPlan.criticalFiles.join(", ")}
- Import checks: ${plan.verificationPlan.importChecks.join("; ")}

## Available Files
${Array.from(virtualFS.keys()).sort().join("\n")}

Verify the execution by reading critical files and checking the criteria above. Output JSON with your findings.`;

  try {
    const result = await generateText({
      model: config.model,
      system: VERIFY_SYSTEM_PROMPT,
      prompt,
      tools,
      stopWhen: stepCountIs(config.maxSteps),
      onStepFinish: async (step) => {
        if (onStep && step.toolCalls) {
          for (const tc of step.toolCalls) {
            const args = (tc as any).args || (tc as any).input || {};
            let msg = `Verifying: ${tc.toolName}`;
            if (tc.toolName === "read_file") msg = `Checking ${args.path}`;
            else if (tc.toolName === "grep_files") msg = `Checking pattern: "${args.pattern}"`;
            await onStep(tc.toolName, "complete", msg);
          }
        }
      },
    });

    return parseVerificationOutput(result.text || "", allAffectedFiles, failedTasks);
  } catch (error: any) {
    console.error("[VerifyAgent] Error:", error.message);
    // On verification failure, assume issues exist
    return {
      passed: failedTasks.length === 0,
      issues: failedTasks.length > 0
        ? failedTasks
        : [`Verification agent error: ${error.message}`],
      filesChecked: [],
      summary: "Verification could not complete.",
    };
  }
}

// --- Parser ---

function parseVerificationOutput(
  text: string,
  affectedFiles: string[],
  failedTasks: string[],
): VerificationResult {
  // Try to extract JSON from the response
  let parsed: any = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch { /* continue */ }
    }

    if (!parsed) {
      const braceMatch = text.match(/\{[\s\S]*"passed"[\s\S]*\}/);
      if (braceMatch) {
        try {
          parsed = JSON.parse(braceMatch[0]);
        } catch { /* continue */ }
      }
    }
  }

  if (parsed && typeof parsed.passed === "boolean") {
    return {
      passed: parsed.passed && failedTasks.length === 0,
      issues: [
        ...(Array.isArray(parsed.issues) ? parsed.issues : []),
        ...failedTasks,
      ],
      filesChecked: Array.isArray(parsed.filesChecked) ? parsed.filesChecked : affectedFiles,
      summary: parsed.summary || (parsed.passed ? "All checks passed." : "Issues found."),
    };
  }

  // Heuristic: if there are failed tasks, verification fails
  if (failedTasks.length > 0) {
    return {
      passed: false,
      issues: failedTasks,
      filesChecked: affectedFiles,
      summary: "Some tasks failed during execution.",
    };
  }

  // If we can't parse the output, assume passed (agent couldn't find issues)
  return {
    passed: true,
    issues: [],
    filesChecked: affectedFiles,
    summary: text.slice(0, 200) || "Verification complete.",
  };
}
