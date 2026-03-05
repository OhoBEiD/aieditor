// Context Compaction - Token optimization through observation masking
// Enhanced with: priority-based compression, error preservation,
// deduplication, and token budget awareness

// --- Types ---

interface Message {
  role: string;
  content: string;
}

type MessagePriority = "critical" | "high" | "medium" | "low";

// --- Observation Masking ---

/**
 * After a task completes, compact the conversation memory.
 * Replaces verbose tool outputs with 1-line summaries.
 * Keeps the reasoning chain but removes bulk data.
 * Enhanced: preserves errors and file operations at higher priority.
 */
export function compactToolResults(
  messages: Message[],
  taskSummary: string,
): Message[] {
  const compacted: Message[] = [];
  const seenContent = new Set<string>();

  for (const msg of messages) {
    // Deduplicate: skip if we've seen nearly identical content
    const contentKey = msg.content.slice(0, 100);
    if (seenContent.has(contentKey)) continue;
    seenContent.add(contentKey);

    const priority = classifyMessagePriority(msg);

    if (priority === "critical") {
      // Always keep errors and file ops verbatim
      compacted.push(msg);
    } else if (msg.role === "tool" && msg.content.length > 200) {
      const summary = summarizeToolOutput(msg.content);
      compacted.push({ role: msg.role, content: summary });
    } else if (msg.role === "assistant" && msg.content.length > 500) {
      const maxLen = priority === "high" ? 500 : 300;
      compacted.push({
        role: msg.role,
        content: msg.content.slice(0, maxLen) + "\n[...truncated...]",
      });
    } else {
      compacted.push(msg);
    }
  }

  if (taskSummary) {
    compacted.push({
      role: "assistant",
      content: `[Previous task completed: ${taskSummary}]`,
    });
  }

  return compacted;
}

/**
 * Classify message priority to determine compression level.
 */
function classifyMessagePriority(msg: Message): MessagePriority {
  const content = msg.content.toLowerCase();

  // Critical: errors, failures, file operations
  if (content.includes("error") || content.includes("failed") || content.includes("exception")) {
    return "critical";
  }
  if (content.includes("file_op") || content.includes("write_file") || content.includes("edit_file")) {
    return "critical";
  }

  // High: plan summaries, verification results
  if (content.includes("plan") || content.includes("verification") || content.includes("task completed")) {
    return "high";
  }

  // Medium: tool results with actionable info
  if (msg.role === "tool" && content.includes("matches")) {
    return "medium";
  }

  return "low";
}

/**
 * Summarize a verbose tool output into a compact representation.
 * Enhanced: preserves error details and line numbers.
 */
function summarizeToolOutput(content: string): string {
  try {
    const parsed = JSON.parse(content);

    // Error responses — keep full detail
    if (parsed.error) {
      return `[error: ${typeof parsed.error === "string" ? parsed.error.slice(0, 200) : JSON.stringify(parsed.error).slice(0, 200)}]`;
    }

    // File read results — keep line range info
    if (parsed.content && typeof parsed.content === "string") {
      const lineCount = parsed.totalLines || parsed.content.split("\n").length;
      const range = parsed.range ? ` (lines ${parsed.range.start}-${parsed.range.end})` : "";
      return `[file content: ${lineCount} lines${range}]`;
    }

    // Grep results — keep match count and first few paths
    if (parsed.matches && Array.isArray(parsed.matches)) {
      const paths = [...new Set(parsed.matches.map((m: any) => m.file || m.path))].slice(0, 3);
      return `[search: ${parsed.matches.length} matches in ${paths.join(", ")}]`;
    }

    // File list results
    if (parsed.files && Array.isArray(parsed.files)) {
      return `[${parsed.files.length} files listed]`;
    }

    // Write/edit success — keep path info
    if (parsed.success === true) {
      const path = parsed.path || "";
      const op = parsed.operation || "operation";
      return `[${op} ${path}: success]`;
    }

    // Write/edit failure — keep full error
    if (parsed.success === false) {
      return `[failed: ${parsed.error || "unknown error"}${parsed.hint ? ` (hint: ${parsed.hint})` : ""}]`;
    }
  } catch {
    // Not JSON, check for error patterns
    if (content.toLowerCase().includes("error")) {
      return content.slice(0, 300) + (content.length > 300 ? "..." : "");
    }
  }

  return content.slice(0, 150) + (content.length > 150 ? "..." : "");
}

// --- Conversation Trimming ---

/**
 * Trim conversation history to fit within a token budget.
 * Enhanced: priority-aware — keeps errors and recent messages, summarizes older ones.
 */
export function trimConversationHistory(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxMessages: number = 8,
): Array<{ role: "user" | "assistant"; content: string }> {
  if (messages.length <= maxMessages) return messages;

  const recentMessages = messages.slice(-maxMessages);
  const olderMessages = messages.slice(0, -maxMessages);

  // Separate errors from regular messages in older history
  const errorMessages = olderMessages.filter(m =>
    m.content.toLowerCase().includes("error") ||
    m.content.toLowerCase().includes("failed")
  );
  const normalMessages = olderMessages.filter(m =>
    !m.content.toLowerCase().includes("error") &&
    !m.content.toLowerCase().includes("failed")
  );

  const normalSummary = normalMessages
    .map((m) => {
      const prefix = m.role === "user" ? "User" : "AI";
      return `${prefix}: ${m.content.slice(0, 80)}`;
    })
    .join("\n");

  const result: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (normalSummary) {
    result.push({
      role: "assistant" as const,
      content: `[Earlier conversation summary:\n${normalSummary}\n]`,
    });
  }

  // Preserve error messages from older history (they're important)
  for (const errMsg of errorMessages.slice(-2)) {
    result.push({
      role: errMsg.role,
      content: `[Earlier error: ${errMsg.content.slice(0, 200)}]`,
    });
  }

  result.push(...recentMessages);
  return result;
}

// --- File Context Builder ---

/**
 * Build an efficient file context string from a virtual FS.
 * Enhanced: increased budget for richer context.
 */
export function buildFileContext(
  virtualFS: Map<string, string>,
  relevantPaths: string[],
  maxCharsPerFile: number = 2000,
  maxTotalChars: number = 10000,
): string {
  let context = "";
  let totalChars = 0;

  for (const path of relevantPaths) {
    const content = virtualFS.get(path);
    if (!content) continue;

    const truncated =
      content.length > maxCharsPerFile
        ? content.slice(0, maxCharsPerFile) + `\n... (${content.length - maxCharsPerFile} chars truncated)`
        : content;

    const entry = `### ${path}\n\`\`\`\n${truncated}\n\`\`\`\n\n`;

    if (totalChars + entry.length > maxTotalChars) break;

    context += entry;
    totalChars += entry.length;
  }

  return context;
}

// --- Token Estimation ---

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function wouldExceedBudget(
  currentContext: string,
  newContent: string,
  maxTokens: number = 30000,
): boolean {
  return estimateTokens(currentContext + newContent) > maxTokens;
}
