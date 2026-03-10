// Build-Fix Loop Hook — Orchestrates the client-side build → fix → rebuild cycle
// After AI applies file changes, this hook runs real npm build in WebContainer,
// sends errors to the server for AI fixing, applies fixes, and repeats until success.

"use client";

import { useState, useCallback, useRef } from "react";

// --- Types ---

export interface BuildFixState {
	isRunning: boolean;
	attempt: number;
	maxAttempts: number;
	status: "idle" | "building" | "fixing" | "success" | "failed";
	lastBuildOutput: string;
	lastErrors: string[];
	fixesSummary: string[];
}

export interface BuildFixLoopResult {
	success: boolean;
	attempts: number;
	reason?: string;
}

interface FileOperation {
	type: "write" | "modify" | "delete";
	path: string;
	content?: string;
	oldText?: string;
	newText?: string;
}

interface UseBuildFixLoopOptions {
	runBuild: () => Promise<{ success: boolean; output: string; errors: string[] }>;
	getFileContext: () => Promise<Record<string, string>>;
	applyFileOperations: (ops: FileOperation[]) => Promise<{ success: boolean; applied: number; total: number }>;
	requestId: string | null;
	siteId: string;
	sessionId?: string | null;
	maxAttempts?: number;
}

// --- Hook ---

export function useBuildFixLoop(options: UseBuildFixLoopOptions) {
	const {
		runBuild,
		getFileContext,
		applyFileOperations,
		siteId,
		maxAttempts = 5,
	} = options;

	const [state, setState] = useState<BuildFixState>({
		isRunning: false,
		attempt: 0,
		maxAttempts,
		status: "idle",
		lastBuildOutput: "",
		lastErrors: [],
		fixesSummary: [],
	});

	// Use refs for values that change between renders (requestId, sessionId)
	const requestIdRef = useRef(options.requestId);
	const sessionIdRef = useRef(options.sessionId);
	requestIdRef.current = options.requestId;
	sessionIdRef.current = options.sessionId;

	const startBuildFixLoop = useCallback(async (): Promise<BuildFixLoopResult> => {
		setState(s => ({
			...s,
			isRunning: true,
			attempt: 0,
			status: "building",
			fixesSummary: [],
			lastBuildOutput: "",
			lastErrors: [],
		}));

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			// 1. Run real build
			setState(s => ({ ...s, attempt, status: "building" }));
			console.log(`[BuildFixLoop] Build attempt ${attempt}/${maxAttempts}...`);

			let buildResult: { success: boolean; output: string; errors: string[] };
			try {
				buildResult = await runBuild();
			} catch (err: any) {
				console.error("[BuildFixLoop] Build crashed:", err.message);
				buildResult = { success: false, output: "", errors: [err.message || "Build process crashed"] };
			}

			setState(s => ({
				...s,
				lastBuildOutput: buildResult.output,
				lastErrors: buildResult.errors,
			}));

			// 2. If build passed, we're done
			if (buildResult.success) {
				console.log(`[BuildFixLoop] Build passed on attempt ${attempt}`);
				setState(s => ({ ...s, isRunning: false, status: "success" }));
				return { success: true, attempts: attempt };
			}

			console.log(`[BuildFixLoop] Build failed with ${buildResult.errors.length} errors, sending to AI...`);

			// 3. If this is the last attempt, don't try to fix
			if (attempt >= maxAttempts) {
				setState(s => ({ ...s, isRunning: false, status: "failed" }));
				return { success: false, attempts: attempt, reason: "Max attempts reached" };
			}

			// 4. Get current file context to send to server
			setState(s => ({ ...s, status: "fixing" }));
			let files: Record<string, string>;
			try {
				files = await getFileContext();
			} catch (err: any) {
				console.error("[BuildFixLoop] Failed to get file context:", err.message);
				setState(s => ({ ...s, isRunning: false, status: "failed" }));
				return { success: false, attempts: attempt, reason: "Failed to read project files" };
			}

			// 5. Filter files: only send src/ files to reduce payload
			const filteredFiles: Record<string, string> = {};
			for (const [path, content] of Object.entries(files)) {
				if (path.includes("/src/") || path.endsWith("package.json") || path.endsWith("tsconfig.json") || path.endsWith("next.config")) {
					filteredFiles[path] = content;
				}
			}

			// 6. Send errors to AI for fixing
			let fixes: { fileOperations: FileOperation[]; summary: string };
			try {
				const response = await fetch("/api/ai/build-fix", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						buildOutput: buildResult.output,
						errors: buildResult.errors,
						files: filteredFiles,
						attempt,
						maxAttempts,
						requestId: requestIdRef.current || `buildfix_${Date.now()}`,
						siteId,
						sessionId: sessionIdRef.current,
					}),
				});

				if (!response.ok) {
					const errText = await response.text();
					throw new Error(`API error: ${response.status} - ${errText}`);
				}

				fixes = await response.json();
			} catch (err: any) {
				console.error("[BuildFixLoop] Fix API error:", err.message);
				setState(s => ({ ...s, isRunning: false, status: "failed" }));
				return { success: false, attempts: attempt, reason: `Fix API error: ${err.message}` };
			}

			// 7. If AI couldn't generate fixes, stop
			if (!fixes.fileOperations || fixes.fileOperations.length === 0) {
				console.log("[BuildFixLoop] AI couldn't generate fixes, stopping");
				setState(s => ({ ...s, isRunning: false, status: "failed" }));
				return { success: false, attempts: attempt, reason: "AI could not generate fixes" };
			}

			// 8. Apply fixes to WebContainer
			console.log(`[BuildFixLoop] Applying ${fixes.fileOperations.length} fixes...`);
			setState(s => ({
				...s,
				fixesSummary: [...s.fixesSummary, fixes.summary],
			}));

			try {
				await applyFileOperations(fixes.fileOperations);
			} catch (err: any) {
				console.error("[BuildFixLoop] Failed to apply fixes:", err.message);
				setState(s => ({ ...s, isRunning: false, status: "failed" }));
				return { success: false, attempts: attempt, reason: "Failed to apply fixes" };
			}

			// Continue to next attempt (rebuild)
		}

		setState(s => ({ ...s, isRunning: false, status: "failed" }));
		return { success: false, attempts: maxAttempts, reason: "Max attempts reached" };
	}, [runBuild, getFileContext, applyFileOperations, siteId, maxAttempts]);

	const reset = useCallback(() => {
		setState({
			isRunning: false,
			attempt: 0,
			maxAttempts,
			status: "idle",
			lastBuildOutput: "",
			lastErrors: [],
			fixesSummary: [],
		});
	}, [maxAttempts]);

	return {
		state,
		startBuildFixLoop,
		reset,
	};
}
