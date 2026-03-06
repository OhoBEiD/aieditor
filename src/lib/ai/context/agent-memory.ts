// Agent Memory — Persistent conversation context across turns
// Stores what the user asked for and what was built, so the AI
// never loses track of the user's intent mid-session.

import { getSupabaseClient } from "@/lib/ai/AIService";

// --- Types ---

interface ConversationMemoryEntry {
  content: string;
  content_json: Record<string, any> | null;
  created_at: string;
}

interface SaveConversationParams {
  projectId: string;
  sessionId?: string;
  userMessage: string;
  classification: { type: string; complexity: string };
  selectedApproach?: string | null;
  planSummary?: string | null;
  filesChanged: string[];
  sequenceNumber: number;
}

// --- Save ---

/**
 * Save a conversation turn summary to agent_memory.
 * Called after the AI completes its response (both fast path and full pipeline).
 * Non-critical — failures are logged but don't break the pipeline.
 */
export async function saveConversationMemory(params: SaveConversationParams): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !params.projectId || params.projectId === "unknown") return;

  const {
    projectId,
    sessionId,
    userMessage,
    classification,
    selectedApproach,
    planSummary,
    filesChanged,
    sequenceNumber,
  } = params;

  // Build human-readable summary
  const parts = [`User asked: ${userMessage.slice(0, 200)}`];
  if (classification.type) parts.push(`Type: ${classification.type}/${classification.complexity}`);
  if (planSummary) parts.push(`Built: ${planSummary.slice(0, 200)}`);
  if (filesChanged.length > 0) parts.push(`Files: ${filesChanged.slice(0, 10).join(", ")}`);

  const content = parts.join(". ");

  try {
    await supabase.from("agent_memory").insert({
      project_id: projectId,
      session_id: sessionId || null,
      memory_type: "conversation",
      content,
      content_json: {
        userMessage: userMessage.slice(0, 500),
        classificationType: classification.type,
        complexity: classification.complexity,
        selectedApproach: selectedApproach || null,
        planSummary: planSummary?.slice(0, 300) || null,
        filesChanged: filesChanged.slice(0, 20),
      },
      sequence_number: sequenceNumber,
    });
  } catch (err) {
    console.error("[agent-memory] Failed to save conversation memory:", err);
  }
}

// --- Load ---

/**
 * Load previous conversation memories for context.
 * Prefers session-specific memories; falls back to project-wide.
 */
export async function loadConversationMemory(params: {
  projectId: string;
  sessionId?: string;
  limit?: number;
}): Promise<ConversationMemoryEntry[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !params.projectId || params.projectId === "unknown") return [];

  const limit = params.limit || 10;

  try {
    // Try session-specific first
    if (params.sessionId) {
      const { data, error } = await supabase
        .from("agent_memory")
        .select("content, content_json, created_at")
        .eq("project_id", params.projectId)
        .eq("session_id", params.sessionId)
        .eq("memory_type", "conversation")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!error && data && data.length > 0) {
        return data.reverse(); // Chronological order
      }
    }

    // Fallback: project-wide conversation memories
    const { data, error } = await supabase
      .from("agent_memory")
      .select("content, content_json, created_at")
      .eq("project_id", params.projectId)
      .eq("memory_type", "conversation")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.reverse();
  } catch (err) {
    console.error("[agent-memory] Failed to load conversation memory:", err);
    return [];
  }
}

// --- Format for Prompt ---

/**
 * Format loaded memories for injection into agent prompts.
 * Keeps it concise — the AI needs a summary, not raw data.
 */
export function formatMemoryForPrompt(
  memories: ConversationMemoryEntry[],
  maxEntries: number = 8,
): string {
  if (memories.length === 0) return "";

  const recent = memories.slice(-maxEntries);
  const lines: string[] = [
    "## CONVERSATION MEMORY (what was previously discussed and built in this session)",
  ];

  for (const mem of recent) {
    const json = mem.content_json as Record<string, any> | null;
    if (json?.userMessage) {
      const summary = json.planSummary
        ? `User asked: "${json.userMessage.slice(0, 100)}". Built: ${json.planSummary.slice(0, 100)}`
        : `User asked: "${json.userMessage.slice(0, 150)}"`;
      lines.push(`- ${summary}`);
    } else {
      lines.push(`- ${mem.content.slice(0, 200)}`);
    }
  }

  return lines.join("\n");
}
