// Reflection Agent — Implements the Reflexion pattern for cross-task learning
// After each task execution, evaluates the result and writes a self-reflection
// that gets injected into subsequent task contexts

import { generateText } from "ai";
import { getFlashModel } from "../router";

// --- Types ---

export interface Reflection {
  taskId: number;
  taskDescription: string;
  success: boolean;
  reflection: string;  // 2-3 sentence self-reflection
  lessons: string[];   // Key takeaways for future tasks
}

export interface ReflectionContext {
  reflections: Reflection[];
}

// --- System Prompt ---

const REFLECTION_SYSTEM_PROMPT = `You are a reflective coding agent. After a task is completed (or failed), you analyze what happened and extract lessons.

## YOUR JOB
Write a 2-3 sentence reflection about the task execution. Focus on:
- What went well or poorly
- Why it succeeded or failed
- What should be done differently next time

## OUTPUT FORMAT
Respond with ONLY a JSON object:
{
  "reflection": "2-3 sentence reflection about the task",
  "lessons": ["lesson 1", "lesson 2"]
}

Keep lessons actionable and specific. Examples:
- "Always read layout.tsx before modifying it to preserve html/body tags"
- "Check if a component already exists before creating a new one"
- "Import paths with @/ resolve to src/, not the project root"`;

// --- Agent ---

export async function generateReflection(
  taskId: number,
  taskDescription: string,
  success: boolean,
  taskOutput: string,
  errors?: string[],
): Promise<Reflection> {
  const prompt = `## Task ${taskId}: ${taskDescription}
Status: ${success ? "SUCCEEDED" : "FAILED"}

## Task Output
${taskOutput.slice(0, 500)}

${errors && errors.length > 0 ? `## Errors Encountered\n${errors.join("\n")}` : "No errors."}

Reflect on this task execution.`;

  try {
    const result = await generateText({
      model: getFlashModel(),
      system: REFLECTION_SYSTEM_PROMPT,
      prompt,
    });

    const parsed = parseReflectionOutput(result.text || "");
    return {
      taskId,
      taskDescription,
      success,
      reflection: parsed.reflection,
      lessons: parsed.lessons,
    };
  } catch {
    // On failure, generate a basic reflection
    return {
      taskId,
      taskDescription,
      success,
      reflection: success
        ? `Task ${taskId} completed successfully.`
        : `Task ${taskId} failed. ${errors?.[0] || "Unknown error."}`,
      lessons: success
        ? []
        : ["Verify file paths before writing", "Read existing code before editing"],
    };
  }
}

// --- Format reflections for injection into prompts ---

export function formatReflectionsForPrompt(reflections: Reflection[], maxReflections: number = 5): string {
  if (reflections.length === 0) return "";

  const recent = reflections.slice(-maxReflections);
  const lines: string[] = ["\n## Lessons from Previous Tasks"];

  for (const r of recent) {
    if (r.lessons.length > 0) {
      lines.push(`- Task ${r.taskId} (${r.success ? "ok" : "FAILED"}): ${r.lessons.join("; ")}`);
    }
  }

  // Aggregate unique lessons
  const allLessons = new Set<string>();
  for (const r of recent) {
    for (const lesson of r.lessons) {
      allLessons.add(lesson);
    }
  }

  if (allLessons.size > 0) {
    lines.push("\n### Key Rules (learned from experience)");
    let count = 0;
    for (const lesson of allLessons) {
      if (count >= 8) break; // Max 8 lessons to keep prompt lean
      lines.push(`- ${lesson}`);
      count++;
    }
  }

  return lines.join("\n");
}

// --- Parser ---

function parseReflectionOutput(text: string): { reflection: string; lessons: string[] } {
  try {
    const parsed = JSON.parse(text);
    if (parsed.reflection) {
      return {
        reflection: parsed.reflection,
        lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
      };
    }
  } catch {
    // Try to extract JSON from markdown
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          reflection: parsed.reflection || text.slice(0, 200),
          lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
        };
      } catch { /* fall through */ }
    }

    // Try to find JSON object in text
    const braceMatch = text.match(/\{[\s\S]*"reflection"[\s\S]*\}/);
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0]);
        return {
          reflection: parsed.reflection || text.slice(0, 200),
          lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
        };
      } catch { /* fall through */ }
    }
  }

  // Fallback: use the raw text as the reflection
  return {
    reflection: text.slice(0, 300),
    lessons: [],
  };
}
