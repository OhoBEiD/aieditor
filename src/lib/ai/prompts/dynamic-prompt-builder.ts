// Dynamic Prompt Builder — Generates project-aware system prompt sections
// Instead of static prompts, this adapts to the actual project being edited
// by analyzing the repo map and exploration results

import type { RepoMap } from "../context/repo-map";
import type { ExplorationResult } from "../agents/ExploreAgent";

// --- Types ---

export interface DynamicPromptContext {
  repoMap: RepoMap | null;
  exploration: ExplorationResult | null;
  virtualFS: Map<string, string>;
}

// --- Main Builder ---

export function buildDynamicSystemPrompt(
  basePrompt: string,
  context: DynamicPromptContext,
): string {
  const sections: string[] = [basePrompt];

  // Detect and inject project patterns
  const patterns = detectProjectPatterns(context.virtualFS);
  if (patterns.length > 0) {
    sections.push(formatPatterns(patterns));
  }

  // Inject component registry from repo map
  if (context.repoMap && context.repoMap.componentRegistry.length > 0) {
    sections.push(formatComponentRegistry(context.repoMap));
  }

  // Inject key exports
  if (context.repoMap && context.repoMap.keyExports.length > 0) {
    sections.push(formatKeyExports(context.repoMap));
  }

  // Inject exploration suggestions
  if (context.exploration && context.exploration.suggestions.length > 0) {
    sections.push(formatSuggestions(context.exploration));
  }

  return sections.join("\n\n");
}

// --- Pattern Detection ---

interface ProjectPattern {
  category: string;
  description: string;
}

function detectProjectPatterns(virtualFS: Map<string, string>): ProjectPattern[] {
  const patterns: ProjectPattern[] = [];

  // Check for styling approach
  const hasGlobalsCss = virtualFS.has("src/app/globals.css");
  const globalsCss = virtualFS.get("src/app/globals.css") || "";

  if (hasGlobalsCss && globalsCss.includes("--")) {
    // Extract CSS variable names
    const cssVars = extractCSSVariables(globalsCss);
    if (cssVars.length > 0) {
      patterns.push({
        category: "Styling",
        description: `CSS variables defined in globals.css: ${cssVars.slice(0, 10).join(", ")}`,
      });
    }
  }

  // Check for Tailwind config
  const tailwindConfig = virtualFS.get("tailwind.config.ts") || virtualFS.get("tailwind.config.js") || "";
  if (tailwindConfig) {
    const customColors = extractTailwindColors(tailwindConfig);
    if (customColors.length > 0) {
      patterns.push({
        category: "Styling",
        description: `Custom Tailwind colors: ${customColors.join(", ")}`,
      });
    }
  }

  // Check for font configuration
  const layoutFile = virtualFS.get("src/app/layout.tsx") || virtualFS.get("src/app/layout.ts") || "";
  if (layoutFile) {
    const fonts = extractFonts(layoutFile);
    if (fonts.length > 0) {
      patterns.push({
        category: "Typography",
        description: `Fonts configured in layout: ${fonts.join(", ")} — DO NOT reconfigure, already set up`,
      });
    }
  }

  // Check for utility functions
  const utilsFile = virtualFS.get("src/lib/utils.ts") || virtualFS.get("src/lib/utils.tsx") || "";
  if (utilsFile) {
    const utilExports = extractExportNames(utilsFile);
    if (utilExports.length > 0) {
      patterns.push({
        category: "Utilities",
        description: `Available utilities from @/lib/utils: ${utilExports.join(", ")}`,
      });
    }
  }

  // Check for animation library usage
  let hasGsap = false;
  let hasFramerMotion = false;
  let hasLenis = false;
  let hasR3F = false;
  let hasReactSpring = false;
  let hasAnimeJs = false;
  for (const [path, content] of virtualFS.entries()) {
    if (content.includes("gsap") || content.includes("ScrollTrigger")) hasGsap = true;
    if (content.includes("framer-motion") || content.includes("motion/react") || content.includes("from \"motion\"")) hasFramerMotion = true;
    if (content.includes("lenis") || content.includes("@studio-freight/lenis")) hasLenis = true;
    if (content.includes("@react-three/fiber") || content.includes("from \"three\"")) hasR3F = true;
    if (content.includes("@react-spring")) hasReactSpring = true;
    if (content.includes("animejs") || content.includes("from \"animejs\"")) hasAnimeJs = true;
  }
  if (hasGsap) {
    patterns.push({
      category: "Animation",
      description: 'GSAP + ScrollTrigger used — always guard with typeof window !== "undefined" in client components',
    });
  }
  if (hasFramerMotion) {
    patterns.push({
      category: "Animation",
      description: "Motion/Framer Motion available — use for component animations, page transitions, and layout animations",
    });
  }
  if (hasLenis) {
    patterns.push({
      category: "Animation",
      description: "Lenis smooth scroll active — use for scroll-linked animations and parallax effects",
    });
  }
  if (hasR3F) {
    patterns.push({
      category: "Animation",
      description: "Three.js/R3F available — use Canvas from @react-three/fiber for 3D scenes, guard with typeof window",
    });
  }
  if (hasReactSpring) {
    patterns.push({
      category: "Animation",
      description: "React Spring available — use useSpring/useTransition from @react-spring/web for physics-based animations",
    });
  }
  if (hasAnimeJs) {
    patterns.push({
      category: "Animation",
      description: "Anime.js available — use for timeline sequences, stagger animations, and SVG morphing",
    });
  }

  // Check for state management
  const packageJson = virtualFS.get("package.json") || "";
  if (packageJson.includes("zustand")) {
    patterns.push({ category: "State", description: "Zustand for state management" });
  } else if (packageJson.includes("@reduxjs/toolkit")) {
    patterns.push({ category: "State", description: "Redux Toolkit for state management" });
  }

  // Check for Supabase
  if (packageJson.includes("supabase")) {
    patterns.push({
      category: "Backend",
      description: "Supabase integrated — check for existing client in @/lib/supabase",
    });
  }

  // Check for app router vs pages router
  const hasAppDir = Array.from(virtualFS.keys()).some(k => k.startsWith("src/app/") || k.startsWith("app/"));
  if (hasAppDir) {
    patterns.push({
      category: "Framework",
      description: "Next.js App Router — use 'use client' for interactive components, server components by default",
    });
  }

  return patterns;
}

// --- Formatters ---

function formatPatterns(patterns: ProjectPattern[]): string {
  const lines = ["## THIS PROJECT'S PATTERNS (auto-detected — follow these)"];

  const grouped = new Map<string, string[]>();
  for (const p of patterns) {
    const existing = grouped.get(p.category) || [];
    existing.push(p.description);
    grouped.set(p.category, existing);
  }

  for (const [category, descriptions] of grouped) {
    lines.push(`### ${category}`);
    for (const desc of descriptions) {
      lines.push(`- ${desc}`);
    }
  }

  return lines.join("\n");
}

function formatComponentRegistry(repoMap: RepoMap): string {
  const lines = ["## EXISTING COMPONENTS (DO NOT recreate — import and reuse)"];

  for (const c of repoMap.componentRegistry.slice(0, 12)) {
    const importPath = c.path.replace(/^src\//, "@/").replace(/\.(tsx|ts|jsx|js)$/, "");
    lines.push(`- ${c.name} → import from "${importPath}"`);
  }

  return lines.join("\n");
}

function formatKeyExports(repoMap: RepoMap): string {
  const lines = ["## KEY EXPORTS (reuse these instead of reimplementing)"];

  for (const e of repoMap.keyExports.slice(0, 8)) {
    const importPath = e.path.replace(/^src\//, "@/").replace(/\.(tsx|ts|jsx|js)$/, "");
    lines.push(`- ${e.name} from "${importPath}" (used in ${e.usedIn} files)`);
  }

  return lines.join("\n");
}

function formatSuggestions(exploration: ExplorationResult): string {
  const lines = ["## CODEBASE SUGGESTIONS"];
  for (const s of exploration.suggestions.slice(0, 5)) {
    lines.push(`- ${s}`);
  }
  return lines.join("\n");
}

// --- Extraction Helpers ---

function extractCSSVariables(css: string): string[] {
  const vars: string[] = [];
  const matches = css.matchAll(/--([a-zA-Z][\w-]+)\s*:/g);
  for (const match of matches) {
    vars.push(`--${match[1]}`);
  }
  return [...new Set(vars)];
}

function extractTailwindColors(config: string): string[] {
  const colors: string[] = [];
  // Simple regex to find color definitions in tailwind config
  const colorMatches = config.matchAll(/['"]?([\w-]+)['"]?\s*:\s*['"]#[0-9a-fA-F]+['"]/g);
  for (const match of colorMatches) {
    colors.push(match[1]);
  }
  return [...new Set(colors)].slice(0, 10);
}

function extractFonts(layoutContent: string): string[] {
  const fonts: string[] = [];
  // Google fonts imports
  const googleFonts = layoutContent.matchAll(/(\w+)\s*=\s*(?:Inter|JetBrains_Mono|Space_Grotesk|Oxanium|Poppins|Roboto|Montserrat|Lato|Open_Sans|Raleway|Playfair_Display|Source_Code_Pro)\(/g);
  for (const match of googleFonts) {
    fonts.push(match[1]);
  }
  // Also check for direct font name references
  const fontNames = layoutContent.matchAll(/(?:Inter|JetBrains_Mono|Space_Grotesk|Oxanium|Poppins|Roboto|Montserrat|Lato|Open_Sans|Raleway|Playfair_Display|Source_Code_Pro)/g);
  for (const match of fontNames) {
    fonts.push(match[0].replace(/_/g, " "));
  }
  return [...new Set(fonts)];
}

function extractExportNames(content: string): string[] {
  const exports: string[] = [];
  const matches = content.matchAll(/export\s+(?:const|function|class|type|interface)\s+(\w+)/g);
  for (const match of matches) {
    exports.push(match[1]);
  }
  return exports;
}
