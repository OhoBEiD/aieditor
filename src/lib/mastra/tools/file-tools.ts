import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Tool to write/create a file
 */
export const writeFileTool = createTool({
  id: "write_file",
  description: "Create or overwrite a file with the given content. Use this to create new files or completely replace existing file contents.",
  inputSchema: z.object({
    path: z.string().describe("The file path relative to project root (e.g., 'src/components/Button.tsx')"),
    content: z.string().describe("The complete content to write to the file"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    message: z.string(),
  }),
  execute: async ({ path, content }) => {
    // This will be handled by the frontend/WebContainer
    return {
      success: true,
      path,
      message: `File ${path} written successfully`,
    };
  },
});

/**
 * Tool to read a file's contents
 */
export const readFileTool = createTool({
  id: "read_file",
  description: "Read the contents of a file. Use this to understand existing code before making changes.",
  inputSchema: z.object({
    path: z.string().describe("The file path relative to project root"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    content: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ path }) => {
    // Will be populated with actual file content from context
    return {
      success: true,
      content: "", // Populated at runtime
    };
  },
});

/**
 * Tool to modify specific parts of a file (search and replace)
 */
export const modifyFileTool = createTool({
  id: "modify_file",
  description: "Modify a file by replacing specific text. Use this for surgical edits instead of rewriting entire files.",
  inputSchema: z.object({
    path: z.string().describe("The file path relative to project root"),
    oldText: z.string().describe("The exact text to find and replace"),
    newText: z.string().describe("The new text to replace with"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    message: z.string(),
  }),
  execute: async ({ path, oldText, newText }) => {
    return {
      success: true,
      path,
      message: `Modified ${path}: replaced text`,
    };
  },
});

/**
 * Tool to delete a file
 */
export const deleteFileTool = createTool({
  id: "delete_file",
  description: "Delete a file from the project. Use with caution.",
  inputSchema: z.object({
    path: z.string().describe("The file path to delete"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    message: z.string(),
  }),
  execute: async ({ path }) => {
    return {
      success: true,
      path,
      message: `File ${path} deleted`,
    };
  },
});

/**
 * Tool to list files in a directory
 */
export const listFilesTool = createTool({
  id: "list_files",
  description: "List all files in a directory. Use this to explore the project structure.",
  inputSchema: z.object({
    path: z.string().default(".").describe("Directory path to list (defaults to root)"),
    recursive: z.boolean().default(false).describe("Whether to list recursively"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    files: z.array(z.string()),
  }),
  execute: async ({ path }) => {
    return {
      success: true,
      files: [], // Populated at runtime from context
    };
  },
});
