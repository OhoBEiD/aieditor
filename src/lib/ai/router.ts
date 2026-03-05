// Model Router - selects the right Gemini model and thinking level per task
// Uses Gemini 3.1 Pro for complex reasoning, Gemini 3 Flash for fast execution
// Enhanced with: fallback chains, temperature tuning, model-switching retry

import { createOpenAI } from "@ai-sdk/openai";
import { generateText as generateTextBase } from "ai";

// --- Model Configuration ---

const PRO_MODEL = process.env.GEMINI_PRO_MODEL || "google/gemini-3.1-pro-preview";
const FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || "google/gemini-3-flash-preview";

// Shared OpenRouter client
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// --- Types ---

export type TaskType = "classify" | "explore" | "plan" | "execute" | "verify" | "replan" | "reflect" | "fix";
export type Complexity = "simple" | "moderate" | "complex";
export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface ModelConfig {
  model: ReturnType<typeof openrouter.chat>;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  maxSteps: number;
  temperature?: number;
}

export interface ModelChain {
  primary: ModelConfig;
  fallback: ModelConfig | null;
}

// --- Temperature Profiles ---

const TEMPERATURE: Record<string, number> = {
  classify: 0.1,    // Deterministic classification
  explore: 0.2,     // Mostly deterministic search
  plan: 0.4,        // Creative planning
  execute: 0.1,     // Precise code generation
  verify: 0.1,      // Deterministic checking
  replan: 0.3,      // Creative fix strategies
  reflect: 0.3,     // Reflective analysis
  fix: 0.1,         // Precise code fixes
};

// --- Router ---

export function selectModel(task: TaskType, complexity: Complexity = "moderate"): ModelConfig {
  const temp = TEMPERATURE[task] ?? 0.2;

  switch (task) {
    case "classify":
      return {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: "minimal",
        maxSteps: 1,
        temperature: temp,
      };

    case "explore":
      return {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: "low",
        maxSteps: 6, // Kept tight for speed — exploration should be fast
        temperature: temp,
      };

    case "plan":
      if (complexity === "complex") {
        return {
          model: openrouter.chat(PRO_MODEL),
          modelId: PRO_MODEL,
          thinkingLevel: "high",
          maxSteps: 10,
          temperature: temp,
        };
      }
      return {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: "medium",
        maxSteps: 8,
        temperature: temp,
      };

    case "execute":
      if (complexity === "complex") {
        return {
          model: openrouter.chat(PRO_MODEL),
          modelId: PRO_MODEL,
          thinkingLevel: "medium",
          maxSteps: 20,
          temperature: temp,
        };
      }
      return {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: "low",
        maxSteps: 15,
        temperature: temp,
      };

    case "verify":
      return {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: "low",
        maxSteps: 5,
        temperature: temp,
      };

    case "replan":
      return {
        model: openrouter.chat(PRO_MODEL),
        modelId: PRO_MODEL,
        thinkingLevel: "high",
        maxSteps: 5,
        temperature: temp,
      };

    case "reflect":
      return {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: "low",
        maxSteps: 1,
        temperature: temp,
      };

    case "fix":
      return {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: "medium",
        maxSteps: 12,
        temperature: temp,
      };

    default:
      return {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: "medium",
        maxSteps: 10,
        temperature: temp,
      };
  }
}

// --- Fallback Chain ---

export function selectModelWithFallback(task: TaskType, complexity: Complexity = "moderate"): ModelChain {
  const primary = selectModel(task, complexity);

  // If primary is Pro, fallback to Flash
  if (primary.modelId === PRO_MODEL) {
    return {
      primary,
      fallback: {
        model: openrouter.chat(FLASH_MODEL),
        modelId: FLASH_MODEL,
        thinkingLevel: primary.thinkingLevel === "high" ? "medium" : primary.thinkingLevel,
        maxSteps: primary.maxSteps,
        temperature: primary.temperature,
      },
    };
  }

  // Flash has no fallback (it's already the cheapest)
  return { primary, fallback: null };
}

// --- Retry with Model Switching ---

export async function generateTextWithFallback(
  options: Parameters<typeof generateTextBase>[0],
  chain: ModelChain,
  maxRetries: number = 2,
  delayMs: number = 2000,
): ReturnType<typeof generateTextBase> {
  let lastError: unknown;

  // Try primary model
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateTextBase(options);
    } catch (err: any) {
      lastError = err;
      const status = err?.statusCode || err?.data?.error?.code;
      const isRetryable = status === 500 || status === 502 || status === 503 || status === 429
        || err?.message?.includes("Internal Server Error")
        || err?.message?.includes("Invalid JSON response");

      if (!isRetryable || attempt === maxRetries) break;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }

  // Try fallback model if available
  if (chain.fallback) {
    console.warn(`[Router] Primary model ${chain.primary.modelId} failed, falling back to ${chain.fallback.modelId}`);
    try {
      return await generateTextBase({
        ...options,
        model: chain.fallback.model,
      });
    } catch (fallbackErr: any) {
      console.error(`[Router] Fallback model also failed:`, fallbackErr.message);
      // Throw the original error as it's more informative
    }
  }

  throw lastError;
}

// --- Convenience ---

export function getFlashModel() {
  return openrouter.chat(FLASH_MODEL);
}

export function getProModel() {
  return openrouter.chat(PRO_MODEL);
}

// Export model IDs for logging
export const MODEL_IDS = { PRO: PRO_MODEL, FLASH: FLASH_MODEL };
