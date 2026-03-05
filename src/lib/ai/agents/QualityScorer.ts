// Quality Scorer — Self-evaluates generated code on multiple dimensions
// Runs after task execution, scores 0-10, and flags issues for retry

import type { RepoMap } from "../context/repo-map";

// --- Types ---

export interface QualityScore {
  overall: number;          // 0-10
  dimensions: {
    patternAdherence: number;  // Does it follow project conventions?
    importCorrectness: number; // All imports resolve?
    accessibility: number;     // Alt tags, aria labels, semantic HTML?
    codeClean: number;         // No console.logs, no TODOs, no dead code?
  };
  issues: string[];
  suggestions: string[];
}

// --- Main Scorer ---

export function scoreGeneratedCode(
  path: string,
  content: string,
  virtualFS: Map<string, string>,
  repoMap: RepoMap | null,
): QualityScore {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const patternScore = scorePatternAdherence(path, content, virtualFS, repoMap, issues, suggestions);
  const importScore = scoreImportCorrectness(path, content, virtualFS, issues, suggestions);
  const accessibilityScore = scoreAccessibility(path, content, issues, suggestions);
  const cleanScore = scoreCodeCleanliness(path, content, issues, suggestions);

  const overall = Math.round(
    (patternScore * 0.3 + importScore * 0.3 + accessibilityScore * 0.2 + cleanScore * 0.2) * 10
  ) / 10;

  return {
    overall,
    dimensions: {
      patternAdherence: patternScore,
      importCorrectness: importScore,
      accessibility: accessibilityScore,
      codeClean: cleanScore,
    },
    issues,
    suggestions,
  };
}

// --- Batch Scorer (for all files from a task) ---

export function scoreTaskOutput(
  fileOperations: Array<{ path: string; content?: string }>,
  virtualFS: Map<string, string>,
  repoMap: RepoMap | null,
): { averageScore: number; fileScores: Map<string, QualityScore>; criticalIssues: string[] } {
  const fileScores = new Map<string, QualityScore>();
  let totalScore = 0;
  let count = 0;
  const criticalIssues: string[] = [];

  for (const op of fileOperations) {
    if (!op.content || !isScorableFile(op.path)) continue;

    const score = scoreGeneratedCode(op.path, op.content, virtualFS, repoMap);
    fileScores.set(op.path, score);
    totalScore += score.overall;
    count++;

    // Track critical issues (score < 5 on any dimension)
    if (score.dimensions.importCorrectness < 5) {
      criticalIssues.push(`${op.path}: Import issues — ${score.issues.filter(i => i.includes("import")).join(", ")}`);
    }
    if (score.dimensions.patternAdherence < 4) {
      criticalIssues.push(`${op.path}: Pattern violations — ${score.issues.filter(i => i.includes("pattern") || i.includes("existing")).join(", ")}`);
    }
  }

  return {
    averageScore: count > 0 ? Math.round((totalScore / count) * 10) / 10 : 10,
    fileScores,
    criticalIssues,
  };
}

// --- Dimension Scorers ---

function scorePatternAdherence(
  path: string,
  content: string,
  virtualFS: Map<string, string>,
  repoMap: RepoMap | null,
  issues: string[],
  suggestions: string[],
): number {
  let score = 10;
  const isReact = path.endsWith(".tsx") || path.endsWith(".jsx");

  // Check if it uses "use client" when needed
  if (isReact) {
    const needsClient = /\b(useState|useEffect|useLayoutEffect|useRef|onClick|onChange|onSubmit)\b/.test(content);
    const hasClient = content.includes('"use client"') || content.includes("'use client'");
    if (needsClient && !hasClient) {
      score -= 3;
      issues.push('Missing "use client" directive for interactive component');
    }
  }

  // Check if existing components are being recreated
  if (repoMap) {
    for (const component of repoMap.componentRegistry) {
      // If this file defines a component that already exists elsewhere
      if (path !== component.path) {
        const definesComponent = new RegExp(`(?:export\\s+)?(?:function|const)\\s+${component.name}\\b`).test(content);
        if (definesComponent) {
          score -= 2;
          issues.push(`Recreates existing component "${component.name}" (already at ${component.path})`);
          suggestions.push(`Import ${component.name} from "${component.path.replace(/^src\//, "@/").replace(/\.(tsx|ts)$/, "")}" instead`);
        }
      }
    }
  }

  // Check for cn() usage if project has it
  const hasCnUtil = virtualFS.has("src/lib/utils.ts") && (virtualFS.get("src/lib/utils.ts") || "").includes("cn");
  if (hasCnUtil && isReact) {
    const hasConditionalClasses = /className=\{.*\?.*:.*\}/.test(content) || /className=\{`\$\{/.test(content);
    const usesCn = content.includes("cn(");
    if (hasConditionalClasses && !usesCn) {
      score -= 1;
      suggestions.push("Use cn() from @/lib/utils for conditional class merging");
    }
  }

  return Math.max(0, score);
}

function scoreImportCorrectness(
  path: string,
  content: string,
  virtualFS: Map<string, string>,
  issues: string[],
  suggestions: string[],
): number {
  let score = 10;
  const lines = content.split("\n");

  for (const line of lines) {
    const importMatch = line.trim().match(/import\s+.*from\s+["']([^"']+)["']/);
    if (!importMatch) continue;

    const importPath = importMatch[1];

    // Skip external packages
    if (!importPath.startsWith(".") && !importPath.startsWith("@/") && !importPath.startsWith("~/")) continue;

    // Try to resolve
    let resolved = importPath;
    if (importPath.startsWith("@/")) {
      resolved = "src/" + importPath.slice(2);
    } else if (importPath.startsWith(".")) {
      const fromDir = path.split("/").slice(0, -1).join("/");
      const parts = importPath.split("/");
      const dirParts = fromDir.split("/").filter(Boolean);
      for (const part of parts) {
        if (part === "..") dirParts.pop();
        else if (part !== ".") dirParts.push(part);
      }
      resolved = dirParts.join("/");
    }

    const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];
    const exists = extensions.some(ext => virtualFS.has(resolved + ext));

    if (!exists) {
      score -= 2;
      issues.push(`Broken import: "${importPath}" in ${path}`);
    }
  }

  return Math.max(0, score);
}

function scoreAccessibility(
  path: string,
  content: string,
  issues: string[],
  suggestions: string[],
): number {
  if (!path.endsWith(".tsx") && !path.endsWith(".jsx")) return 10;

  let score = 10;

  // Check for images without alt
  const imgWithoutAlt = (content.match(/<img(?![^>]*alt=)/g) || []).length;
  const nextImageWithoutAlt = (content.match(/<Image(?![^>]*alt=)/g) || []).length;
  if (imgWithoutAlt + nextImageWithoutAlt > 0) {
    score -= 2;
    issues.push(`${imgWithoutAlt + nextImageWithoutAlt} image(s) without alt text`);
  }

  // Check for buttons without accessible text
  const emptyButtons = (content.match(/<button[^>]*>\s*<(?:svg|img|span[^>]*class)/gi) || []).length;
  if (emptyButtons > 0) {
    score -= 1;
    suggestions.push("Add aria-label to icon-only buttons");
  }

  // Check for semantic HTML
  const hasMain = content.includes("<main");
  const hasHeader = content.includes("<header") || content.includes("<nav");
  const isPage = path.includes("page.tsx") || path.includes("page.jsx");

  if (isPage && !hasMain) {
    score -= 1;
    suggestions.push("Use <main> for primary page content");
  }

  // Check for onClick on non-interactive elements
  const clickOnDiv = (content.match(/<div[^>]*onClick/g) || []).length;
  if (clickOnDiv > 0) {
    score -= 1;
    suggestions.push("Use <button> instead of <div onClick> for interactive elements");
  }

  return Math.max(0, score);
}

function scoreCodeCleanliness(
  path: string,
  content: string,
  issues: string[],
  suggestions: string[],
): number {
  let score = 10;

  // Check for console.log (not console.error/warn which are intentional)
  const consoleLogs = (content.match(/console\.log\(/g) || []).length;
  if (consoleLogs > 0) {
    score -= 1;
    issues.push(`${consoleLogs} console.log statement(s) — remove before production`);
  }

  // Check for TODO/FIXME comments
  const todos = (content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/gi) || []).length;
  if (todos > 0) {
    score -= 0.5;
    suggestions.push(`${todos} TODO/FIXME comment(s) found`);
  }

  // Check for commented-out code blocks (more than 3 consecutive commented lines)
  const lines = content.split("\n");
  let commentStreak = 0;
  for (const line of lines) {
    if (line.trim().startsWith("//") && !line.trim().startsWith("///")) {
      commentStreak++;
    } else {
      if (commentStreak >= 4) {
        score -= 1;
        issues.push("Commented-out code block found — remove unused code");
        break;
      }
      commentStreak = 0;
    }
  }

  // Check for unused imports (basic: imported name not found elsewhere in file)
  const importLines = lines.filter(l => l.trim().startsWith("import"));
  for (const impLine of importLines) {
    const namedImports = impLine.match(/\{\s*([^}]+)\s*\}/);
    if (namedImports) {
      const names = namedImports[1].split(",").map(n => n.trim().split(/\s+as\s+/).pop()!.trim());
      const restOfFile = content.replace(impLine, "");
      for (const name of names) {
        if (name && !new RegExp(`\\b${name}\\b`).test(restOfFile)) {
          score -= 0.5;
          suggestions.push(`Possibly unused import: ${name}`);
          break; // Only flag once per import line
        }
      }
    }
  }

  // Check file length (very long files are a smell)
  if (lines.length > 500) {
    score -= 1;
    suggestions.push(`File is ${lines.length} lines — consider splitting into smaller modules`);
  }

  return Math.max(0, score);
}

// --- Helpers ---

function isScorableFile(path: string): boolean {
  return (
    path.endsWith(".ts") ||
    path.endsWith(".tsx") ||
    path.endsWith(".js") ||
    path.endsWith(".jsx")
  );
}
