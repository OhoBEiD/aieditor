import { Mastra } from "@mastra/core";
import { codingAgent, fastCodingAgent, plannerAgent } from "./agents/coding-agent";

/**
 * Mastra instance with all agents configured
 */
export const mastra = new Mastra({
  agents: {
    codingAgent,
    fastCodingAgent,
    plannerAgent,
  },
});

// Re-export for convenience
export { codingAgent, fastCodingAgent, plannerAgent } from "./agents/coding-agent";
export * from "./tools";
