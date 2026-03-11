// Error Classifier — Maps error types to specific fix strategies
// Used by BuildValidator and the re-planning loop to apply targeted fixes
// instead of generic retries

// --- Types ---

export interface ClassifiedError {
  type: ErrorType;
  file: string;
  line: number;
  message: string;
  fixStrategy: string;
  severity: "error" | "warning";
}

export type ErrorType =
  | "missing_import"
  | "type_mismatch"
  | "syntax_error"
  | "missing_file"
  | "missing_dependency"
  | "missing_directive"
  | "prop_mismatch"
  | "css_error"
  | "layout_error"
  | "runtime_error"
  | "unknown";

// --- Error Classification from Build Output ---

export function classifyErrors(buildOutput: string): ClassifiedError[] {
  const errors: ClassifiedError[] = [];
  const lines = buildOutput.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Module not found
    const moduleNotFound = line.match(/Module not found:\s*(?:Error:\s*)?Can't resolve '([^']+)'\s*(?:in\s*'([^']+)')?/i);
    if (moduleNotFound) {
      const [, moduleName, filePath] = moduleNotFound;
      const isPackage = !moduleName.startsWith(".") && !moduleName.startsWith("@/");
      errors.push({
        type: isPackage ? "missing_dependency" : "missing_import",
        file: filePath || "unknown",
        line: 0,
        message: `Cannot resolve '${moduleName}'`,
        fixStrategy: isPackage
          ? `Add "${moduleName}" to package.json dependencies and run npm install`
          : `Find the correct path for "${moduleName}" using grep_files, then fix the import`,
        severity: "error",
      });
      continue;
    }

    // Webpack runtime error: wrong import specifier (default/named mismatch, wrong subpath)
    const webpackCallError = line.match(
      /TypeError:\s*Cannot read propert(?:y|ies) of undefined \(reading '(?:call|apply|default)'\)/i
    );
    if (webpackCallError) {
      errors.push({
        type: "runtime_error",
        file: "unknown",
        line: 0,
        message: `Webpack runtime error: ${line.trim().slice(0, 150)} — likely wrong import path or default/named mismatch`,
        fixStrategy: `Check all imports for: 1) gsap must be default import (import gsap from "gsap"), not named ({gsap}), 2) motion must import from "motion/react" not "motion" or "framer-motion", 3) lenis React hooks must import from "lenis/react" not "lenis". Search for import statements and fix each one.`,
        severity: "error",
      });
      continue;
    }

    // TypeScript errors (TS2xxx format)
    const tsError = line.match(/(.+?)\((\d+),\d+\):\s*error\s*TS(\d+):\s*(.+)/);
    if (tsError) {
      const [, file, lineNum, code, message] = tsError;
      const errorType = classifyTSError(parseInt(code), message);
      errors.push({
        type: errorType,
        file: file.replace(/^\.\//, ""),
        line: parseInt(lineNum),
        message,
        fixStrategy: getTSFixStrategy(errorType, file, parseInt(lineNum), message),
        severity: "error",
      });
      continue;
    }

    // Next.js specific errors
    const nextError = line.match(/Error:\s*(.+?) is not a (.+?) Component/i);
    if (nextError) {
      errors.push({
        type: "missing_directive",
        file: "unknown",
        line: 1,
        message: line,
        fixStrategy: `Add "use client" or "use server" directive to the component file`,
        severity: "error",
      });
      continue;
    }

    // Unsupported Server Component type (undefined export)
    const unsupportedComponent = line.match(/Unsupported Server Component type:\s*(\w+)/i);
    if (unsupportedComponent) {
      errors.push({
        type: "runtime_error",
        file: "unknown",
        line: 1,
        message: `Unsupported Server Component type: ${unsupportedComponent[1]} — a component's default export is undefined`,
        fixStrategy: `A component's default export is undefined. Check all component files imported by page.tsx — one of them has a missing or broken "export default". Search for "export default" in each component file and ensure every component is properly defined and exported.`,
        severity: "error",
      });
      continue;
    }

    // Generic error with file path
    const genericError = line.match(/(?:Error|error)\s*(?:in\s+)?([^\s:]+\.(?:ts|tsx|js|jsx)):?\s*(?:line\s*)?(\d+)?:?\s*(.*)/i);
    if (genericError) {
      const [, file, lineNum, message] = genericError;
      errors.push({
        type: "unknown",
        file: file.replace(/^\.\//, ""),
        line: lineNum ? parseInt(lineNum) : 0,
        message: message || line,
        fixStrategy: `Read ${file}${lineNum ? ` around line ${lineNum}` : ""} to understand and fix the error`,
        severity: "error",
      });
    }
  }

  return errors;
}

// --- TypeScript Error Classification ---

function classifyTSError(code: number, message: string): ErrorType {
  // Import errors
  if (code === 2307 || code === 2305 || code === 2306 || code === 2724) return "missing_import";

  // Type errors
  if (code === 2322 || code === 2345 || code === 2352 || code === 2769) return "type_mismatch";
  if (code === 2339 || code === 2551) return "prop_mismatch";

  // Syntax/declaration errors
  if (code === 1005 || code === 1003 || code === 1128 || code === 1109) return "syntax_error";
  if (code === 2304 || code === 2552) return "missing_import"; // Cannot find name

  // Module errors
  if (code === 2792 || code === 1479) return "missing_dependency";

  return "unknown";
}

// --- Fix Strategy Generator ---

function getTSFixStrategy(errorType: ErrorType, file: string, line: number, message: string): string {
  switch (errorType) {
    case "missing_import":
      return `grep for the missing export in the codebase, then fix the import in ${file}:${line}. If it's from a package, add it to package.json.`;

    case "type_mismatch":
      return `Read the type definitions referenced in the error, then fix the type usage in ${file}:${line}. The error: "${message}"`;

    case "prop_mismatch":
      return `Read the component definition to see its expected props, then fix the usage in ${file}:${line}`;

    case "syntax_error":
      return `Read ${file} around line ${line} with context (±5 lines). Fix the syntax error: "${message}"`;

    case "missing_dependency":
      return `Add the missing package to package.json. Check if it should be a devDependency.`;

    default:
      return `Read ${file}:${line}, understand the error "${message}", and fix it.`;
  }
}

// --- Error Priority Sorting ---

export function prioritizeErrors(errors: ClassifiedError[]): ClassifiedError[] {
  const priority: Record<ErrorType, number> = {
    layout_error: 0,
    missing_directive: 1,
    missing_dependency: 2,
    missing_import: 3,
    syntax_error: 4,
    missing_file: 5,
    type_mismatch: 6,
    prop_mismatch: 7,
    css_error: 8,
    runtime_error: 9,
    unknown: 10,
  };

  return [...errors].sort((a, b) => {
    // Errors before warnings
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    // Then by priority
    return (priority[a.type] || 10) - (priority[b.type] || 10);
  });
}

// --- Error Deduplication ---

export function deduplicateErrors(errors: ClassifiedError[]): ClassifiedError[] {
  const seen = new Set<string>();
  return errors.filter(e => {
    const key = `${e.type}:${e.file}:${e.line}:${e.message.slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
