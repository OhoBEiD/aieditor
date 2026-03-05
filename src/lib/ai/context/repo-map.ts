// Repository Map — Aider-style dependency graph with importance ranking
// Scans virtualFS, extracts exports/imports/components, builds a dependency graph,
// and ranks files by connectivity (simplified PageRank)

// --- Types ---

export interface FileNode {
  path: string;
  imports: string[];         // Paths this file imports from
  exports: string[];         // Named exports
  defaultExport: string | null;  // Default export name
  componentName: string | null;  // React component name (if applicable)
  isClientComponent: boolean;
  lineCount: number;
}

export interface RepoMap {
  files: Map<string, FileNode>;
  importGraph: Map<string, Set<string>>;   // path -> set of paths it imports
  dependentGraph: Map<string, Set<string>>; // path -> set of paths that import it
  rankings: Map<string, number>;            // path -> importance score
  componentRegistry: ComponentEntry[];
  keyExports: KeyExport[];
  summary: string;
}

export interface ComponentEntry {
  name: string;
  path: string;
  props: string[];
  usedBy: string[];
}

export interface KeyExport {
  name: string;
  path: string;
  usedIn: number;
}

// --- Main Builder ---

export function buildRepoMap(virtualFS: Map<string, string>): RepoMap {
  const files = new Map<string, FileNode>();
  const importGraph = new Map<string, Set<string>>();
  const dependentGraph = new Map<string, Set<string>>();

  // Phase 1: Parse all files
  for (const [path, content] of virtualFS.entries()) {
    if (shouldSkipFile(path)) continue;
    const node = parseFile(path, content);
    files.set(path, node);
  }

  // Phase 2: Resolve imports to actual file paths
  for (const [path, node] of files.entries()) {
    const resolvedImports = new Set<string>();
    for (const imp of node.imports) {
      const resolved = resolveImport(imp, path, virtualFS);
      if (resolved) resolvedImports.add(resolved);
    }
    importGraph.set(path, resolvedImports);

    // Build reverse graph
    for (const dep of resolvedImports) {
      if (!dependentGraph.has(dep)) dependentGraph.set(dep, new Set());
      dependentGraph.get(dep)!.add(path);
    }
  }

  // Phase 3: Rank by importance (simplified PageRank)
  const rankings = rankFiles(files, dependentGraph);

  // Phase 4: Build component registry
  const componentRegistry = buildComponentRegistry(files, dependentGraph);

  // Phase 5: Build key exports list
  const keyExports = buildKeyExports(files, dependentGraph);

  // Phase 6: Generate compact summary
  const summary = generateSummary(files, rankings, componentRegistry, keyExports);

  return { files, importGraph, dependentGraph, rankings, componentRegistry, keyExports, summary };
}

// --- File Parser ---

function parseFile(path: string, content: string): FileNode {
  const lines = content.split("\n");
  const imports: string[] = [];
  const exports: string[] = [];
  let defaultExport: string | null = null;
  let componentName: string | null = null;
  const isClientComponent = content.includes('"use client"') || content.includes("'use client'");

  for (const line of lines) {
    const trimmed = line.trim();

    // Extract imports
    const importMatch = trimmed.match(/import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*]+)(?:\s*,\s*(?:\{[^}]*\}|[\w*]+))*\s+from\s+)?["']([^"']+)["']/);
    if (importMatch) {
      imports.push(importMatch[1]);
    }

    // Dynamic imports
    const dynamicImport = trimmed.match(/(?:import|require)\s*\(\s*["']([^"']+)["']/);
    if (dynamicImport) {
      imports.push(dynamicImport[1]);
    }

    // Extract named exports
    const namedExportMatch = trimmed.match(/export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/);
    if (namedExportMatch) {
      exports.push(namedExportMatch[1]);
      // Check if it's a React component (starts with uppercase)
      if (/^[A-Z]/.test(namedExportMatch[1]) && isReactFile(path)) {
        componentName = componentName || namedExportMatch[1];
      }
    }

    // Extract export { ... }
    const exportBlockMatch = trimmed.match(/export\s+\{([^}]+)\}/);
    if (exportBlockMatch) {
      const names = exportBlockMatch[1].split(",").map(n => n.trim().split(/\s+as\s+/).pop()!.trim());
      exports.push(...names.filter(Boolean));
    }

    // Default export
    const defaultExportMatch = trimmed.match(/export\s+default\s+(?:function\s+|class\s+)?(\w+)/);
    if (defaultExportMatch) {
      defaultExport = defaultExportMatch[1];
      if (/^[A-Z]/.test(defaultExportMatch[1]) && isReactFile(path)) {
        componentName = componentName || defaultExportMatch[1];
      }
    }

    // Arrow function component: const MyComponent = () => or const MyComponent: React.FC =
    if (!componentName && isReactFile(path)) {
      const arrowMatch = trimmed.match(/(?:export\s+)?(?:const|let)\s+([A-Z]\w+)\s*(?::\s*\w+(?:<[^>]*>)?\s*)?=\s*(?:\([^)]*\)|[^=])\s*=>/);
      if (arrowMatch) {
        componentName = arrowMatch[1];
        if (!exports.includes(arrowMatch[1]) && trimmed.startsWith("export")) {
          exports.push(arrowMatch[1]);
        }
      }
    }
  }

  return {
    path,
    imports,
    exports,
    defaultExport,
    componentName,
    isClientComponent,
    lineCount: lines.length,
  };
}

// --- Import Resolution ---

function resolveImport(importPath: string, fromFile: string, virtualFS: Map<string, string>): string | null {
  // Skip external packages
  if (!importPath.startsWith(".") && !importPath.startsWith("@/") && !importPath.startsWith("~/")) {
    return null;
  }

  // Handle @/ alias (Next.js convention)
  let resolved = importPath;
  if (importPath.startsWith("@/")) {
    resolved = "src/" + importPath.slice(2);
  } else if (importPath.startsWith("~/")) {
    resolved = importPath.slice(2);
  } else if (importPath.startsWith(".")) {
    // Relative path
    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    const parts = importPath.split("/");
    const dirParts = fromDir.split("/").filter(Boolean);

    for (const part of parts) {
      if (part === "..") dirParts.pop();
      else if (part !== ".") dirParts.push(part);
    }
    resolved = dirParts.join("/");
  }

  // Try different extensions
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (virtualFS.has(candidate)) return candidate;
  }

  return null;
}

// --- File Ranking (Simplified PageRank) ---

function rankFiles(files: Map<string, FileNode>, dependentGraph: Map<string, Set<string>>): Map<string, number> {
  const rankings = new Map<string, number>();
  const totalFiles = files.size;
  if (totalFiles === 0) return rankings;

  // Initialize with uniform score
  const initialScore = 1 / totalFiles;
  for (const path of files.keys()) {
    rankings.set(path, initialScore);
  }

  // Iterate PageRank (3 iterations is enough for small graphs)
  const damping = 0.85;
  for (let iter = 0; iter < 3; iter++) {
    const newRankings = new Map<string, number>();

    for (const path of files.keys()) {
      let incomingScore = 0;
      const dependents = dependentGraph.get(path);
      if (dependents) {
        for (const dep of dependents) {
          const depOutCount = files.get(dep)?.imports.length || 1;
          incomingScore += (rankings.get(dep) || 0) / depOutCount;
        }
      }
      newRankings.set(path, (1 - damping) / totalFiles + damping * incomingScore);
    }

    for (const [path, score] of newRankings) {
      rankings.set(path, score);
    }
  }

  // Boost scores for key files
  for (const [path, score] of rankings) {
    let boost = 1;
    if (path.includes("layout.tsx") || path.includes("layout.ts")) boost = 2;
    if (path === "package.json") boost = 1.5;
    if (path.includes("globals.css")) boost = 1.3;
    if (path.includes("/utils")) boost = 1.2;
    rankings.set(path, score * boost);
  }

  return rankings;
}

// --- Component Registry ---

function buildComponentRegistry(
  files: Map<string, FileNode>,
  dependentGraph: Map<string, Set<string>>,
): ComponentEntry[] {
  const components: ComponentEntry[] = [];

  for (const [path, node] of files.entries()) {
    if (!node.componentName) continue;

    // Extract props from the file content (basic regex)
    const props = extractComponentProps(path, files);
    const usedBy = Array.from(dependentGraph.get(path) || []);

    components.push({
      name: node.componentName,
      path,
      props,
      usedBy,
    });
  }

  // Sort by usage count (most used first)
  components.sort((a, b) => b.usedBy.length - a.usedBy.length);
  return components;
}

function extractComponentProps(path: string, files: Map<string, FileNode>): string[] {
  const node = files.get(path);
  if (!node) return [];

  // Look for Props interface/type in the exports
  const propsExport = node.exports.find(e =>
    e.endsWith("Props") || e === "Props"
  );

  return propsExport ? [propsExport] : [];
}

// --- Key Exports ---

function buildKeyExports(
  files: Map<string, FileNode>,
  dependentGraph: Map<string, Set<string>>,
): KeyExport[] {
  const exportMap = new Map<string, { name: string; path: string; count: number }>();

  for (const [path, node] of files.entries()) {
    for (const exp of node.exports) {
      const dependents = dependentGraph.get(path);
      const count = dependents?.size || 0;
      const key = `${exp}@${path}`;
      exportMap.set(key, { name: exp, path, count });
    }
    if (node.defaultExport) {
      const dependents = dependentGraph.get(path);
      const count = dependents?.size || 0;
      exportMap.set(`default@${path}`, { name: node.defaultExport, path, count });
    }
  }

  return Array.from(exportMap.values())
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(e => ({ name: e.name, path: e.path, usedIn: e.count }));
}

// --- Summary Generator ---

function generateSummary(
  files: Map<string, FileNode>,
  rankings: Map<string, number>,
  components: ComponentEntry[],
  keyExports: KeyExport[],
): string {
  const lines: string[] = [];

  // Top files by importance
  const topFiles = Array.from(rankings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  lines.push("## Repository Map");
  lines.push("");

  // Component Registry
  if (components.length > 0) {
    lines.push("### Components");
    for (const c of components.slice(0, 15)) {
      const usedByStr = c.usedBy.length > 0
        ? ` — used by: ${c.usedBy.map(p => p.split("/").pop()).join(", ")}`
        : " — unused";
      lines.push(`- ${c.name} (${c.path})${usedByStr}`);
    }
    lines.push("");
  }

  // Key Exports
  if (keyExports.length > 0) {
    lines.push("### Key Exports (most referenced)");
    for (const e of keyExports.slice(0, 10)) {
      lines.push(`- ${e.name} from ${e.path} — used in ${e.usedIn} files`);
    }
    lines.push("");
  }

  // Files ranked by importance
  lines.push("### Files by Importance");
  for (const [path, score] of topFiles) {
    const node = files.get(path);
    const tag = node?.componentName ? ` [component: ${node.componentName}]` : "";
    const client = node?.isClientComponent ? " [client]" : "";
    lines.push(`- ${path} (${node?.lineCount || 0} lines)${tag}${client}`);
  }
  lines.push("");

  // Client vs server components
  const clientComponents = Array.from(files.values()).filter(f => f.isClientComponent);
  if (clientComponents.length > 0) {
    lines.push(`### Client Components (${clientComponents.length})`);
    for (const c of clientComponents.slice(0, 10)) {
      lines.push(`- ${c.path}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// --- Helpers ---

function shouldSkipFile(path: string): boolean {
  return (
    path.includes("node_modules") ||
    path.includes(".next") ||
    path.includes("dist/") ||
    path.endsWith(".json") && !path.endsWith("package.json") && !path.endsWith("tsconfig.json") ||
    path.endsWith(".md") ||
    path.endsWith(".lock") ||
    path.endsWith(".ico") ||
    path.endsWith(".svg") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg")
  );
}

function isReactFile(path: string): boolean {
  return path.endsWith(".tsx") || path.endsWith(".jsx");
}

// --- Compact Summary for Prompt Injection ---

export function getCompactRepoMap(repoMap: RepoMap, maxTokens: number = 800): string {
  const lines: string[] = [];

  // Components (most useful for the agent)
  if (repoMap.componentRegistry.length > 0) {
    lines.push("## Existing Components (DO NOT recreate)");
    for (const c of repoMap.componentRegistry.slice(0, 12)) {
      lines.push(`- ${c.name} → ${c.path}`);
    }
  }

  // Key exports
  if (repoMap.keyExports.length > 0) {
    lines.push("\n## Key Exports (reuse these)");
    for (const e of repoMap.keyExports.slice(0, 8)) {
      lines.push(`- ${e.name} from ${e.path}`);
    }
  }

  // Top files
  const topFiles = Array.from(repoMap.rankings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  lines.push("\n## Important Files");
  for (const [path] of topFiles) {
    const node = repoMap.files.get(path);
    lines.push(`- ${path} (${node?.lineCount || 0}L)`);
  }

  let result = lines.join("\n");
  // Rough token estimate: ~4 chars per token
  if (result.length > maxTokens * 4) {
    result = result.slice(0, maxTokens * 4) + "\n...truncated";
  }

  return result;
}
