// Test Generator — Automatically creates Vitest tests for generated code
// Runs after code generation, validates test quality statically

import { generateText } from "ai";
import { selectModel } from "../router";
import type { RepoMap } from "../context/repo-map";

// --- Types ---

interface FileOperation {
  type: "write" | "modify" | "delete";
  path: string;
  content?: string;
}

export interface TestGenerationResult {
  testFiles: Array<{
    path: string;
    content: string;
    testCount: number;
    coverageEstimate: number;
  }>;
  totalTests: number;
}

// --- Main Generator ---

/**
 * Generate tests for newly created/modified files.
 * Uses Flash model for speed. Only generates for testable files.
 */
export async function generateTests(
  fileOperations: FileOperation[],
  virtualFS: Map<string, string>,
  repoMap: RepoMap | null,
): Promise<TestGenerationResult> {
  const testFiles: TestGenerationResult["testFiles"] = [];
  let totalTests = 0;

  // Filter to testable files (skip tests, configs, CSS, etc.)
  const testableOps = fileOperations.filter(op =>
    op.content && isTestableFile(op.path) && !isTestFile(op.path),
  );

  // Limit to avoid excessive API calls
  const opsToTest = testableOps.slice(0, 5);

  for (const op of opsToTest) {
    try {
      const testResult = await generateTestForFile(
        op.path,
        op.content!,
        virtualFS,
        repoMap,
      );

      if (testResult) {
        const quality = validateTestQuality(testResult.content, op.content!);
        testFiles.push({
          path: testResult.path,
          content: testResult.content,
          testCount: quality.testCount,
          coverageEstimate: quality.coverageEstimate,
        });
        totalTests += quality.testCount;

        // Add test file to virtualFS
        virtualFS.set(testResult.path, testResult.content);
      }
    } catch {
      // Skip files that fail test generation — non-critical
      continue;
    }
  }

  return { testFiles, totalTests };
}

// --- Per-File Test Generation ---

async function generateTestForFile(
  filePath: string,
  fileContent: string,
  virtualFS: Map<string, string>,
  repoMap: RepoMap | null,
): Promise<{ path: string; content: string } | null> {
  const isComponent = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
  const isUtil = filePath.includes("/lib/") || filePath.includes("/utils/") || filePath.includes("/helpers/");

  // Build context about imports
  const imports = extractImports(fileContent);
  const exports = extractExports(fileContent);

  if (exports.length === 0) return null; // Nothing to test

  const testPath = getTestPath(filePath);

  const prompt = buildTestPrompt(filePath, fileContent, isComponent, isUtil, imports, exports);

  const config = selectModel("fix", "simple"); // Use Flash for speed

  const result = await generateText({
    model: config.model,
    temperature: 0.1,
    system: TEST_SYSTEM_PROMPT,
    prompt,
  });

  const testContent = cleanTestOutput(result.text);
  if (!testContent || testContent.length < 50) return null;

  return { path: testPath, content: testContent };
}

// --- Test Prompt ---

const TEST_SYSTEM_PROMPT = `You are a test generation expert. Generate Vitest tests for React/TypeScript code.

Rules:
- Use vitest imports: import { describe, it, expect, vi } from 'vitest'
- For React components: import { render, screen } from '@testing-library/react'
- Test all exported functions and components
- Include edge cases and error scenarios
- Do NOT test implementation details — test behavior
- Keep tests focused, readable, and meaningful
- Use descriptive test names
- Output ONLY the test file content, no explanations
- Always include the necessary imports at the top`;

function buildTestPrompt(
  filePath: string,
  content: string,
  isComponent: boolean,
  isUtil: boolean,
  imports: string[],
  exports: string[],
): string {
  const lines = [
    `Generate Vitest tests for this file: ${filePath}`,
    "",
    "```typescript",
    content.slice(0, 3000), // Limit content size
    "```",
    "",
    `Exports to test: ${exports.join(", ")}`,
  ];

  if (isComponent) {
    lines.push(
      "",
      "This is a React component. Test:",
      "- Renders without crashing",
      "- Displays expected text/elements",
      "- Handles props correctly",
      "- Interactive elements work (onClick, onChange, etc.)",
    );
  }

  if (isUtil) {
    lines.push(
      "",
      "This is a utility module. Test:",
      "- Correct output for typical inputs",
      "- Edge cases (empty, null, boundary values)",
      "- Error handling",
    );
  }

  lines.push(
    "",
    `Import the module under test from: ${getRelativeImport(filePath)}`,
  );

  return lines.join("\n");
}

// --- Test Quality Validation ---

interface TestQuality {
  testCount: number;
  hasDescribe: boolean;
  hasAssertions: boolean;
  coverageEstimate: number;
}

/**
 * Validate test quality statically (no execution).
 * Checks structure, assertions, and coverage estimate.
 */
export function validateTestQuality(
  testContent: string,
  sourceContent: string,
): TestQuality {
  const testCount = (testContent.match(/\bit\s*\(/g) || []).length +
                    (testContent.match(/\btest\s*\(/g) || []).length;

  const hasDescribe = /\bdescribe\s*\(/.test(testContent);
  const hasAssertions = /\bexpect\s*\(/.test(testContent);

  // Estimate coverage: % of exports that appear in test file
  const sourceExports = extractExports(sourceContent);
  const testedExports = sourceExports.filter(exp =>
    testContent.includes(exp),
  );
  const coverageEstimate = sourceExports.length > 0
    ? Math.round((testedExports.length / sourceExports.length) * 100)
    : 0;

  return {
    testCount,
    hasDescribe,
    hasAssertions,
    coverageEstimate,
  };
}

// --- Helpers ---

function isTestableFile(path: string): boolean {
  return (
    (path.endsWith(".ts") || path.endsWith(".tsx") ||
     path.endsWith(".js") || path.endsWith(".jsx")) &&
    !path.includes("layout.ts") &&
    !path.includes("globals.css") &&
    !path.includes("tailwind.config") &&
    !path.includes("next.config") &&
    !path.includes("package.json") &&
    !path.endsWith(".d.ts") &&
    !path.endsWith(".config.ts") &&
    !path.endsWith(".config.js")
  );
}

function isTestFile(path: string): boolean {
  return (
    path.includes(".test.") ||
    path.includes(".spec.") ||
    path.includes("__tests__")
  );
}

function getTestPath(filePath: string): string {
  const ext = filePath.match(/\.(tsx?|jsx?)$/)?.[0] || ".ts";
  const base = filePath.replace(/\.(tsx?|jsx?)$/, "");
  return `${base}.test${ext}`;
}

function getRelativeImport(filePath: string): string {
  const withoutExt = filePath.replace(/\.(tsx?|jsx?)$/, "");
  if (withoutExt.startsWith("src/")) {
    return `@/${withoutExt.slice(4)}`;
  }
  return `./${withoutExt.split("/").pop()}`;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const matches = content.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/g);
  for (const match of matches) {
    imports.push(match[1]);
  }
  return imports;
}

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const matches = content.matchAll(/export\s+(?:default\s+)?(?:const|function|class|type|interface)\s+(\w+)/g);
  for (const match of matches) {
    exports.push(match[1]);
  }
  return exports;
}

function cleanTestOutput(text: string): string {
  // Remove markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
  }
  return cleaned.trim();
}
