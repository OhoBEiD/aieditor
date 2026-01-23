import { NextRequest } from "next/server";
import { mastra } from "@/lib/mastra";

export const maxDuration = 300;

interface FileContext {
  [path: string]: string;
}

interface RequestBody {
  message: string;
  files?: FileContext;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  mode?: "thinking" | "fast";
  maxSteps?: number;
}

export async function POST(req: NextRequest) {
  const body: RequestBody = await req.json();
  const {
    message,
    files = {},
    conversationHistory = [],
    mode = "thinking",
    maxSteps = 15,
  } = body;

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        sendEvent("connected", { message: "Processing started" });

        // Select agent
        const agentName = mode === "fast" ? "fastCodingAgent" : "codingAgent";
        const agent = mastra.getAgent(agentName);

        if (!agent) {
          sendEvent("error", { message: `Agent ${agentName} not found` });
          controller.close();
          return;
        }

        // Build context
        const fileContext = Object.entries(files)
          .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
          .join("\n\n");

        const contextualPrompt = fileContext
          ? `## Current Project Files\n${fileContext}\n\n## User Request\n${message}`
          : message;

        // Build prompt with history
        const historyText = conversationHistory
          .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
          .join("\n\n");

        const fullPrompt = historyText
          ? `${historyText}\n\nUser: ${contextualPrompt}`
          : contextualPrompt;

        const fileOperations: Array<{
          type: "write" | "modify" | "delete";
          path: string;
          content?: string;
          oldText?: string;
          newText?: string;
        }> = [];

        // Generate with step callbacks
        const response = await agent.generate(fullPrompt, {
          maxSteps,
          onStepFinish: (step: any) => {
            // Safely extract values with fallbacks to prevent undefined errors
            const stepNumber = step?.stepNumber ?? 0;
            const toolName = step?.toolName || "reasoning";

            // Send thinking step
            sendEvent("thinking", {
              stepNumber,
              toolName,
              status: "completed",
              message: toolName !== "reasoning"
                ? `Using ${toolName}`
                : "Analyzing...",
            });

            // Extract file operations
            if (step?.toolCalls && Array.isArray(step.toolCalls)) {
              for (const toolCall of step.toolCalls as any[]) {
                const name = toolCall?.toolName || toolCall?.name || "";
                const rawArgs =
                  toolCall?.args ??
                  toolCall?.input ??
                  toolCall?.parameters ??
                  toolCall?.arguments ??
                  {};

                let args: any = rawArgs;
                if (typeof rawArgs === "string") {
                  try {
                    args = JSON.parse(rawArgs);
                  } catch {
                    args = {};
                  }
                }

                const resultAny = toolCall?.result ?? toolCall?.output ?? {};
                const payload =
                  args && typeof args === "object" && Object.keys(args).length > 0 ? args : resultAny;

                if (name === "write_file" && payload?.path) {
                  fileOperations.push({
                    type: "write",
                    path: payload.path,
                    content: payload.content || "",
                  });
                  sendEvent("file_operation", {
                    type: "write",
                    path: payload.path,
                  });
                } else if (name === "modify_file" && payload?.path) {
                  fileOperations.push({
                    type: "modify",
                    path: payload.path,
                    oldText: payload.oldText || "",
                    newText: payload.newText || "",
                  });
                  sendEvent("file_operation", {
                    type: "modify",
                    path: payload.path,
                  });
                } else if (name === "delete_file" && payload?.path) {
                  fileOperations.push({
                    type: "delete",
                    path: payload.path,
                  });
                  sendEvent("file_operation", {
                    type: "delete",
                    path: payload.path,
                  });
                }
              }
            }
          },
        });

        // Send completion FIRST (before the final AI response text is processed)
        sendEvent("complete", {
          success: true,
          text: response?.text || "Task completed.",
          fileOperations,
          usage: response?.usage || {},
        });

        controller.close();
      } catch (error: any) {
        console.error("[Mastra Stream Error]", error);
        sendEvent("error", {
          message: error.message || "Processing failed",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
