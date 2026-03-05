// Enhanced tool definitions for the AI agent
// These tools operate on a virtual filesystem (Map<string, string>)
// Key design: search before read, read before write, verify after write

import { z } from "zod";

// --- Types ---

export interface DatabaseContext {
  siteId: string;
  baseUrl: string;
}

export interface GrepMatch {
  path: string;
  lineNumber: number;
  lineContent: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface GlobResult {
  path: string;
  sizeChars: number;
  lineCount: number;
  firstLine: string;
}

export interface FileOperation {
  type: "write" | "modify" | "delete";
  path: string;
  content?: string;
  oldText?: string;
  newText?: string;
}

// --- Helpers ---

function normalizePath(p: string): string {
  return (p || "").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

function matchGlob(filePath: string, pattern: string): boolean {
  // Simple glob matching: **, *, ?
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${regexStr}$`).test(filePath);
}

function getLines(content: string): string[] {
  return content.split("\n");
}

// --- Tool Factory ---

export function createEnhancedTools(virtualFS: Map<string, string>, dbContext?: DatabaseContext) {
  const tools: Record<string, any> = {
    // ===== SEARCH TOOLS (use these FIRST) =====

    grep_files: {
      description:
        "Search for a text pattern across all project files. Returns matching lines with context. Use this FIRST to find relevant code before reading files.",
      inputSchema: z.object({
        pattern: z
          .string()
          .describe("Text or regex pattern to search for (e.g., 'export default', 'className.*hero', 'import.*from')"),
        glob: z
          .string()
          .optional()
          .describe("Optional file glob filter (e.g., '*.tsx', 'src/components/**')"),
        maxResults: z
          .number()
          .optional()
          .default(20)
          .describe("Max results to return (default 20)"),
        contextLines: z
          .number()
          .optional()
          .default(2)
          .describe("Lines of context before/after each match (default 2)"),
      }),
      execute: async ({
        pattern,
        glob,
        maxResults = 20,
        contextLines = 2,
      }: {
        pattern: string;
        glob?: string;
        maxResults?: number;
        contextLines?: number;
      }) => {
        const matches: GrepMatch[] = [];
        let regex: RegExp;
        try {
          regex = new RegExp(pattern, "gi");
        } catch {
          // Fall back to literal string search if regex is invalid
          regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        }

        for (const [filePath, content] of virtualFS.entries()) {
          if (glob && !matchGlob(filePath, glob)) continue;

          const lines = getLines(content);
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              regex.lastIndex = 0; // Reset regex state
              matches.push({
                path: filePath,
                lineNumber: i + 1,
                lineContent: lines[i].trim(),
                contextBefore: lines
                  .slice(Math.max(0, i - contextLines), i)
                  .map((l) => l.trim()),
                contextAfter: lines
                  .slice(i + 1, i + 1 + contextLines)
                  .map((l) => l.trim()),
              });
              if (matches.length >= maxResults) break;
            }
          }
          if (matches.length >= maxResults) break;
        }

        if (matches.length === 0) {
          return {
            matches: [],
            message: `No matches found for "${pattern}"${glob ? ` in ${glob}` : ""}`,
          };
        }

        // Format results compactly for token efficiency
        const formatted = matches.map((m) => ({
          file: m.path,
          line: m.lineNumber,
          match: m.lineContent.slice(0, 200),
          context:
            m.contextBefore.length > 0 || m.contextAfter.length > 0
              ? [...m.contextBefore.map((l) => `  ${l.slice(0, 150)}`), `> ${m.lineContent.slice(0, 150)}`, ...m.contextAfter.map((l) => `  ${l.slice(0, 150)}`)].join("\n")
              : undefined,
        }));

        return { matches: formatted, total: matches.length };
      },
    },

    glob_files: {
      description:
        "Find files matching a glob pattern. Returns file paths with metadata (size, line count). Use this to understand project structure without reading file contents.",
      inputSchema: z.object({
        pattern: z
          .string()
          .describe(
            "Glob pattern (e.g., 'src/**/*.tsx', '*.config.*', 'src/components/**')"
          ),
      }),
      execute: async ({ pattern }: { pattern: string }) => {
        const results: GlobResult[] = [];

        for (const [filePath, content] of virtualFS.entries()) {
          if (matchGlob(filePath, pattern)) {
            const lines = getLines(content);
            results.push({
              path: filePath,
              sizeChars: content.length,
              lineCount: lines.length,
              firstLine: lines[0]?.trim().slice(0, 100) || "",
            });
          }
        }

        // Sort by path for consistent output
        results.sort((a, b) => a.path.localeCompare(b.path));

        if (results.length === 0) {
          // Show available files to help the agent
          const allFiles = Array.from(virtualFS.keys()).sort();
          return {
            files: [],
            message: `No files match "${pattern}". Available files: ${allFiles.slice(0, 30).join(", ")}`,
          };
        }

        return { files: results, total: results.length };
      },
    },

    list_files: {
      description:
        "List all files in the project or a specific directory. Returns file paths and sizes.",
      inputSchema: z.object({
        directory: z
          .string()
          .optional()
          .default("")
          .describe("Directory prefix to filter (e.g., 'src/components')"),
      }),
      execute: async ({ directory = "" }: { directory?: string }) => {
        const prefix = normalizePath(directory);
        const allFiles = Array.from(virtualFS.keys()).sort();
        const filtered = prefix
          ? allFiles.filter((f) => f.startsWith(prefix))
          : allFiles;

        const results = filtered.map((f) => ({
          path: f,
          size: virtualFS.get(f)?.length || 0,
        }));

        return {
          files: results.length > 0 ? results : [],
          total: results.length,
          message:
            results.length === 0
              ? prefix
                ? `No files in "${prefix}". All files: ${allFiles.slice(0, 20).join(", ")}`
                : "Empty project - create files with write_file"
              : undefined,
        };
      },
    },

    // ===== READ TOOLS =====

    read_file: {
      description:
        "Read file content. Supports line ranges for targeted reading. PREFER using startLine/endLine instead of reading entire files.",
      inputSchema: z.object({
        path: z.string().describe("File path to read"),
        startLine: z
          .number()
          .optional()
          .describe("Start line number (1-based, inclusive)"),
        endLine: z
          .number()
          .optional()
          .describe("End line number (1-based, inclusive)"),
      }),
      execute: async ({
        path: filePath,
        startLine,
        endLine,
      }: {
        path: string;
        startLine?: number;
        endLine?: number;
      }) => {
        const normalized = normalizePath(filePath);

        // Try exact match first, then fuzzy
        let content = virtualFS.get(normalized);
        if (!content) {
          for (const [key, val] of virtualFS.entries()) {
            if (key.endsWith(normalized) || normalized.endsWith(key)) {
              content = val;
              break;
            }
          }
        }

        if (!content) {
          const available = Array.from(virtualFS.keys())
            .filter((k) => k.includes(normalized.split("/").pop() || ""))
            .slice(0, 5);
          return {
            error: `File not found: ${filePath}`,
            suggestions: available.length > 0 ? available : undefined,
          };
        }

        const lines = getLines(content);
        const totalLines = lines.length;

        // Apply line range if specified
        if (startLine !== undefined || endLine !== undefined) {
          const start = Math.max(1, startLine || 1) - 1;
          const end = Math.min(totalLines, endLine || totalLines);
          const sliced = lines.slice(start, end);

          // Prepend line numbers for easier reference
          const numbered = sliced.map(
            (line, i) => `${start + i + 1}|${line}`
          );
          return {
            content: numbered.join("\n"),
            totalLines,
            range: { start: start + 1, end },
          };
        }

        // For full file reads, prepend line numbers
        const numbered = lines.map((line, i) => `${i + 1}|${line}`);
        return { content: numbered.join("\n"), totalLines };
      },
    },

    // ===== WRITE TOOLS =====

    write_file: {
      description:
        "Create or overwrite a file with complete content. Use for new files or full rewrites.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("File path (e.g., 'src/components/Hero.tsx')"),
        content: z.string().describe("Complete file content"),
      }),
      execute: async ({
        path,
        content,
      }: {
        path: string;
        content: string;
      }) => {
        const normalized = normalizePath(path);
        virtualFS.set(normalized, content);
        const lineCount = getLines(content).length;
        return {
          success: true,
          path: normalized,
          operation: "write",
          lineCount,
        };
      },
    },

    edit_file: {
      description:
        "Edit a file by replacing specific text. The oldText must be an EXACT, UNIQUE match in the file. Read the file first to get the exact text.",
      inputSchema: z.object({
        path: z.string().describe("File path to modify"),
        oldText: z
          .string()
          .describe("Exact text to find and replace (must be unique in the file)"),
        newText: z.string().describe("Replacement text"),
      }),
      execute: async ({
        path,
        oldText,
        newText,
      }: {
        path: string;
        oldText: string;
        newText: string;
      }) => {
        const normalized = normalizePath(path);
        const content = virtualFS.get(normalized);

        if (!content) {
          return {
            success: false,
            error: `File not found: ${path}. Use list_files to see available files.`,
          };
        }

        // Check for uniqueness
        const occurrences = content.split(oldText).length - 1;
        if (occurrences === 0) {
          // Try to find similar text for a helpful error
          const lines = getLines(content);
          const firstWords = oldText.trim().split(/\s+/).slice(0, 3).join(" ");
          const similarLines = lines
            .map((line, i) => ({ line: line.trim(), num: i + 1 }))
            .filter((l) => l.line.includes(firstWords))
            .slice(0, 3);

          return {
            success: false,
            error: `Text not found in ${path}. Use read_file to see current content.`,
            hint:
              similarLines.length > 0
                ? `Similar lines found: ${similarLines.map((l) => `Line ${l.num}: "${l.line.slice(0, 80)}"`).join("; ")}`
                : undefined,
          };
        }

        if (occurrences > 1) {
          return {
            success: false,
            error: `oldText matches ${occurrences} locations in ${path}. Provide more surrounding context to make it unique.`,
          };
        }

        // Apply the edit
        const newContent = content.replace(oldText, newText);
        virtualFS.set(normalized, newContent);

        // Return the modified region with context
        const newLines = getLines(newContent);
        const editStart = newContent.indexOf(newText);
        const editLineNum =
          newContent.substring(0, editStart).split("\n").length;
        const contextStart = Math.max(0, editLineNum - 3);
        const contextEnd = Math.min(
          newLines.length,
          editLineNum + newText.split("\n").length + 2
        );
        const preview = newLines
          .slice(contextStart, contextEnd)
          .map((l, i) => `${contextStart + i + 1}|${l}`)
          .join("\n");

        return {
          success: true,
          path: normalized,
          operation: "modify",
          preview,
        };
      },
    },

    delete_file: {
      description: "Delete a file from the project.",
      inputSchema: z.object({
        path: z.string().describe("File path to delete"),
      }),
      execute: async ({ path }: { path: string }) => {
        const normalized = normalizePath(path);
        if (!virtualFS.has(normalized)) {
          return { success: false, error: `File not found: ${path}` };
        }
        virtualFS.delete(normalized);
        return { success: true, path: normalized, operation: "delete" };
      },
    },

    // ===== WEB TOOLS =====

    web_search: {
      description:
        "Search the web for documentation, APIs, or current information. Limit to 2-3 searches per task.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        maxResults: z
          .number()
          .optional()
          .default(5)
          .describe("Max results (default 5)"),
      }),
      execute: async ({
        query,
        maxResults = 5,
      }: {
        query: string;
        maxResults?: number;
      }) => {
        // Delegate to existing web search implementation
        const { webSearch } = await import("./web");
        const result = await webSearch(query, maxResults);
        if (!result.success) return { error: result.error };
        return JSON.parse(result.data!);
      },
    },

    web_scrape: {
      description:
        "Fetch readable text from a URL. Use after web_search to read a specific page.",
      inputSchema: z.object({
        url: z.string().describe("URL to fetch"),
        maxLength: z
          .number()
          .optional()
          .default(5000)
          .describe("Max content length"),
      }),
      execute: async ({
        url,
        maxLength = 5000,
      }: {
        url: string;
        maxLength?: number;
      }) => {
        const { webScrape } = await import("./web");
        const result = await webScrape(url, maxLength);
        if (!result.success) return { error: result.error };
        return JSON.parse(result.data!);
      },
    },
  };

  // ===== DATABASE TOOLS (conditionally added when Supabase is connected) =====
  if (dbContext?.siteId && dbContext?.baseUrl) {
    const { siteId, baseUrl } = dbContext;

    tools.read_database_schema = {
      description:
        "Read the schema of the connected Supabase database. Returns all tables with columns, data types, and relationships. Use this to understand the database structure before writing queries.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const res = await fetch(`${baseUrl}/api/supabase-connection?siteId=${siteId}`);
          const data = await res.json();

          if (!data.connected) {
            return { error: "No Supabase database is connected to this project. Ask the user to connect one via the Supabase panel.", connected: false };
          }

          if (!data.schema?.tables?.length) {
            return { connected: true, tables: [], message: "Database is connected but no tables found in the public schema." };
          }

          return { connected: true, projectUrl: data.projectUrl, tables: data.schema.tables, tableCount: data.schema.tables.length };
        } catch (e: any) {
          return { error: `Failed to read database schema: ${e.message}` };
        }
      },
    };

    tools.list_database_tables = {
      description:
        "Get a quick overview of all tables in the connected Supabase database. Returns table names and column names. Faster than read_database_schema.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const res = await fetch(`${baseUrl}/api/supabase-connection?siteId=${siteId}`);
          const data = await res.json();

          if (!data.connected) {
            return { error: "No Supabase database is connected.", connected: false };
          }

          const tables = (data.schema?.tables || []).map((t: any) => ({
            name: t.name,
            columnCount: t.columns?.length || 0,
            columns: t.columns?.map((c: any) => c.name) || [],
          }));

          return { connected: true, tables, tableCount: tables.length };
        } catch (e: any) {
          return { error: `Failed to list tables: ${e.message}` };
        }
      },
    };

    tools.execute_sql = {
      description:
        "Execute a SQL query against the connected Supabase database. Returns results as JSON. " +
        "READ queries (SELECT) are safe. WRITE queries (INSERT, UPDATE, DELETE) modify real data. " +
        "DDL queries (CREATE TABLE, ALTER, DROP) modify the schema. " +
        "WARNING: Write and DDL operations affect the user's LIVE database. Always read the schema first.",
      inputSchema: z.object({
        sql: z.string().describe("SQL query to execute (PostgreSQL syntax). Prefer SELECT for reads."),
      }),
      execute: async ({ sql }: { sql: string }) => {
        const sqlUpper = sql.trim().toUpperCase();
        const isRead = sqlUpper.startsWith("SELECT") || sqlUpper.startsWith("WITH") || sqlUpper.startsWith("EXPLAIN");
        const isDDL = sqlUpper.startsWith("CREATE") || sqlUpper.startsWith("ALTER") || sqlUpper.startsWith("DROP") || sqlUpper.startsWith("TRUNCATE");
        const operationType = isDDL ? "DDL" : (!isRead ? "WRITE" : "READ");

        try {
          const res = await fetch(`${baseUrl}/api/supabase-connection/sql`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteId, sql }),
          });

          const data = await res.json();

          if (!res.ok) {
            return { error: data.error || `SQL execution failed with status ${res.status}`, operationType };
          }

          const result: any = { success: true, operationType, data: data.data };

          if (Array.isArray(data.data)) {
            result.rowCount = data.data.length;
            if (data.data.length > 50) {
              result.data = data.data.slice(0, 50);
              result.truncated = true;
              result.totalRows = data.data.length;
              result.message = `Showing first 50 of ${data.data.length} rows. Use LIMIT in your query for smaller result sets.`;
            }
          }

          if (isDDL) {
            result.note = "Schema was modified. Use read_database_schema to see the updated schema.";
          }

          return result;
        } catch (e: any) {
          return { error: `SQL execution error: ${e.message}`, operationType };
        }
      },
    };
  }

  return tools;
}

// === Tool subsets for different agent types ===

export function getExploreTools(virtualFS: Map<string, string>, dbContext?: DatabaseContext) {
  const tools = createEnhancedTools(virtualFS, dbContext);
  return {
    grep_files: tools.grep_files,
    glob_files: tools.glob_files,
    list_files: tools.list_files,
    read_file: tools.read_file,
    ...(tools.read_database_schema && { read_database_schema: tools.read_database_schema }),
    ...(tools.list_database_tables && { list_database_tables: tools.list_database_tables }),
  };
}

export function getPlannerTools(virtualFS: Map<string, string>, dbContext?: DatabaseContext) {
  const tools = createEnhancedTools(virtualFS, dbContext);
  return {
    grep_files: tools.grep_files,
    glob_files: tools.glob_files,
    list_files: tools.list_files,
    read_file: tools.read_file,
    web_search: tools.web_search,
    ...(tools.read_database_schema && { read_database_schema: tools.read_database_schema }),
    ...(tools.list_database_tables && { list_database_tables: tools.list_database_tables }),
    ...(tools.execute_sql && { execute_sql: tools.execute_sql }),
  };
}

export function getVerifyTools(virtualFS: Map<string, string>, dbContext?: DatabaseContext) {
  const tools = createEnhancedTools(virtualFS, dbContext);
  return {
    grep_files: tools.grep_files,
    glob_files: tools.glob_files,
    read_file: tools.read_file,
    ...(tools.read_database_schema && { read_database_schema: tools.read_database_schema }),
    ...(tools.list_database_tables && { list_database_tables: tools.list_database_tables }),
  };
}

export function getExecutorTools(virtualFS: Map<string, string>, dbContext?: DatabaseContext) {
  return createEnhancedTools(virtualFS, dbContext);
}
