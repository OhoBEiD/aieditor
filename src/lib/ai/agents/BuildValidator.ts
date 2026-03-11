// Build Validator & Fixer Agent — Self-healing build loop
// After execution, validates code by checking for common errors,
// classifies them, and generates targeted fixes. Loops up to 3 times.

import { generateText, stepCountIs } from "ai";
import { selectModel, type UserModel } from "../router";
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

## WORKFLOW (follow this order for EVERY error)
1. **READ** the file with read_file to understand the full context around the error
2. **SEARCH** if needed — for import errors, use grep_files to find where the export actually lives (e.g. "export.*ComponentName")
3. **FIX** using edit_file (for surgical changes) or write_file (for rewrites). You MUST call a file tool.
4. Move to the next error and repeat.

## ERROR-SPECIFIC FIXES
- **missing_import**: grep_files for the export name, then fix the import path with edit_file. Check @/components/*, @/lib/*, and subdirectories. For npm packages, verify the import path is correct (see IMPORT PATTERNS below).
- **missing_dependency**: First check if it's a wrong import path (e.g., "framer-motion" should be "motion/react"). If genuinely missing, add to package.json.
- **syntax_error**: Read the file, find unbalanced braces/parens, fix with edit_file.
- **missing_directive**: Add "use client" as line 1 with edit_file.
- **runtime_error** (webpack "Cannot read properties of undefined" or wrong import): Check import patterns:
  - gsap: MUST be \`import gsap from "gsap"\` (default), NOT \`import { gsap } from "gsap"\`
  - gsap/ScrollTrigger: MUST be \`import { ScrollTrigger } from "gsap/ScrollTrigger"\` (named)
  - motion: MUST be \`import { motion } from "motion/react"\`, NOT from "motion" or "framer-motion"
  - lenis: \`import { ReactLenis, useLenis } from "lenis/react"\`, NOT from "lenis"
  - lucide-react: \`import { Icon } from "lucide-react"\` (named only)
  Read the file, find the wrong import, and fix it.
- **runtime_error** (undefined export): Read the file, ensure a valid "export default function" exists.
- **layout_error**: Ensure layout.tsx has <html> and <body> tags.
- **type errors**: Read the type definition, then fix the usage.

## CRITICAL RULES
- You MUST use write_file or edit_file tools. Do NOT describe fixes in text only.
- Fix EVERY error listed, not just some of them.
- Read files first to understand context before editing.

## RESPONSE
After fixing all errors with tools, respond with a brief summary of what was fixed.`;

// --- Main Build Validation Loop ---

export async function runBuildValidationLoop(
  virtualFS: Map<string, string>,
  fileOperations: FileOperation[],
  emitStep: (stepNum: number, toolName: string, status: string, message: string, details?: any) => Promise<void>,
  stepBase: number,
  maxIterations: number = 3,
  selectedModel?: UserModel,
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
    const fixResult = await runFixerAgent(virtualFS, currentErrors, emitStep, stepCounter, false, selectedModel);
    stepCounter = fixResult.nextStep;
    allFixOps.push(...fixResult.fileOperations);

    if (fixResult.fileOperations.length === 0) {
      // Fixer couldn't make any changes — retry once with explicit prompt
      if (!fixResult.retried) {
        await emitStep(stepCounter++, "build_fix", "running", "Retrying fix with explicit instructions...");
        const retryResult = await runFixerAgent(virtualFS, currentErrors, emitStep, stepCounter, true, selectedModel);
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

    // Check import specifier correctness (default vs named, correct subpaths)
    const specifierErrors = validateImportSpecifiers(path, content);
    errors.push(...specifierErrors);

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

    // Check npm packages against package.json
    if (!importPath.startsWith(".") && !importPath.startsWith("@/") && !importPath.startsWith("~/")) {
      // Validate that the npm package exists in package.json
      const packageName = getPackageName(importPath);
      if (!isPackageInstalled(packageName, virtualFS)) {
        errors.push({
          type: "missing_dependency",
          file: path,
          line: i + 1,
          message: `Package "${packageName}" is imported but not listed in package.json`,
          fixStrategy: `Add "${packageName}" to package.json dependencies. Read package.json first, then add the package with a reasonable version.`,
          severity: "error",
        });
      }
      continue;
    }

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

// --- Import Specifier Validation (default vs named, correct subpaths) ---

interface ImportPattern {
  importType: "default" | "named";
  validSubpaths?: Record<string, "default" | "named">;
  invalidSubpaths?: string[];
  requiredSubpath?: string;
}

const KNOWN_IMPORT_PATTERNS: Record<string, ImportPattern> = {
  gsap: {
    importType: "default", // import gsap from "gsap" — NOT { gsap }
    validSubpaths: {
      "gsap/ScrollTrigger": "named",
      "gsap/Flip": "named",
      "gsap/TextPlugin": "named",
      "gsap/MotionPathPlugin": "named",
      "gsap/Observer": "named",
      "gsap/Draggable": "named",
      "gsap/EasePack": "named",
    },
  },
  motion: {
    importType: "named",
    requiredSubpath: "motion/react", // base "motion" doesn't export React components
    validSubpaths: { "motion/react": "named" },
    invalidSubpaths: ["motion/react-client"],
  },
  lenis: {
    importType: "default", // import Lenis from "lenis"
    validSubpaths: { "lenis/react": "named" },
  },
  "lucide-react": {
    importType: "named", // import { Icon } from "lucide-react"
  },
};

function validateImportSpecifiers(path: string, content: string): ClassifiedError[] {
  const errors: ClassifiedError[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("import") || line.startsWith("import type")) continue;

    // Parse import statement
    const defaultMatch = line.match(/^import\s+(\w+)\s+from\s+["']([^"']+)["']/);
    const namedMatch = line.match(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/);
    const mixedMatch = line.match(/^import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+["']([^"']+)["']/);

    let importPath: string | null = null;
    let isDefault = false;
    let isNamed = false;

    if (mixedMatch) {
      importPath = mixedMatch[3];
      isDefault = true;
      isNamed = true;
    } else if (defaultMatch) {
      importPath = defaultMatch[2];
      isDefault = true;
    } else if (namedMatch) {
      importPath = namedMatch[2];
      isNamed = true;
    }

    if (!importPath) continue;

    const packageName = getPackageName(importPath);
    const pattern = KNOWN_IMPORT_PATTERNS[packageName];
    if (!pattern) continue;

    // Check: using base path when requiredSubpath is set
    if (pattern.requiredSubpath && importPath === packageName) {
      errors.push({
        type: "runtime_error",
        file: path,
        line: i + 1,
        message: `Import from "${packageName}" should use "${pattern.requiredSubpath}" — base path causes webpack runtime crash`,
        fixStrategy: `Change import path from "${packageName}" to "${pattern.requiredSubpath}" in ${path} line ${i + 1}`,
        severity: "error",
      });
      continue;
    }

    // Check: invalid subpath
    if (pattern.invalidSubpaths?.includes(importPath)) {
      const suggested = pattern.requiredSubpath || packageName;
      errors.push({
        type: "runtime_error",
        file: path,
        line: i + 1,
        message: `"${importPath}" is not a valid import path — use "${suggested}" instead`,
        fixStrategy: `Change import path from "${importPath}" to "${suggested}" in ${path} line ${i + 1}`,
        severity: "error",
      });
      continue;
    }

    // Determine expected export type for this import path
    let expectedType: "default" | "named" | undefined;
    if (importPath === packageName) {
      expectedType = pattern.importType;
    } else if (importPath === pattern.requiredSubpath) {
      expectedType = pattern.validSubpaths?.[importPath] || pattern.importType;
    } else if (pattern.validSubpaths?.[importPath]) {
      expectedType = pattern.validSubpaths[importPath];
    }

    if (!expectedType) continue;

    // Check: named import of a default-only export
    if (expectedType === "default" && isNamed && !isDefault) {
      errors.push({
        type: "runtime_error",
        file: path,
        line: i + 1,
        message: `"${importPath}" uses a default export — use \`import ${packageName} from "${importPath}"\` instead of destructured import`,
        fixStrategy: `Change to default import: \`import ${packageName} from "${importPath}"\` in ${path} line ${i + 1}`,
        severity: "error",
      });
    }

    // Check: default import of a named-only export
    if (expectedType === "named" && isDefault && !isNamed) {
      errors.push({
        type: "runtime_error",
        file: path,
        line: i + 1,
        message: `"${importPath}" uses named exports — use \`import { ... } from "${importPath}"\` instead of default import`,
        fixStrategy: `Change to named import in ${path} line ${i + 1}. Example: import { motion, AnimatePresence } from "motion/react"`,
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

  // Check for event handlers without "use client"
  const hasEventHandlers = /\bon(?:Click|Change|Submit|MouseEnter|MouseLeave|MouseMove|KeyDown|KeyUp|Scroll|Focus|Blur|Input|TouchStart|TouchEnd)\s*=\s*\{/.test(content);
  if (hasEventHandlers && !isClientComponent) {
    errors.push({
      type: "missing_directive",
      file: path,
      line: 1,
      message: 'Uses event handlers (onClick, onChange, etc.) but missing "use client" directive',
      fixStrategy: `Add "use client" as the first line of ${path}`,
      severity: "error",
    });
  }

  // Check for hydration-prone HTML nesting: <p> containing block-level elements
  const pWithBlockContent = /<p[\s>][^]*?<(?:div|section|h[1-6]|ul|ol|li|table|form|blockquote|pre|hr|article|aside|header|footer|nav|main|figure)[\s>]/;
  if (pWithBlockContent.test(content)) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/<p[\s>]/.test(lines[i])) {
        // Scan forward for block elements before closing </p>
        let depth = 0;
        for (let j = i; j < Math.min(i + 20, lines.length); j++) {
          if (/<p[\s>]/.test(lines[j])) depth++;
          if (/<\/p>/.test(lines[j])) { depth--; if (depth <= 0) break; }
          if (j > i && /<(?:div|section|h[1-6]|ul|ol|table|form|blockquote)[\s>]/.test(lines[j])) {
            errors.push({
              type: "runtime_error",
              file: path,
              line: i + 1,
              message: `<p> tag contains block-level element — causes React hydration error`,
              fixStrategy: `In ${path} around line ${i + 1}, change the <p> wrapper to <div> to avoid hydration mismatch`,
              severity: "error",
            });
            break;
          }
        }
      }
    }
  }

  // Check for "use client" on layout.tsx (it should be a server component)
  if (path.includes("layout.tsx") && isClientComponent) {
    errors.push({
      type: "runtime_error",
      file: path,
      line: 1,
      message: 'layout.tsx should NOT have "use client" — it must be a Server Component in Next.js App Router',
      fixStrategy: `Remove the "use client" directive from ${path}. If you need client-side interactivity in layout, extract it to a separate client component.`,
      severity: "warning",
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
  selectedModel?: UserModel,
): Promise<{ fileOperations: FileOperation[]; nextStep: number; retried: boolean }> {
  const config = selectModel("fix");
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
        const start = Math.max(0, e.line - 20);
        const end = Math.min(lines.length, e.line + 19);
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
      stopWhen: stepCountIs(Math.min(errors.length * 5, 25)),
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

// --- NPM Package Validation Helpers ---

/** Extract the package name from an import path (e.g. "@react-spring/web" → "@react-spring/web", "gsap/ScrollTrigger" → "gsap") */
function getPackageName(importPath: string): string {
  if (importPath.startsWith("@")) {
    // Scoped package: @scope/name or @scope/name/subpath
    const parts = importPath.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
  }
  // Regular package: name or name/subpath
  return importPath.split("/")[0];
}

/** Known built-in Node/Next.js modules that don't need to be in package.json */
const BUILTIN_MODULES = new Set([
  "react", "react-dom", "next", "fs", "path", "os", "crypto", "stream", "util", "url",
  "http", "https", "events", "buffer", "querystring", "child_process", "assert",
  "next/font", "next/font/google", "next/font/local", "next/image", "next/link",
  "next/navigation", "next/router", "next/head", "next/script", "next/dynamic",
  "next/server", "next/headers", "next/cache", "react/jsx-runtime",
]);

/** Check if a package is available (in package.json or is a built-in) */
function isPackageInstalled(packageName: string, virtualFS: Map<string, string>): boolean {
  // Built-in modules are always available
  if (BUILTIN_MODULES.has(packageName)) return true;
  // next/* subpaths are always available
  if (packageName.startsWith("next/")) return true;
  // react/* subpaths
  if (packageName.startsWith("react/") || packageName.startsWith("react-dom/")) return true;

  // Parse package.json to check dependencies
  const pkgJsonContent = virtualFS.get("package.json");
  if (!pkgJsonContent) return true; // If no package.json, skip validation

  try {
    const pkg = JSON.parse(pkgJsonContent);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    return packageName in allDeps;
  } catch {
    return true; // If package.json is malformed, skip validation
  }
}

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
