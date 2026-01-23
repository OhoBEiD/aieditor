import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Tool to run shell commands (npm, etc.)
 */
export const runCommandTool = createTool({
  id: "run_command",
  description: "Execute a shell command in the project. Use for npm install, npm run build, etc.",
  inputSchema: z.object({
    command: z.string().describe("The command to run (e.g., 'npm install lodash')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stdout: z.string(),
    stderr: z.string().optional(),
    exitCode: z.number(),
  }),
  execute: async ({ command }) => {
    // Will be executed in WebContainer
    return {
      success: true,
      stdout: "",
      exitCode: 0,
    };
  },
});

/**
 * Tool to search for text across files
 */
export const searchFilesTool = createTool({
  id: "search_files",
  description: "Search for text/pattern across all project files. Use to find where something is defined or used.",
  inputSchema: z.object({
    pattern: z.string().describe("Text or regex pattern to search for"),
    filePattern: z.string().optional().describe("Glob pattern to filter files (e.g., '*.tsx')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    matches: z.array(z.object({
      file: z.string(),
      line: z.number(),
      content: z.string(),
    })),
  }),
  execute: async ({ pattern }) => {
    return {
      success: true,
      matches: [], // Populated at runtime
    };
  },
});
