// Persistent Knowledge Base ("Brain") — Project-scoped learning across sessions
// Inspired by Antigravity's .gemini/antigravity/brain/ and Devin's wiki
// Stores patterns, preferences, mistakes, and architectural decisions in Supabase

import type { Reflection } from "../agents/ReflectionAgent";

// --- Types ---

export interface BrainEntry {
  id: string;
  project_id: string;
  category: BrainCategory;
  content: string;
  confidence: number; // 0-1, increases with repeated observations
  created_at: string;
  last_used_at: string;
}

export type BrainCategory =
  | "pattern"       // Code patterns: "Uses cn() for conditional classes"
  | "preference"    // User preferences: "Prefers minimal comments"
  | "mistake"       // Lessons learned: "Always add 'use client' with useState"
  | "architecture"  // Arch decisions: "Uses Zustand for state management"
  | "component";    // Component knowledge: "Hero uses GSAP timeline with stagger"

// --- Load Brain ---

/**
 * Load all brain entries for a project from Supabase.
 * Returns empty array if Supabase is unavailable or project has no entries.
 */
export async function loadBrain(projectId: string): Promise<BrainEntry[]> {
  if (!projectId) return [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const response = await fetch(
      `${url}/rest/v1/project_brain?project_id=eq.${encodeURIComponent(projectId)}&order=confidence.desc,last_used_at.desc&limit=50`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// --- Save to Brain ---

/**
 * Save a new entry to the brain. Checks for duplicates first.
 */
export async function saveToBrain(
  projectId: string,
  category: BrainCategory,
  content: string,
  confidence: number = 0.5,
): Promise<void> {
  if (!projectId || !content) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    // Check for existing similar entry
    const existing = await loadBrain(projectId);
    const duplicate = existing.find(e =>
      e.category === category && contentSimilar(e.content, content),
    );

    if (duplicate) {
      // Boost confidence of existing entry
      await fetch(
        `${url}/rest/v1/project_brain?id=eq.${duplicate.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            confidence: Math.min(1, duplicate.confidence + 0.15),
            last_used_at: new Date().toISOString(),
          }),
        },
      );
      return;
    }

    // Insert new entry
    await fetch(`${url}/rest/v1/project_brain`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        project_id: projectId,
        category,
        content,
        confidence,
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Silently fail — brain is non-critical
  }
}

// --- Extract Learnings from Reflections ---

/**
 * After a session, extract high-value learnings from reflections
 * and save them to the brain.
 */
export async function extractAndSaveLearnings(
  projectId: string,
  reflections: Reflection[],
  existingBrain: BrainEntry[],
): Promise<Array<{ category: BrainCategory; content: string; confidence: number }>> {
  const saved: Array<{ category: BrainCategory; content: string; confidence: number }> = [];

  for (const reflection of reflections) {
    for (const lesson of reflection.lessons) {
      const category = classifyLesson(lesson);
      const alreadyKnown = existingBrain.some(e =>
        contentSimilar(e.content, lesson),
      );

      if (!alreadyKnown) {
        // New lesson: save with base confidence
        const confidence = reflection.success ? 0.6 : 0.8; // Failure lessons are more valuable
        await saveToBrain(projectId, category, lesson, confidence);
        saved.push({ category, content: lesson, confidence });
      } else {
        // Known lesson: boost confidence via saveToBrain's duplicate handling
        await saveToBrain(projectId, category, lesson);
      }
    }
  }

  return saved;
}

// --- Format Brain for Prompt Injection ---

/**
 * Format brain entries for injection into the system prompt.
 * Groups by category, prioritizes high-confidence entries.
 */
export function formatBrainForPrompt(
  entries: BrainEntry[],
  maxTokens: number = 1500,
): string {
  if (entries.length === 0) return "";

  // Sort by confidence (highest first), then by recency
  const sorted = [...entries].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime();
  });

  const lines: string[] = ["## LEARNED FROM PREVIOUS SESSIONS (project-specific knowledge)"];
  let tokenEstimate = 20; // Header

  // Group by category
  const grouped = new Map<BrainCategory, BrainEntry[]>();
  for (const entry of sorted) {
    const existing = grouped.get(entry.category) || [];
    existing.push(entry);
    grouped.set(entry.category, existing);
  }

  const categoryLabels: Record<BrainCategory, string> = {
    mistake: "Mistakes to Avoid",
    architecture: "Architecture Decisions",
    pattern: "Code Patterns",
    component: "Component Knowledge",
    preference: "Preferences",
  };

  // Mistakes first (most important to avoid repeating)
  const categoryOrder: BrainCategory[] = ["mistake", "architecture", "pattern", "component", "preference"];

  for (const category of categoryOrder) {
    const entries = grouped.get(category);
    if (!entries || entries.length === 0) continue;

    const label = categoryLabels[category];
    lines.push(`### ${label}`);
    tokenEstimate += 5;

    for (const entry of entries.slice(0, 5)) {
      const confidenceTag = entry.confidence >= 0.8 ? " [high confidence]" : "";
      const line = `- ${entry.content}${confidenceTag}`;
      const lineTokens = Math.ceil(line.length / 4);

      if (tokenEstimate + lineTokens > maxTokens) break;

      lines.push(line);
      tokenEstimate += lineTokens;
    }

    if (tokenEstimate > maxTokens) break;
  }

  return lines.join("\n");
}

// --- Helpers ---

/**
 * Check if two content strings are similar enough to be considered duplicates.
 * Uses simple word overlap heuristic.
 */
function contentSimilar(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  const similarity = overlap / Math.min(wordsA.size, wordsB.size);
  return similarity > 0.6;
}

/**
 * Classify a lesson string into a brain category.
 */
function classifyLesson(lesson: string): BrainCategory {
  const lower = lesson.toLowerCase();

  if (lower.includes("error") || lower.includes("mistake") || lower.includes("should have") ||
      lower.includes("forgot") || lower.includes("missed") || lower.includes("avoid")) {
    return "mistake";
  }

  if (lower.includes("import") || lower.includes("component") || lower.includes("reuse") ||
      lower.includes("existing")) {
    return "component";
  }

  if (lower.includes("architecture") || lower.includes("structure") || lower.includes("state management") ||
      lower.includes("database") || lower.includes("api")) {
    return "architecture";
  }

  if (lower.includes("prefer") || lower.includes("style") || lower.includes("convention") ||
      lower.includes("always") || lower.includes("never")) {
    return "preference";
  }

  return "pattern";
}
