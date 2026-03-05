// Visual Verification API — Receives screenshot from frontend, evaluates visual quality
// Called after build validation passes, returns fix instructions if visual issues detected

import { NextRequest, NextResponse } from "next/server";
import { verifyScreenshot, buildVisualFixPrompt } from "@/lib/ai/agents/VisualVerifier";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { screenshot, taskDescription, planSummary, componentsCreated, fileOperations } = body;

    if (!screenshot) {
      return NextResponse.json(
        { error: "No screenshot provided" },
        { status: 400 },
      );
    }

    // Run visual verification
    const result = await verifyScreenshot(screenshot, {
      taskDescription: taskDescription || "Unknown task",
      planSummary: planSummary || "",
      componentsCreated: componentsCreated || [],
    });

    // If issues found, generate fix prompt
    let fixPrompt: string | null = null;
    if (!result.passed && fileOperations) {
      fixPrompt = buildVisualFixPrompt(result, fileOperations);
    }

    return NextResponse.json({
      ...result,
      fixPrompt,
    });
  } catch (err: any) {
    console.error("[VisualVerify] Error:", err.message);
    return NextResponse.json(
      { error: err.message || "Visual verification failed" },
      { status: 500 },
    );
  }
}
