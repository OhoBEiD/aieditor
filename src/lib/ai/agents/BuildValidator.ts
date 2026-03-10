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

const FIXER_SYSTEM_PROMPT = `You are an expert code fixer for Next.js/React projects. You receive specific build/syntax errors and must fix them precisely.

## RULES
1. Fix ONLY the errors listed. Do not refactor or improve other code.
2. File contents are provided with each error — use them to understand context immediately.
3. For import errors (missing_import): use grep_files to search for the correct export name across the codebase, then use edit_file to fix the import path. Common patterns:
   - "@/components/ui" might export from "@/components/ui/index.ts" or individual files
   - A component might have been created in a different path than expected
   - Try searching for "export.*ComponentName" to find where it's actually exported
4. For type errors: read the type definition, then align the usage.
5. For syntax errors: fix the exact issue at the reported line.
6. For "use client" missing: add "use client" as the very first line of the file using edit_file.
7. For missing files: check if the file was renamed, or create it with write_file if truly missing.
8. For "Unsupported Server Component type: undefined" or undefined exports:
   - This means a component's default export is undefined at runtime.
   - Read the file and check if it has a valid "export default function ComponentName() { return (...) }".
   - Check if the component name in "export default X;" matches an actual function/const defined in the file.
   - If the component is imported then re-exported, verify the source file actually exports it.
   - Fix by ensuring every component file has a properly defined and exported React component.
9. For missing default exports in page.tsx/layout.tsx:
   - Next.js requires these files to have a default export.
   - Add "export default function Page() { return (...) }" or add "export default" before the component.

IMPORTANT: You MUST use write_file or edit_file tools to apply fixes. Do NOT just describe fixes in text — actually apply them using the tools. Fix EVERY error listed, not just some of them. Read files first to understand the full context before making changes.

## RESPONSE
After fixing all errors with tools, respond with a brief summary of what was fixed.`;

// --- Main Build Validation Loop ---

export async function runBuildValidationLoop(
  virtualFS: Map<string, string>,
  fileOperations: FileOperation[],
  emitStep: (stepNum: number, toolName: string, status: string, message: string, details?: any) => Promise<void>,
  stepBase: number,
  maxIterations: number = 3,
): Promise<BuildValidationResult> {
  let allFixOps: FileOperation[] = [];
  let currentErrors: ClassifiedError[] = [];
  let stepCounter = stepBase;
  const maxFixAttempts = Math.max(1, maxIterations - 1);

  // Initial validation
  await emitStep(stepCounter++, "build_check", "running", "Running build validation...");
  currentErrors = validateBuild(virtualFS);

  if (currentErrors.length === 0) {
    await emitStep(stepCounter++, "build_check", "complete", "Build validation passed");
    return {
      passed: true,
      errors: [],
      fixesApplied: 0,
      iterations: 1,
      fileOperations: [],
    };
  }

  await emitStep(
    stepCounter++, "build_check", "error",
    `Found ${currentErrors.length} issues, attempting auto-fix...`,
    { content: currentErrors.map(e => `${e.type}: ${e.message}`).join("\n") },
  );

  // Fix loop: attempt fixes, then re-validate
  for (let fixAttempt = 0; fixAttempt < maxFixAttempts; fixAttempt++) {
    // Attempt to fix errors using the Fixer Agent
    const fixResult = await runFixerAgent(virtualFS, currentErrors, emitStep, stepCounter);
    stepCounter = fixResult.nextStep;
    allFixOps.push(...fixResult.fileOperations);

    if (fixResult.fileOperations.length === 0) {
      // Fixer couldn't make any changes — retry once with explicit prompt
      if (!fixResult.retried) {
        await emitStep(stepCounter++, "build_fix", "running", "Retrying fix with explicit instructions...");
        const retryResult = await runFixerAgent(virtualFS, currentErrors, emitStep, stepCounter, true);
        stepCounter = retryResult.nextStep;
        allFixOps.push(...retryResult.fileOperations);

        if (retryResult.fileOperations.length === 0) {
          await emitStep(stepCounter++, "build_fix", "error", "Could not auto-fix remaining issues");
          break;
        }
        await emitStep(stepCounter++, "build_fix", "complete", `Applied ${retryResult.fileOperations.length} fixes (retry)`);
      } else {
        await emitStep(stepCounter++, "build_fix", "error", "Could not auto-fix remaining issues");
        break;
      }
    } else {
      await emitStep(stepCounter++, "build_fix", "complete", `Applied ${fixResult.fileOperations.length} fixes`);
    }

    // Re-validate after fixes
    await emitStep(stepCounter++, "build_check", "running", `Re-validating (attempt ${fixAttempt + 2}/${maxIterations})...`);
    currentErrors = validateBuild(virtualFS);

    if (currentErrors.length === 0) {
      await emitStep(stepCounter++, "build_check", "complete", "Build validation passed after auto-fix");
      return {
        passed: true,
        errors: [],
        fixesApplied: allFixOps.length,
        iterations: fixAttempt + 2,
        fileOperations: allFixOps,
      };
    }

    await emitStep(
      stepCounter++, "build_check", "error",
      `${currentErrors.length} issues remaining${fixAttempt < maxFixAttempts - 1 ? ", retrying..." : ""}`,
      { content: currentErrors.map(e => `${e.type}: ${e.message}`).join("\n") },
    );
  }

  return {
    passed: currentErrors.length === 0,
    errors: currentErrors,
    fixesApplied: allFixOps.length,
    iterations: maxIterations,
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

    // Check exports in page/component files
    if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
      const exportErrors = validateExports(path, content);
      errors.push(...exportErrors);
    }
  }

  // Cross-file: check component integrity (imports resolve to valid exports)
  const integrityErrors = validateComponentIntegrity(virtualFS);
  errors.push(...integrityErrors);

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

  // Check for animation libraries without window guard in client components
  const hasGsap = content.includes("gsap") || content.includes("ScrollTrigger");
  const hasLenis = content.includes("lenis") || content.includes("ReactLenis") || content.includes("useLenis");
  const hasAnime = content.includes("animejs") || /\bimport\s+anime\s+from\b/.test(content);
  const hasSSRUnsafeLib = hasGsap || hasLenis || hasAnime;
  const hasWindowGuard = content.includes("typeof window") || content.includes("useLayoutEffect") || content.includes("useEffect");
  const isClientComponent = content.includes('"use client"') || content.includes("'use client'");

  if (hasSSRUnsafeLib && isClientComponent && !hasWindowGuard) {
    const libName = hasGsap ? "GSAP" : hasLenis ? "Lenis" : "Anime.js";
    errors.push({
      type: "runtime_error",
      file: path,
      line: 1,
      message: `${libName} used without window guard — will crash during SSR`,
      fixStrategy: `Add typeof window !== "undefined" guard around ${libName} code, or wrap in useEffect/useLayoutEffect in ${path}`,
      severity: "warning",
    });
  }

  // Check for missing "use client" with client-side hooks or animation libraries
  const hasClientHooks = /\b(useState|useEffect|useLayoutEffect|useRef|useCallback|useMemo|useContext|useReducer)\b/.test(content);
  const hasAnimationHooks = /\b(useSpring|useTransition|useTrail|useScroll|useTransform|useFrame|useLenis)\b/.test(content);
  const hasMotionComponents = content.includes("motion.") || content.includes("<motion") || content.includes("AnimatePresence");
  const needsClientDirective = hasClientHooks || hasAnimationHooks || hasMotionComponents || hasSSRUnsafeLib;

  if (needsClientDirective && !isClientComponent) {
    errors.push({
      type: "missing_directive",
      file: path,
      line: 1,
      message: 'Uses React hooks or animation libraries but missing "use client" directive',
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

// --- Export Validation ---

function validateExports(path: string, content: string): ClassifiedError[] {
  const errors: ClassifiedError[] = [];
  const isPage = /(?:^|\/)page\.(tsx|jsx)$/.test(path);
  const isLayout = /(?:^|\/)layout\.(tsx|jsx)$/.test(path);

  // Page and layout files MUST have a default export
  if (isPage || isLayout) {
    const hasDefaultExport = /export\s+default\s+/.test(content) ||
      /export\s*\{\s*[^}]*\bas\s+default\b/.test(content);
    if (!hasDefaultExport) {
      errors.push({
        type: "runtime_error",
        file: path,
        line: 1,
        message: `${isPage ? "page" : "layout"}.tsx missing default export — Next.js requires a default-exported component`,
        fixStrategy: `Add "export default function Page() { ... }" or ensure the component is exported as default in ${path}`,
        severity: "error",
      });
    }
  }

  // Check for exporting undefined values
  // e.g. "export default undefined" or "export default ;"
  if (/export\s+default\s+undefined\b/.test(content) || /export\s+default\s*;/.test(content)) {
    errors.push({
      type: "runtime_error",
      file: path,
      line: findLineNumber(content, /export\s+default\s+(?:undefined|;)/),
      message: `File exports undefined as default — this causes "Unsupported Server Component type: undefined"`,
      fixStrategy: `The default export in ${path} is undefined. Ensure a valid React component function is exported as default.`,
      severity: "error",
    });
  }

  // Check for default-exporting a variable that was never defined in the file
  const defaultVarExport = content.match(/export\s+default\s+([A-Z]\w+)\s*;/);
  if (defaultVarExport) {
    const exportedName = defaultVarExport[1];
    // Check if this name is defined as a function, const, class, or imported
    const isDefined = new RegExp(
      `(?:function\\s+${exportedName}\\b|const\\s+${exportedName}\\b|let\\s+${exportedName}\\b|class\\s+${exportedName}\\b|import\\s+${exportedName}\\b|import\\s*\\{[^}]*\\b${exportedName}\\b)`
    ).test(content);
    if (!isDefined) {
      errors.push({
        type: "runtime_error",
        file: path,
        line: findLineNumber(content, new RegExp(`export\\s+default\\s+${exportedName}`)),
        message: `"${exportedName}" is exported as default but never defined — component will be undefined`,
        fixStrategy: `Define the "${exportedName}" component as a function in ${path}, or fix the export to reference the correct component name.`,
        severity: "error",
      });
    }
  }

  return errors;
}

// --- Component Integrity (cross-file) ---

function validateComponentIntegrity(virtualFS: Map<string, string>): ClassifiedError[] {
  const errors: ClassifiedError[] = [];

  // Find all page.tsx files and check their component imports
  for (const [pagePath, pageContent] of virtualFS.entries()) {
    if (!(/(?:^|\/)page\.(tsx|jsx)$/.test(pagePath))) continue;
    if (shouldSkipValidation(pagePath)) continue;

    const lines = pageContent.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match default imports from local paths: import Something from './Something'
      const defaultImportMatch = line.match(
        /import\s+([A-Z]\w+)\s+from\s+["']([.@~/][^"']+)["']/
      );
      if (!defaultImportMatch) continue;

      const [, componentName, importPath] = defaultImportMatch;
      const resolved = resolveImportPath(importPath, pagePath, virtualFS);
      if (!resolved) continue; // Import validation already catches missing files

      const targetContent = virtualFS.get(resolved);
      if (!targetContent) continue;

      // Verify the target file has a default export
      const hasDefaultExport = /export\s+default\s+/.test(targetContent) ||
        /export\s*\{\s*[^}]*\bas\s+default\b/.test(targetContent);
      if (!hasDefaultExport) {
        errors.push({
          type: "runtime_error",
          file: resolved,
          line: 1,
          message: `"${componentName}" imported by ${pagePath} but ${resolved} has no default export — renders as undefined`,
          fixStrategy: `Add "export default" to the component in ${resolved}. The component "${componentName}" must be exported as default for the import in ${pagePath} to work.`,
          severity: "error",
        });
      }
    }

    // Also check named imports: import { Foo } from './Bar'
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const namedImportMatch = line.match(
        /import\s*\{([^}]+)\}\s*from\s*["']([.@~/][^"']+)["']/
      );
      if (!namedImportMatch) continue;

      const [, names, importPath] = namedImportMatch;
      const resolved = resolveImportPath(importPath, pagePath, virtualFS);
      if (!resolved) continue;

      const targetContent = virtualFS.get(resolved);
      if (!targetContent) continue;

      // Check each named import exists as an export in the target
      const importedNames = names.split(",").map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      for (const name of importedNames) {
        if (name === "type" || name === "default") continue;
        const isExported = new RegExp(
          `(?:export\\s+(?:const|function|class|let|var|type|interface)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b)`
        ).test(targetContent);
        if (!isExported) {
          errors.push({
            type: "missing_import",
            file: pagePath,
            line: i + 1,
            message: `"${name}" imported from ${resolved} but not exported there`,
            fixStrategy: `Either add "export" to the "${name}" definition in ${resolved}, or fix the import in ${pagePath} to use the correct export name. Search for similar names in ${resolved}.`,
            severity: "error",
          });
        }
      }
    }
  }

  return errors;
}

function findLineNumber(content: string, pattern: RegExp): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return 1;
}

// --- Fixer Agent ---

export async function runFixerAgent(
  virtualFS: Map<string, string>,
  errors: ClassifiedError[],
  emitStep: (stepNum: number, toolName: string, status: string, message: string, details?: any) => Promise<void>,
  stepBase: number,
  forceExplicit: boolean = false,
): Promise<{ fileOperations: FileOperation[]; nextStep: number; retried: boolean }> {
  const config = selectModel("execute", "moderate");
  const tools = createEnhancedTools(virtualFS);
  const fileOperations: FileOperation[] = [];
  let stepCounter = stepBase;

  // Build a targeted fix prompt with file context included
  const errorList = errors
    .filter(e => e.severity === "error")
    .slice(0, 10)
    .map((e, i) => {
      let context = "";
      const fileContent = virtualFS.get(e.file);
      if (fileContent && e.line) {
        const lines = fileContent.split("\n");
        const start = Math.max(0, e.line - 6);
        const end = Math.min(lines.length, e.line + 5);
        context = `\n   File context (${e.file} lines ${start + 1}-${end}):\n${lines.slice(start, end).map((l, idx) => `   ${start + idx + 1}${start + idx + 1 === e.line ? " >>>" : "    "} ${l}`).join("\n")}`;
      }
      return `${i + 1}. [${e.type}] ${e.file}:${e.line} — ${e.message}\n   Fix: ${e.fixStrategy}${context}`;
    })
    .join("\n\n");

  if (!errorList) {
    return { fileOperations, nextStep: stepCounter, retried: forceExplicit };
  }

  const explicitPrefix = forceExplicit
    ? "CRITICAL: You MUST call write_file or edit_file tools to fix these errors. Do NOT respond with only text.\n\n"
    : "";

  const prompt = `${explicitPrefix}## Errors to Fix\n${errorList}\n\n## Available Files\n${Array.from(virtualFS.keys()).sort().join("\n")}\n\nFix each error using the tools. The file context is provided above — apply targeted edits immediately.`;

  try {
    await generateText({
      model: config.model,
      system: FIXER_SYSTEM_PROMPT,
      prompt,
      tools,
      stopWhen: stepCountIs(Math.min(errors.length * 4, 16)),
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

  if (fileOperations.length === 0) {
    console.warn("[FixerAgent] AI responded without using any file tools — fix may have been described in text only");
  }

  return { fileOperations, nextStep: stepCounter, retried: forceExplicit };
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
