// Build Fix API — Receives real npm build errors, runs AI fixer, returns file fixes
// Called by the client-side build-fix loop after a real npm run build fails

import { NextRequest, NextResponse } from "next/server";
import { classifyErrors, type ClassifiedError } from "@/lib/ai/agents/ErrorClassifier";
import { runFixerAgent } from "@/lib/ai/agents/BuildValidator";
import { emitStep } from "@/lib/ai/AIService";

export const maxDuration = 120; // 2 minutes for AI fixing

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const {
			buildOutput,
			errors: rawErrors,
			files,
			attempt,
			maxAttempts,
			requestId,
			siteId,
			sessionId,
		} = body;

		if (!buildOutput && (!rawErrors || rawErrors.length === 0)) {
			return NextResponse.json(
				{ error: "No build output or errors provided" },
				{ status: 400 },
			);
		}

		// Build virtualFS from file contents
		const virtualFS = new Map<string, string>();
		if (files && typeof files === "object") {
			for (const [path, content] of Object.entries(files)) {
				// Normalize: strip leading slash for consistency with server-side virtualFS
				const normalizedPath = (path as string).replace(/^\/+/, "");
				virtualFS.set(normalizedPath, content as string);
			}
		}

		// Classify real build errors
		let classifiedErrors = classifyErrors(buildOutput || "");

		// Fallback: if classifier didn't parse anything, create entries from raw error strings
		if (classifiedErrors.length === 0 && rawErrors && rawErrors.length > 0) {
			for (const errLine of rawErrors) {
				classifiedErrors.push({
					type: "unknown",
					file: "unknown",
					line: 0,
					message: String(errLine).slice(0, 500),
					fixStrategy: `Analyze this build error and fix the root cause: "${String(errLine).slice(0, 200)}"`,
					severity: "error",
				});
			}
		}

		if (classifiedErrors.length === 0) {
			return NextResponse.json({
				fileOperations: [],
				summary: "No errors to fix",
				classifiedErrors: [],
			});
		}

		// Emit progress step
		let stepCounter = 1;
		const safeRequestId = requestId || `buildfix_${Date.now()}`;
		const safeSiteId = siteId || "unknown";

		await emitStep(
			safeRequestId, safeSiteId, stepCounter++,
			"build_fix", "running",
			`Build fix attempt ${attempt || 1}/${maxAttempts || 5}: analyzing ${classifiedErrors.length} errors`,
			undefined, sessionId,
		);

		// Run the fixer agent (reused from BuildValidator)
		const fixResult = await runFixerAgent(
			virtualFS,
			classifiedErrors,
			async (stepNum, toolName, status, msg, details) => {
				await emitStep(
					safeRequestId, safeSiteId, stepCounter++,
					toolName, status, msg, details, sessionId,
				);
			},
			stepCounter,
		);

		const fixCount = fixResult.fileOperations.length;

		await emitStep(
			safeRequestId, safeSiteId, stepCounter++,
			"build_fix", fixCount > 0 ? "complete" : "error",
			fixCount > 0
				? `Applied ${fixCount} fixes for ${classifiedErrors.length} errors`
				: "Could not auto-fix remaining issues",
			undefined, sessionId,
		);

		return NextResponse.json({
			fileOperations: fixResult.fileOperations,
			summary: fixCount > 0
				? `Applied ${fixCount} fixes for ${classifiedErrors.length} errors`
				: `Could not auto-fix ${classifiedErrors.length} errors`,
			classifiedErrors,
		});
	} catch (err: any) {
		console.error("[BuildFix] Error:", err.message);
		return NextResponse.json(
			{ error: err.message || "Build fix failed" },
			{ status: 500 },
		);
	}
}
