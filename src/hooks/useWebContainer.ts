'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { supabase } from '@/lib/supabase/client';

interface WebContainerState {
    status: 'idle' | 'booting' | 'installing' | 'running' | 'error';
    previewUrl: string | null;
    error: string | null;
}

interface UseWebContainerOptions {
    repoUrl?: string;
    githubToken?: string;
    projectId?: string; // site_id for persistence
    onReady?: (url: string) => void;
    onError?: (error: string) => void;
}

// ... helper to save to supabase
async function saveFileToSupabase(projectId: string, path: string, content: string) {
    if (!projectId) return;
    try {
        // Use upsert with ignoreDuplicates to handle conflicts gracefully
        const { error } = await supabase
            .from('project_files')
            .upsert({
                site_id: projectId,
                path,
                content,
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'site_id,path',
                ignoreDuplicates: false // Update existing records
            });
        
        // Silently ignore 409 conflicts (file already exists, which is fine)
        if (error && error.code !== '23505' && !error.message.includes('duplicate')) {
            console.error('Failed to auto-save file:', path, error);
        }
    } catch (e: any) {
        // Only log if it's not a conflict error
        if (e?.code !== '23505' && !e?.message?.includes('duplicate') && !e?.message?.includes('Conflict')) {
            console.error('Failed to auto-save file:', path, e);
        }
    }
}

async function deleteFileFromSupabase(projectId: string, path: string) {
    if (!projectId) return;
    try {
        await supabase
            .from('project_files')
            .delete()
            .eq('site_id', projectId)
            .eq('path', path);
    } catch (e) {
        console.error('Failed to delete file from persistence:', path, e);
    }
}

// Singleton WebContainer instance (only one per browser tab)
let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let hasBootedOnce = false; // Track if we've ever booted

// SANDBOX_KILL: Tab visibility management constants
const HIDDEN_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes before killing hidden container
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity before killing

export function useWebContainer(options: UseWebContainerOptions = {}) {
    const { repoUrl, githubToken, projectId, onReady, onError } = options;

    const [state, setState] = useState<WebContainerState>({
        status: 'idle',
        previewUrl: null,
        error: null,
    });

    const terminalOutput = useRef<string[]>([]);
    const serverProcess = useRef<any>(null);

    // SANDBOX_KILL: Tab visibility refs
    const hiddenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isTabHiddenRef = useRef<boolean>(false);

    // Restore files from Supabase
    const restoreFilesFromSupabase = useCallback(async (wc: WebContainer) => {
        if (!projectId) {
            console.log('⚠️ No projectId, skipping file restoration');
            return;
        }

        console.log('🔄 Restoring files from Supabase for project:', projectId);
        try {
            const { data, error } = await supabase
                .from('project_files')
                .select('path, content')
                .eq('site_id', projectId);

            if (error) {
                console.error('❌ Supabase query error:', error);
                throw error;
            }

            console.log(`📊 Query returned ${data?.length || 0} files for site_id: ${projectId}`);

            if (data && data.length > 0) {
                console.log(`📦 Restoring ${data.length} files from Supabase...`);
                for (const file of data) {
                    const path = file.path;
                    const content = file.content;

                    // Ensure directory exists
                    const dir = path.substring(0, path.lastIndexOf('/'));
                    if (dir && dir !== '/') {
                        await wc.fs.mkdir(dir, { recursive: true });
                    }

                    await wc.fs.writeFile(path, content);
                    console.log(`  ✓ Restored: ${path}`);
                }
                console.log('✅ Restoration complete');
            } else {
                console.log('⚠️ No files found for this project ID in database');
            }
        } catch (e) {
            console.error('Failed to restore files:', e);
        }
    }, [projectId]);

    // Boot WebContainer (singleton pattern)
    const boot = useCallback(async () => {
        // If we already have an instance, just return it
        if (webcontainerInstance) {
            setState(s => ({ ...s, status: 'running' }));
            return webcontainerInstance;
        }

        // If boot is in progress, wait for it
        if (bootPromise) {
            const instance = await bootPromise;
            setState(s => ({ ...s, status: 'running' }));
            return instance;
        }

        // If we've already booted once but instance is somehow null,
        // this means there was an issue - don't try to boot again
        if (hasBootedOnce) {
            console.warn('⚠️ WebContainer was already booted in this session. Reusing existing promise.');
            // Wait a bit and check again - might be a race condition
            await new Promise(resolve => setTimeout(resolve, 100));
            if (webcontainerInstance) {
                setState(s => ({ ...s, status: 'running' }));
                return webcontainerInstance;
            }
            throw new Error('WebContainer instance lost after boot. Please refresh the page.');
        }

        setState(s => ({ ...s, status: 'booting', error: null }));

        try {
            hasBootedOnce = true; // Mark that we're attempting to boot
            bootPromise = WebContainer.boot();
            webcontainerInstance = await bootPromise;
            console.log('🚀 WebContainer booted');

            // Restore persistent files if projectId exists
            if (projectId) {
                await restoreFilesFromSupabase(webcontainerInstance);
            }

            return webcontainerInstance;
        } catch (error: any) {
            // Clear the boot promise on error so we can potentially retry
            bootPromise = null;

            const errorMsg = error.message || 'Failed to boot WebContainer';

            // If error is about single instance, the container might already be booted
            if (errorMsg.includes('single') && errorMsg.includes('instance')) {
                console.warn('⚠️ WebContainer already booted - this is likely a race condition');
                // Wait and try to get the instance
                await new Promise(resolve => setTimeout(resolve, 200));
                if (webcontainerInstance) {
                    return webcontainerInstance;
                }
            }

            setState(s => ({ ...s, status: 'error', error: errorMsg }));
            onError?.(errorMsg);
            throw error;
        }
    }, [onError, projectId, restoreFilesFromSupabase]);

    // Re-restore files when projectId changes (handles localStorage restore timing)
    const previousProjectIdRef = useRef<string | undefined>(projectId);
    useEffect(() => {
        // Only trigger if projectId actually changed and we have a container
        if (
            projectId &&
            projectId !== previousProjectIdRef.current &&
            webcontainerInstance &&
            previousProjectIdRef.current !== undefined
        ) {
            console.log(`🔄 ProjectId changed from ${previousProjectIdRef.current} to ${projectId}, restoring files...`);
            restoreFilesFromSupabase(webcontainerInstance);
        }
        previousProjectIdRef.current = projectId;
    }, [projectId, restoreFilesFromSupabase]);

    // Mount files to WebContainer
    const mountFiles = useCallback(async (files: Record<string, any>) => {
        const wc = await boot();
        await wc.mount(files);
        console.log('📁 Files mounted');
    }, [boot]);

    // Write a single file
    const writeFile = useCallback(async (path: string, content: string) => {
        const wc = await boot();

        // Ensure directory exists
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (dir) {
            await wc.fs.mkdir(dir, { recursive: true });
        }

        await wc.fs.writeFile(path, content);
        console.log('✏️ Wrote file:', path);

        // Auto-save to Supabase
        if (projectId) {
            saveFileToSupabase(projectId, path, content);
        }

        return true;
    }, [boot, projectId]);

    // Read a file
    const readFile = useCallback(async (path: string): Promise<string> => {
        const wc = await boot();
        const content = await wc.fs.readFile(path, 'utf-8');
        return content;
    }, [boot]);

    // Run a command in the container
    const runCommand = useCallback(async (command: string, args: string[] = []) => {
        const wc = await boot();
        const process = await wc.spawn(command, args);

        // Filter out ANSI escape codes and spinner characters from terminal output
        const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\[[\d;]*[GKH]/g, '');
        const isSpinnerChar = (str: string) => /^[\\/|\\-]$/.test(str.trim());

        process.output.pipeTo(new WritableStream({
            write(data) {
                const cleaned = stripAnsi(data).trim();
                // Only log meaningful output (skip empty lines and spinner chars)
                if (cleaned && !isSpinnerChar(cleaned)) {
                    terminalOutput.current.push(cleaned);
                    console.log('[WebContainer]', cleaned);
                }
            }
        }));

        return process;
    }, [boot]);

    // Run npm build and capture output for validation
    const runBuild = useCallback(async (): Promise<{ success: boolean; output: string; errors: string[] }> => {
        const wc = await boot();
        const output: string[] = [];
        const errors: string[] = [];

        console.log('🔨 Running npm run build for validation...');
        setState(s => ({ ...s, status: 'installing' })); // Show as building

        try {
            const process = await wc.spawn('npm', ['run', 'build']);

            // Collect output
            await process.output.pipeTo(new WritableStream({
                write(data) {
                    const cleaned = data.replace(/\x1b\[[0-9;]*[a-zA-Z]|\[[\d;]*[GKH]/g, '').trim();
                    if (cleaned) {
                        output.push(cleaned);
                        // Check for error patterns
                        if (cleaned.toLowerCase().includes('error') ||
                            cleaned.includes('failed') ||
                            cleaned.includes('TypeError') ||
                            cleaned.includes('SyntaxError') ||
                            cleaned.includes('Cannot find')) {
                            errors.push(cleaned);
                        }
                        console.log('[Build]', cleaned);
                    }
                }
            }));

            const exitCode = await process.exit;
            const success = exitCode === 0;

            console.log(success ? '✅ Build succeeded!' : '❌ Build failed with errors');
            setState(s => ({ ...s, status: 'running' }));

            return {
                success,
                output: output.join('\n'),
                errors: errors.slice(0, 10) // Limit to first 10 errors
            };
        } catch (e: any) {
            console.error('Build process error:', e);
            setState(s => ({ ...s, status: 'running' }));
            return {
                success: false,
                output: output.join('\n'),
                errors: [e.message || 'Build process failed']
            };
        }
    }, [boot]);

    // List files in a directory
    const listFiles = useCallback(async (path: string = '.'): Promise<string[]> => {
        const wc = await boot();
        try {
            const entries = await wc.fs.readdir(path, { withFileTypes: true });
            const files: string[] = [];

            for (const entry of entries) {
                const fullPath = path === '.' ? entry.name : `${path}/${entry.name}`;
                if (entry.isDirectory()) {
                    // Recursively list subdirectories (skip node_modules)
                    if (entry.name !== 'node_modules' && entry.name !== '.git') {
                        const subFiles = await listFiles(fullPath);
                        files.push(...subFiles);
                    }
                } else {
                    files.push(fullPath);
                }
            }
            return files;
        } catch (e) {
            console.error('Failed to list files:', e);
            return [];
        }
    }, [boot]);

    // Read ALL files for AI context (limited size)
    const getFileContext = useCallback(async (): Promise<Record<string, string>> => {
        const context: Record<string, string> = {};
        const wc = await boot();

        async function readDir(dir: string) {
            try {
                const entries = await wc.fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
                    if (entry.isDirectory()) {
                        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.next') {
                            await readDir(fullPath);
                        }
                    } else if (entry.isFile()) {
                        // Skip binary/large files
                        if (!entry.name.match(/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|pdf|map)$/i)) {
                            try {
                                const content = await wc.fs.readFile(fullPath, 'utf-8');
                                context[fullPath] = content;
                            } catch (e) {
                                // Ignore read errors
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error reading dir:', dir, e);
            }
        }

        await readDir('/');
        return context;
    }, [boot]);

    // Spawn a command/shell with raw output (for xterm)
    const spawn = useCallback(async (command: string, args: string[] = [], options: any = {}) => {
        const wc = await boot();
        return await wc.spawn(command, args, options);
    }, [boot]);

    // Delete a file
    const deleteFile = useCallback(async (path: string): Promise<boolean> => {
        const wc = await boot();
        try {
            await wc.fs.rm(path);
            console.log('🗑️ Deleted file:', path);

            // Auto-delete from Supabase
            if (projectId) {
                deleteFileFromSupabase(projectId, path);
            }
            return true;
        } catch (e) {
            console.error('Failed to delete file:', path, e);
            return false;
        }
    }, [boot, projectId]);

    // Apply file operations from AI response (batch operation)
    interface FileOperation {
        type: 'write' | 'delete' | 'modify';
        path: string;
        content?: string;
        oldText?: string;
        newText?: string;
    }

    const applyFileChanges = useCallback(async (
        operations: FileOperation[],
        onProgress?: (step: number, total: number, message: string) => void
    ): Promise<{ success: boolean; applied: number; errors: string[] }> => {
        const wc = await boot();
        const errors: string[] = [];
        let applied = 0;

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            onProgress?.(i + 1, operations.length, `Applying: ${op.path}`);

            try {
                if (op.type === 'write' && op.content !== undefined) {
                    // Create directory if needed
                    const dir = op.path.substring(0, op.path.lastIndexOf('/'));
                    if (dir) {
                        await wc.fs.mkdir(dir, { recursive: true });
                    }
                    await wc.fs.writeFile(op.path, op.content);
                    console.log('✏️ Wrote:', op.path);

                    // Auto-save to Supabase
                    if (projectId) {
                        saveFileToSupabase(projectId, op.path, op.content);
                    }
                    applied++;
                }
                else if (op.type === 'delete') {
                    await wc.fs.rm(op.path);
                    console.log('🗑️ Deleted:', op.path);

                    // Auto-delete from Supabase
                    if (projectId) {
                        deleteFileFromSupabase(projectId, op.path);
                    }
                    applied++;
                }
                else if (op.type === 'modify' && op.oldText && op.newText) {
                    // Read, replace, write
                    const content = await wc.fs.readFile(op.path, 'utf-8');
                    if (content.includes(op.oldText)) {
                        const newContent = content.replace(op.oldText, op.newText);
                        await wc.fs.writeFile(op.path, newContent);
                        console.log('🔄 Modified:', op.path);

                        // Auto-save to Supabase
                        if (projectId) {
                            saveFileToSupabase(projectId, op.path, newContent);
                        }
                        applied++;
                    } else {
                        errors.push(`Text not found in ${op.path}`);
                    }
                }
            } catch (e: any) {
                errors.push(`${op.path}: ${e.message}`);
            }
        }

        return { success: errors.length === 0, applied, errors };
    }, [boot, projectId]);

    // Install dependencies
    const installDependencies = useCallback(async () => {
        setState(s => ({ ...s, status: 'installing' }));

        const installProcess = await runCommand('npm', ['install']);
        const exitCode = await installProcess.exit;

        if (exitCode !== 0) {
            throw new Error('npm install failed');
        }

        console.log('📦 Dependencies installed');
    }, [runCommand]);

    // Start dev server
    const startDevServer = useCallback(async () => {
        const wc = await boot();

        setState(s => ({ ...s, status: 'running' }));

        // Start Next.js dev server
        serverProcess.current = await runCommand('npm', ['run', 'dev']);

        // Wait for server to be ready
        wc.on('server-ready', (port, url) => {
            console.log('🌐 Server ready:', url);
            setState(s => ({ ...s, previewUrl: url, status: 'running' }));
            onReady?.(url);
        });
    }, [boot, runCommand, onReady]);

    // Initialize from GitHub repo - fetch ALL files for complete project
    const initFromGitHub = useCallback(async (repoUrl: string, token?: string, branch: string = 'main') => {
        try {
            setState(s => ({ ...s, status: 'booting', error: null }));
            console.log('🔄 Fetching project from GitHub:', repoUrl);

            const wc = await boot();

            // HANDLE LOCAL PROJECT (No GitHub Repo)
            if (!repoUrl) {
                console.log('📂 No GitHub repo linked (Local Project). Using starter template.');

                // Import and mount starter template
                const { STARTER_TEMPLATE } = await import('@/lib/webcontainer/starterTemplate');
                await mountFiles(STARTER_TEMPLATE);

                // Restore persisted files
                if (projectId && wc) {
                    console.log('🔄 Restoring persisted files on top of starter template...');
                    await restoreFilesFromSupabase(wc);
                }

                setState(s => ({ ...s, status: 'installing' }));
                console.log('📦 Installing dependencies...');
                await installDependencies();
                console.log('🚀 Starting dev server...');
                await startDevServer();
                console.log('✅ Started local project');
                return;
            }

            const owner = repoUrl.match(/github\.com\/([^/]+)/)?.[1];
            const repo = repoUrl.match(/github\.com\/[^/]+\/([^/]+)/)?.[1]?.replace('.git', '');

            if (!owner || !repo) {
                // Determine if this is a "local" project that just has a bad URL, or actual error
                // For now, assume error if URL is provided but invalid
                throw new Error('Invalid GitHub URL');
            }

            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json'
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Get tree recursively
            console.log(`📂 Fetching file tree for ${owner}/${repo}...`);
            const treeRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
                { headers }
            );

            if (!treeRes.ok) {
                // Check if it's a 404 - repo might be empty (no commits yet)
                if (treeRes.status === 404) {
                    console.log('📂 Repo is empty (no commits yet), using starter template');
                    // Import and mount starter template instead
                    const { STARTER_TEMPLATE } = await import('@/lib/webcontainer/starterTemplate');
                    await mountFiles(STARTER_TEMPLATE);

                    // CRITICAL: Restore any persisted files from Supabase AFTER mounting template
                    if (projectId && wc) {
                        console.log('🔄 Restoring persisted files on top of starter template...');
                        await restoreFilesFromSupabase(wc);
                    }

                    setState(s => ({ ...s, status: 'installing' }));
                    console.log('📦 Installing dependencies...');
                    await installDependencies();
                    console.log('🚀 Starting dev server...');
                    await startDevServer();
                    console.log('✅ Started with starter template (repo was empty)');
                    return;
                }
                const errorText = await treeRes.text();
                console.error('GitHub API error:', errorText);
                throw new Error(`Failed to fetch repo tree: ${treeRes.status}`);
            }

            const tree = await treeRes.json();
            const files: Record<string, any> = {};

            // Filter files - exclude node_modules, .git, and binary files
            const excludePaths = ['node_modules/', '.git/', 'dist/', '.next/', 'build/'];
            const excludeExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.webm', '.mp3', '.pdf'];

            const fileItems = tree.tree.filter((item: any) => {
                if (item.type !== 'blob') return false;
                if (excludePaths.some(p => item.path.startsWith(p) || item.path.includes('/' + p))) return false;
                if (excludeExtensions.some(ext => item.path.toLowerCase().endsWith(ext))) return false;
                return true;
            });

            console.log(`📄 Fetching ${fileItems.length} files...`);

            // Fetch files in batches to avoid rate limiting
            const batchSize = 10;
            for (let i = 0; i < fileItems.length; i += batchSize) {
                const batch = fileItems.slice(i, i + batchSize);
                await Promise.all(batch.map(async (item: any) => {
                    try {
                        const contentRes = await fetch(
                            `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${branch}`,
                            { headers: { ...headers, 'Accept': 'application/vnd.github.v3.raw' } }
                        );
                        if (contentRes.ok) {
                            const content = await contentRes.text();
                            // Build nested file structure for WebContainer
                            const parts = item.path.split('/');
                            let current = files;
                            for (let j = 0; j < parts.length - 1; j++) {
                                if (!current[parts[j]]) {
                                    current[parts[j]] = { directory: {} };
                                }
                                current = current[parts[j]].directory;
                            }
                            current[parts[parts.length - 1]] = { file: { contents: content } };
                        }
                    } catch (e) {
                        console.warn('Failed to fetch:', item.path);
                    }
                }));
            }

            console.log('📁 Mounting files to WebContainer...');
            await mountFiles(files);

            setState(s => ({ ...s, status: 'installing' }));
            console.log('📦 Installing dependencies...');
            await installDependencies();

            console.log('🚀 Starting dev server...');
            await startDevServer();

            console.log('✅ Project loaded from GitHub successfully');

        } catch (error: any) {
            const errorMsg = error.message || 'Failed to initialize from GitHub';
            console.error('❌ GitHub init error:', errorMsg);
            setState(s => ({ ...s, status: 'error', error: errorMsg }));
            onError?.(errorMsg);
            throw error;
        }
    }, [boot, mountFiles, installDependencies, startDevServer, onError]);

    // SANDBOX_KILL: Handle tab visibility changes
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Tab is now hidden
                isTabHiddenRef.current = true;
                console.log('[SANDBOX_KILL] visibilitychange', `page-${webcontainerInstance ? 'active' : 'idle'}`);
                console.log('[SANDBOX_KILL] Tab hidden -', `page-${Date.now().toString(36)}`);
                console.log(`[SANDBOX_KILL] starting HIDDEN_TIMEOUT timer (will kill in ${HIDDEN_TIMEOUT_MS}ms)`);

                // Clear any existing hidden timeout
                if (hiddenTimeoutRef.current) {
                    clearTimeout(hiddenTimeoutRef.current);
                }

                // Start hidden timeout - kill container after 20 minutes
                hiddenTimeoutRef.current = setTimeout(() => {
                    if (isTabHiddenRef.current && serverProcess.current) {
                        console.log('[SANDBOX_KILL] Hidden timeout reached - killing server process');
                        serverProcess.current.kill();
                        serverProcess.current = null;
                        setState(s => ({ ...s, status: 'idle', previewUrl: null }));
                    }
                }, HIDDEN_TIMEOUT_MS);

            } else {
                // Tab is visible again
                isTabHiddenRef.current = false;
                console.log('[SANDBOX_KILL] visibilitychange', `page-${Date.now().toString(36)}`);
                console.log('  | document.hidden: false');
                console.log('[SANDBOX_KILL] Tab visible again', `page-${Date.now().toString(36)}`);
                console.log('  - clearing hidden timer, restarting idle timer');

                // Clear hidden timeout
                if (hiddenTimeoutRef.current) {
                    clearTimeout(hiddenTimeoutRef.current);
                    hiddenTimeoutRef.current = null;
                }

                // Restart idle timer
                if (idleTimeoutRef.current) {
                    clearTimeout(idleTimeoutRef.current);
                }
                idleTimeoutRef.current = setTimeout(() => {
                    if (serverProcess.current && state.status === 'running') {
                        console.log('[SANDBOX_KILL] Idle timeout reached - container still active');
                    }
                }, IDLE_TIMEOUT_MS);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [state.status]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Clear all timers
            if (hiddenTimeoutRef.current) clearTimeout(hiddenTimeoutRef.current);
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);

            if (serverProcess.current) {
                serverProcess.current.kill();
            }
        };
    }, []);

    // Apply batch file operations
    const applyFileOperations = useCallback(async (operations: any[]) => {
        const wc = await boot();
        let appliedCount = 0;

        console.log(`🔧 Applying ${operations.length} file operations to WebContainer...`);

        for (const op of operations) {
            try {
                if (op.type === 'write') {
                    await writeFile(op.path, op.content);
                    console.log(`✏️ Wrote file: ${op.path}`);
                    appliedCount++;
                } else if (op.type === 'modify') {
                    // Read, replace, write
                    try {
                        let content = await readFile(op.path);
                        if (op.oldText && op.newText && content.includes(op.oldText)) {
                            content = content.replace(op.oldText, op.newText);
                            await writeFile(op.path, content); // This will trigger saveFileToSupabase
                            console.log(`🔄 Modified file: ${op.path}`);
                            appliedCount++;
                        } else if (op.oldText && !content.includes(op.oldText)) {
                            console.warn(`⚠️ Could not find text to replace in ${op.path}`);
                            // Try to write anyway if it's a new file
                            if (!content || content.trim().length === 0) {
                                await writeFile(op.path, op.newText);
                                console.log(`✏️ Created new file: ${op.path}`);
                                appliedCount++;
                            }
                        }
                    } catch (e) {
                        console.error(`❌ Failed to modify file ${op.path}`, e);
                        // If file doesn't exist, create it
                        if (op.newText) {
                            try {
                                await writeFile(op.path, op.newText);
                                console.log(`✏️ Created file (fallback): ${op.path}`);
                                appliedCount++;
                            } catch (writeErr) {
                                console.error(`❌ Failed to create file ${op.path}`, writeErr);
                            }
                        }
                    }
                } else if (op.type === 'delete') {
                    try {
                        await wc.fs.rm(op.path, { recursive: true, force: true });
                        console.log(`🗑️ Deleted file: ${op.path}`);
                        // Delete from Supabase
                        if (projectId) {
                            deleteFileFromSupabase(projectId, op.path);
                        }
                        appliedCount++;
                    } catch (rmErr) {
                        console.warn(`⚠️ Failed to delete file ${op.path}`, rmErr);
                    }
                }
            } catch (e) {
                console.error(`❌ Failed to apply operation ${op.type} on ${op.path}`, e);
            }
        }

        console.log(`✅ Applied ${appliedCount}/${operations.length} file operations successfully`);
        
        // Return success status for caller to know when to refresh
        return { success: appliedCount > 0, applied: appliedCount, total: operations.length };
    }, [boot, writeFile, readFile, projectId]);

    return {
        ...state,
        boot,
        writeFile,
        readFile,
        listFiles,
        getFileContext,
        applyFileOperations, // Export this
        deleteFile,
        applyFileChanges,
        mountFiles,
        runCommand,
        runBuild, // Build validation
        spawn,
        installDependencies,
        startDevServer,
        initFromGitHub,
        terminalOutput: terminalOutput.current,
    };
}
