// Build Validator & Fixer Agent — Self-healing build loop
// After execution, validates code by checking for common errors,
// classifies them, and generates targeted fixes. Loops up to 3 times.

import { generateText, stepCountIs } from "ai";
import { selectModel } from "../router";
import { createEnhancedTools, type FileOperation } from "../tools/enhanced-tools";
import { classifyErrors, type ClassifiedError } from "./ErrorClassifier";

// --- Types ---

export interface BuildValidationResult {
  passed: boolean;
  errors: ClassifiedError[];
  fixesApplied: number;
  iterations: number;
  fileOperations: FileOperation[];
}

// --- System Prompt ---

const FIXER_SYSTEM_PROMPT = `You are an expert code fixer. You receive specific build/syntax errors and must fix them precisely.

## RULES
1. Fix ONLY the errors listed. Do not refactor or improve other code.
2. Read the file first to understand the full context before editing.
3. For import errors: grep for the correct export, then fix the import path.
4. For type errors: read the type definition, then align the usage.
5. For syntax errors: read the exact line and surrounding context, then fix.
6. For missing files: check if the file was renamed, or create it if truly missing.
7. After fixing, read the file again to verify your fix is correct.

## RESPONSE
After fixing, respond with a brief summary of what was fixed.`;

// --- Main Build Validation Loop ---

export async function runBuildValidationLoop(
  virtualFS: Map<string, string>,
  fileOperations: FileOperation[],
  emitStep: (stepNum: number, toolName: string, status: string, message: string, details?: any) => Promise<void>,
  stepBase: number,
  maxIterations: number = 3,
): Promise<BuildValidationResult> {
  let iteration = 0;
  let allFixOps: FileOperation[] = [];
  let currentErrors: ClassifiedError[] = [];
  let stepCounter = stepBase;

  while (iteration < maxIterations) {
    iteration++;

    await emitStep(stepCounter++, "build_check", "running", `Build check (attempt ${iteration}/${maxIterations})...`);

    // Validate the current state of virtualFS
    currentErrors = validateBuild(virtualFS);

    if (currentErrors.length === 0) {
      await emitStep(stepCounter++, "build_check", "complete", "Build validation passed");
      return {
        passed: true,
        errors: [],
        fixesApplied: allFixOps.length,
        iterations: iteration,
        fileOperations: allFixOps,
      };
    }

    await emitStep(
      stepCounter++, "build_check", "error",
      `Found ${currentErrors.length} issues, attempting auto-fix...`,
      { content: currentErrors.map(e => `${e.type}: ${e.message}`).join("\n") },
    );

    // Don't try to fix on the last iteration, just report
    if (iteration >= maxIterations) break;

    // Attempt to fix errors using the Fixer Agent
    const fixResult = await runFixerAgent(virtualFS, currentErrors, emitStep, stepCounter);
    stepCounter = fixResult.nextStep;
    allFixOps.push(...fixResult.fileOperations);

    if (fixResult.fileOperations.length === 0) {
      // Fixer couldn't make any changes, no point continuing
      await emitStep(stepCounter++, "build_fix", "error", "Could not auto-fix remaining issues");
      break;
    }

    await emitStep(stepCounter++, "build_fix", "complete", `Applied ${fixResult.fileOperations.length} fixes`);
  }

  return {
    passed: currentErrors.length === 0,
    errors: currentErrors,
    fixesApplied: allFixOps.length,
    iterations: iteration,
    fileOperations: allFixOps,
  };
}

// --- Static Build Validation (No LLM needed) ---

export function validateBuild(virtualFS: Map<string, string>): ClassifiedError[] {
  const errors: ClassifiedError[] = [];

  for (const [path, content] of virtualFS.entries()) {
    if (shouldSkipValidation(path)) continue;

    // Check for broken imports
    const importErrors = validateImports(path, content, virtualFS);
    errors.push(...importErrors);

    // Check for syntax issues
    const syntaxErrors = validateSyntax(path, content);
    errors.push(...syntaxErrors);

    // Check React-specific issues
    if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
      const reactErrors = validateReact(path, content);
      errors.push(...reactErrors);
    }

    // Check layout.tsx integrity
    if (path.includes("layout.tsx") || path.includes("layout.ts")) {
      const layoutErrors = validateLayout(path, content);
      errors.push(...layoutErrors);
    }
  }

  return errors;
}

// --- Import Validation ---

function validateImports(path: string, content: string, virtualFS: Map<string, string>): ClassifiedError[] {
  const errors: ClassifiedError[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match import statements
    const importMatch = line.match(/import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*]+)(?:\s*,\s*(?:\{[^}]*\}|[\w*]+))*\s+from\s+)?["']([^"']+)["']/);
    if (!importMatch) continue;

    const importPath = importMatch[1];

    // Skip external packages
    if (!importPath.startsWith(".") && !importPath.startsWith("@/") && !importPath.startsWith("~/")) continue;

    // Try to resolve the import
    const resolved = resolveImportPath(importPath, path, virtualFS);
    if (!resolved) {
      // Extract what's being imported for better error messages
      const namesMatch = line.match(/import\s+(?:type\s+)?(\{[^}]+\}|\w+)/);
      const importedNames = namesMatch ? namesMatch[1] : "unknown";

      errors.push({
        type: "missing_import",
        file: path,
        line: i + 1,
        message: `Import "${importPath}" not found (importing ${importedNames})`,
        fixStrategy: `Find the correct path for "${importPath}" using grep, then fix the import in ${path} line ${i + 1}`,
        severity: "error",
      });
    }
  }

  return errors;
}

function resolveImportPath(importPath: string, fromFile: string, virtualFS: Map<string, string>): string | null {
  let resolved = importPath;

  if (importPath.startsWith("@/")) {
    resolved = "src/" + importPath.slice(2);
  } else if (importPath.startsWith("~/")) {
    resolved = importPath.slice(2);
  } else if (importPath.startsWith(".")) {
    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    const parts = importPath.split("/");
    const dirParts = fromDir.split("/").filter(Boolean);
    for (const part of parts) {
      if (part === "..") dirParts.pop();
      else if (part !== ".") dirParts.push(part);
    }
    resolved = dirParts.join("/");
  }

  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
  for (const ext of extensions) {
    if (virtualFS.has(resolved + ext)) return resolved + ext;
  }
  return null;
}

// --- Syntax Validation ---

function validateSyntax(path: string, content: string): ClassifiedError[] {
  const errors: ClassifiedError[] = [];

  if (!path.endsWith(".ts") && !path.endsWith(".tsx") && !path.endsWith(".js") && !path.endsWith(".jsx")) {
    return errors;
  }

  // Check for unbalanced braces/brackets/parens
  const braceBalance = countBalance(content, "{", "}");
  if (braceBalance !== 0) {
    errors.push({
      type: "syntax_error",
      file: path,
      line: findUnbalancedLine(content, "{", "}"),
      message: `Unbalanced braces: ${braceBalance > 0 ? `${braceBalance} unclosed {` : `${-braceBalance} extra }`}`,
      fixStrategy: `Read ${path} and find the unbalanced brace. Check around the reported line.`,
      severity: "error",
    });
  }

  const parenBalance = countBalance(content, "(", ")");
  if (parenBalance !== 0) {
    errors.push({
      type: "syntax_error",
      file: path,
      line: findUnbalancedLine(content, "(", ")"),
      message: `Unbalanced parentheses: ${parenBalance > 0 ? `${parenBalance} unclosed (` : `${-parenBalance} extra )`}`,
      fixStrategy: `Read ${path} and find the unbalanced parenthesis.`,
      severity: "error",
    });
  }

  // Check for incomplete statements (very basic)
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Empty export/import without source
    if (line === "import" || line === "export" || line === "from") {
      errors.push({
        type: "syntax_error",
        file: path,
        line: i + 1,
        message: `Incomplete statement: "${line}"`,
        fixStrategy: `Read ${path} line ${i + 1} and fix the incomplete import/export statement.`,
        severity: "error",
      });
    }
  }

  return errors;
}

function countBalance(content: string, open: string, close: string): number {
  // Rough balance check - skip strings and comments
  let balance = 0;
  let inString = false;
  let stringChar = "";
  let inComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inBlockComment) {
      if (char === "*" && next === "/") { inBlockComment = false; i++; }
      continue;
    }
    if (inComment) {
      if (char === "\n") inComment = false;
      continue;
    }
    if (inString) {
      if (char === "\\" ) { i++; continue; }
      if (char === stringChar) inString = false;
      continue;
    }

    if (char === "/" && next === "/") { inComment = true; continue; }
    if (char === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (char === '"' || char === "'" || char === "`") { inString = true; stringChar = char; continue; }

    if (char === open) balance++;
    if (char === close) balance--;
  }

  return balance;
}

function findUnbalancedLine(content: string, open: string, close: string): number {
  const lines = content.split("\n");
  let balance = 0;
  let lastImbalanceLine = 1;

  for (let i = 0; i < lines.length; i++) {
    for (const char of lines[i]) {
      if (char === open) balance++;
      if (char === close) balance--;
    }
    if (balance !== 0) lastImbalanceLine = i + 1;
  }

  return lastImbalanceLine;
}

// --- React Validation ---

function validateReact(path: string, content: string): ClassifiedError[] {
  const errors: ClassifiedError[] = [];

  // Check for GSAP without window guard in client components
  const hasGsap = content.includes("gsap") || content.includes("ScrollTrigger");
  const hasWindowGuard = content.includes("typeof window") || content.includes("useLayoutEffect") || content.includes("useEffect");
  const isClientComponent = content.includes('"use client"') || content.includes("'use client'");

  if (hasGsap && isClientComponent && !hasWindowGuard) {
    errors.push({
      type: "runtime_error",
      file: path,
      line: 1,
      message: "GSAP used without window guard — will crash during SSR",
      fixStrategy: `Add typeof window !== "undefined" guard around GSAP code, or wrap in useEffect/useLayoutEffect in ${path}`,
      severity: "warning",
    });
  }

  // Check for missing "use client" with client-side hooks
  const hasClientHooks = /\b(useState|useEffect|useLayoutEffect|useRef|useCallback|useMemo|useContext|useReducer)\b/.test(content);
  if (hasClientHooks && !isClientComponent) {
    errors.push({
      type: "missing_directive",
      file: path,
      line: 1,
      message: 'Uses React hooks but missing "use client" directive',
      fixStrategy: `Add "use client" as the first line of ${path}`,
      severity: "error",
    });
  }

  return errors;
}

// --- Layout Validation ---

function validateLayout(path: string, content: string): ClassifiedError[] {
  const errors: ClassifiedError[] = [];

  if (!content.includes("<html")) {
    errors.push({
      type: "layout_error",
      file: path,
      line: 1,
      message: "layout.tsx missing <html> tag",
      fixStrategy: `Read ${path} and ensure it has proper <html> and <body> wrapper tags`,
      severity: "error",
    });
  }

  if (!content.includes("<body")) {
    errors.push({
      type: "layout_error",
      file: path,
      line: 1,
      message: "layout.tsx missing <body> tag",
      fixStrategy: `Read ${path} and ensure it has a <body> tag wrapping the children`,
      severity: "error",
    });
  }

  return errors;
}

// --- Fixer Agent ---

async function runFixerAgent(
  virtualFS: Map<string, string>,
  errors: ClassifiedError[],
  emitStep: (stepNum: number, toolName: string, status: string, message: string, details?: any) => Promise<void>,
  stepBase: number,
): Promise<{ fileOperations: FileOperation[]; nextStep: number }> {
  const config = selectModel("execute", "moderate");
  const tools = createEnhancedTools(virtualFS);
  const fileOperations: FileOperation[] = [];
  let stepCounter = stepBase;

  // Group errors by file for efficiency
  const errorsByFile = new Map<string, ClassifiedError[]>();
  for (const error of errors) {
    const existing = errorsByFile.get(error.file) || [];
    existing.push(error);
    errorsByFile.set(error.file, existing);
  }

  // Build a targeted fix prompt
  const errorList = errors
    .filter(e => e.severity === "error")
    .slice(0, 10) // Limit to prevent prompt bloat
    .map((e, i) => `${i + 1}. [${e.type}] ${e.file}:${e.line} — ${e.message}\n   Fix: ${e.fixStrategy}`)
    .join("\n\n");

  if (!errorList) {
    return { fileOperations, nextStep: stepCounter };
  }

  const prompt = `## Errors to Fix\n${errorList}\n\n## Available Files\n${Array.from(virtualFS.keys()).sort().join("\n")}\n\nFix each error using the strategy provided. Read files first, then apply targeted edits.`;

  try {
    await generateText({
      model: config.model,
      system: FIXER_SYSTEM_PROMPT,
      prompt,
      tools,
      stopWhen: stepCountIs(Math.min(errors.length * 3, 12)),
      onStepFinish: async (step) => {
        const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
        for (const tc of toolCalls) {
          const args = (tc as any).args || (tc as any).input || {};
          stepCounter++;

          if (tc.toolName === "write_file" && typeof args.path === "string") {
            const normalizedPath = (args.path || "").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
            const op: FileOperation = { type: "write", path: normalizedPath, content: args.content || "" };
            fileOperations.push(op);
            await emitStep(stepCounter, "fix_write", "complete", `Fixing ${normalizedPath}`);
          } else if ((tc.toolName === "edit_file" || tc.toolName === "modify_file") && typeof args.path === "string") {
            const normalizedPath = (args.path || "").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
            const fullContent = virtualFS.get(normalizedPath) || "";
            const op: FileOperation = { type: "write", path: normalizedPath, content: fullContent };
            fileOperations.push(op);
            await emitStep(stepCounter, "fix_edit", "complete", `Fixing ${normalizedPath}`);
          } else if (tc.toolName === "read_file") {
            await emitStep(stepCounter, "fix_read", "complete", `Reading ${args.path || ""}`);
          } else if (tc.toolName === "grep_files") {
            await emitStep(stepCounter, "fix_search", "complete", `Searching for fix: "${(args.pattern || "").slice(0, 40)}"`);
          }
        }
      },
    });
  } catch (error: any) {
    console.error("[FixerAgent] Error:", error.message);
  }

  return { fileOperations, nextStep: stepCounter };
}

// --- Helpers ---

function shouldSkipValidation(path: string): boolean {
  return (
    path.includes("node_modules") ||
    path.endsWith(".json") ||
    path.endsWith(".css") ||
    path.endsWith(".md") ||
    path.endsWith(".svg") ||
    path.endsWith(".ico") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg")
  );
}
