import { useState, useCallback } from "react";

interface FileOperation {
  type: "write" | "modify" | "delete";
  path: string;
  content?: string;
  oldText?: string;
  newText?: string;
}

interface ThinkingStep {
  stepNumber: number;
  toolName: string;
  status: string;
  message: string;
}

interface MastraResponse {
  success: boolean;
  text: string;
  fileOperations: FileOperation[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface UseMastraAgentOptions {
  mode?: "thinking" | "fast";
  maxSteps?: number;
  onThinkingStep?: (step: ThinkingStep) => void;
  onFileOperation?: (operation: FileOperation) => void;
}

export function useMastraAgent(options: UseMastraAgentOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [response, setResponse] = useState<MastraResponse | null>(null);

  const { mode = "thinking", maxSteps = 15, onThinkingStep, onFileOperation } = options;

  /**
   * Send a message to the Mastra agent (non-streaming)
   */
  const generate = useCallback(
    async (
      message: string,
      files: Record<string, string> = {},
      conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
    ): Promise<MastraResponse | null> => {
      setIsLoading(true);
      setError(null);
      setThinkingSteps([]);
      setResponse(null);

      try {
        const res = await fetch("/api/mastra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            files,
            conversationHistory,
            mode,
            maxSteps,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Request failed");
        }

        const data: MastraResponse = await res.json();
        setResponse(data);
        return data;
      } catch (err: any) {
        setError(err.message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [mode, maxSteps]
  );

  /**
   * Send a message with streaming updates
   */
  const generateStream = useCallback(
    async (
      message: string,
      files: Record<string, string> = {},
      conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
    ): Promise<MastraResponse | null> => {
      setIsLoading(true);
      setError(null);
      setThinkingSteps([]);
      setResponse(null);

      try {
        const res = await fetch("/api/mastra/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            files,
            conversationHistory,
            mode,
            maxSteps,
          }),
        });

        if (!res.ok) {
          throw new Error("Stream request failed");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let buffer = "";
        let finalResponse: MastraResponse | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              const eventType = line.slice(7);
              const dataLine = lines[lines.indexOf(line) + 1];

              if (dataLine?.startsWith("data: ")) {
                const data = JSON.parse(dataLine.slice(6));

                switch (eventType) {
                  case "thinking":
                    setThinkingSteps((prev) => [...prev, data]);
                    onThinkingStep?.(data);
                    break;

                  case "file_operation":
                    onFileOperation?.(data);
                    break;

                  case "complete":
                    finalResponse = data;
                    setResponse(data);
                    break;

                  case "error":
                    setError(data.message);
                    break;
                }
              }
            }
          }
        }

        return finalResponse;
      } catch (err: any) {
        setError(err.message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [mode, maxSteps, onThinkingStep, onFileOperation]
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setThinkingSteps([]);
    setResponse(null);
  }, []);

  return {
    generate,
    generateStream,
    isLoading,
    error,
    thinkingSteps,
    response,
    reset,
  };
}
