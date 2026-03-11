'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { supabase } from '@/lib/supabase/client';

interface WebContainerState {
    status: 'idle' | 'booting' | 'mounting' | 'installing' | 'starting' | 'running' | 'error';
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

function normalizeVirtualFsPath(rawPath: string): string {
    let path = (rawPath || '').trim().replace(/\\/g, '/');
    // Strip any accidental URL/query fragments
    path = path.replace(/[?#].*$/, '');
    path = path.replace(/^\.\/+/, '');
    path = path.replace(/^\/+/, '');
    path = path.replace(/\/+/g, '/');
    if (!path) return '';

    const parts = path.split('/');
    const normalizedParts: string[] = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') {
            normalizedParts.pop();
            continue;
        }
        normalizedParts.push(part);
    }
    return normalizedParts.join('/');
}

async function pathExists(wc: WebContainer, rawPath: string): Promise<boolean> {
    const normalizedPath = normalizeVirtualFsPath(rawPath);
    if (!normalizedPath) return false;
    try {
        await wc.fs.readdir(`/${normalizedPath}`);
        return true;
    } catch {
        return false;
    }
}

// ... helper to save to supabase
async function saveFileToSupabase(projectId: string, path: string, content: string) {
    if (!projectId) return;
    try {
        const normalizedPath = normalizeVirtualFsPath(path);
        if (!normalizedPath) return;

        // Use upsert with ignoreDuplicates to handle conflicts gracefully
        const { error } = await supabase
            .from('project_files')
            .upsert({
                site_id: projectId,
                path: normalizedPath,
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
        const normalizedPath = normalizeVirtualFsPath(path);
        if (!normalizedPath) return;

        await supabase
            .from('project_files')
            .delete()
            .eq('site_id', projectId)
            .eq('path', normalizedPath);
    } catch (e) {
        console.error('Failed to delete file from persistence:', path, e);
    }
}

// Singleton WebContainer instance (only one per browser tab)
let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

// Track last installed package.json hash to skip redundant npm installs
let lastPkgHash: number | null = null;

function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

async function shouldSkipInstall(wc: WebContainer): Promise<boolean> {
    try {
        const entries = await wc.fs.readdir('/node_modules');
        if (entries.length < 5) return false; // Too few = broken install

        const pkgJson = await wc.fs.readFile('/package.json', 'utf-8');
        const currentHash = simpleHash(pkgJson);
        if (lastPkgHash !== null && lastPkgHash === currentHash) {
            console.log('📦 Skipping npm install — package.json unchanged');
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

async function recordPkgHash(wc: WebContainer): Promise<void> {
    try {
        const pkgJson = await wc.fs.readFile('/package.json', 'utf-8');
        lastPkgHash = simpleHash(pkgJson);
    } catch { /* ignore */ }
}

// SANDBOX_KILL: Tab visibility management constants
const HIDDEN_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes before killing hidden container
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity before killing

export function useWebContainer(options: UseWebContainerOptions = {}) {
    const { repoUrl, githubToken, projectId, onReady, onError } = options;
    const projectIdRef = useRef<string | undefined>(projectId);
    projectIdRef.current = projectId;
    const projectLayoutRef = useRef<{ usesSrcDir: boolean | null }>({ usesSrcDir: null });

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

    const detectProjectLayout = useCallback(async (wc: WebContainer) => {
        const hasSrcApp = await pathExists(wc, 'src/app');
        const hasSrcPages = await pathExists(wc, 'src/pages');
        const hasRootApp = await pathExists(wc, 'app');
        const hasRootPages = await pathExists(wc, 'pages');

        if (hasSrcApp || hasSrcPages) {
            projectLayoutRef.current.usesSrcDir = true;
        } else if (hasRootApp || hasRootPages) {
            projectLayoutRef.current.usesSrcDir = false;
        } else {
            projectLayoutRef.current.usesSrcDir = null;
        }

        console.log('[WebContainer] Project layout detected:', projectLayoutRef.current.usesSrcDir === null ? 'unknown' : (projectLayoutRef.current.usesSrcDir ? 'src/' : 'root'));
    }, []);

    const mapToProjectPath = useCallback((rawPath: string): string => {
        const normalizedPath = normalizeVirtualFsPath(rawPath);
        if (!normalizedPath) return '';

        const usesSrcDir = projectLayoutRef.current.usesSrcDir;
        if (usesSrcDir === false && normalizedPath.startsWith('src/')) {
            return normalizedPath.slice(4);
        }
        if (usesSrcDir === true && !normalizedPath.startsWith('src/')) {
            const srcScopedPrefixes = [
                'app/',
                'pages/',
                'components/',
                'lib/',
                'styles/',
                'hooks/',
                'context/',
                'types/',
                'utils/',
            ];
            if (srcScopedPrefixes.some(prefix => normalizedPath.startsWith(prefix))) {
                return `src/${normalizedPath}`;
            }
        }
        return normalizedPath;
    }, []);

    // Restore files from Supabase
    const restoreFilesFromSupabase = useCallback(async (wc: WebContainer) => {
        const effectiveProjectId = projectIdRef.current;
        if (!effectiveProjectId) {
            console.log('⚠️ No projectId, skipping file restoration');
            return;
        }

        console.log('🔄 Restoring files from Supabase for project:', effectiveProjectId);
        try {
            const { data, error } = await supabase
                .from('project_files')
                .select('path, content, updated_at')
                .eq('site_id', effectiveProjectId);

            if (error) {
                console.error('❌ Supabase query error:', error);
                throw error;
            }

            console.log(`📊 Query returned ${data?.length || 0} files for site_id: ${effectiveProjectId}`);

            if (data && data.length > 0) {
                // Dedupe on normalized path (handles historical leading-slash vs no-slash records)
                const latestByPath = new Map<string, { content: string; updatedAt: number | null }>();
                for (const file of data as Array<{ path: string; content: string; updated_at?: string | null }>) {
                    const normalizedPath = mapToProjectPath(file.path);
                    if (!normalizedPath) continue;
                    const updatedAt = file.updated_at ? Date.parse(file.updated_at) : null;
                    const existing = latestByPath.get(normalizedPath);
                    if (!existing || (updatedAt !== null && (existing.updatedAt === null || updatedAt > existing.updatedAt))) {
                        latestByPath.set(normalizedPath, { content: file.content, updatedAt });
                    }
                }

                console.log(`📦 Restoring ${latestByPath.size} files from Supabase...`);
                for (const [path, { content }] of latestByPath.entries()) {

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
    }, []);

    // Boot WebContainer (singleton pattern — atomic lock via synchronous promise assignment)
    const boot = useCallback(async () => {
        // If we already have an instance, just return it
        if (webcontainerInstance) {
            setState(s => s.status === 'running' ? s : { ...s, status: 'running' });
            return webcontainerInstance;
        }

        // If boot is in progress, wait for the same promise (no duplicate boot)
        if (bootPromise) {
            const instance = await bootPromise;
            setState(s => s.status === 'running' ? s : { ...s, status: 'running' });
            return instance;
        }

        // Atomic lock: assign bootPromise SYNCHRONOUSLY before any await.
        // This ensures concurrent callers in the same tick see the promise
        // and await it instead of starting a second WebContainer.boot().
        bootPromise = (async () => {
            setState(s => ({ ...s, status: 'booting', error: null }));
            const instance = await WebContainer.boot();
            webcontainerInstance = instance;
            console.log('🚀 WebContainer booted');
            // File restoration handled by initFromGitHub after mounting template
            return instance;
        })();

        try {
            const instance = await bootPromise;
            return instance;
        } catch (error: any) {
            // Clear the boot promise on error so we can potentially retry
            bootPromise = null;

            const errorMsg = error.message || 'Failed to boot WebContainer';
            setState(s => ({ ...s, status: 'error', error: errorMsg }));
            onError?.(errorMsg);
            throw error;
        }
    }, [onError, restoreFilesFromSupabase]);

    // Clear known project files from WebContainer filesystem (preserves node_modules + system dirs)
    const clearFilesystem = useCallback(async (wc: WebContainer) => {
        console.log('[WebContainer] Clearing project files for project switch...');
        projectLayoutRef.current.usesSrcDir = null;

        // Only delete known project directories/files — NOT system dirs (tmp, home, dev, etc.)
        const projectDirs = ['src', 'app', 'pages', 'public', 'styles', 'components', 'lib', 'hooks', 'context', 'types', 'utils', '.next'];
        const projectFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.js', 'next.config.mjs', 'next.config.ts', 'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', 'postcss.config.mjs', '.env.local', 'next-env.d.ts', 'globals.css'];

        for (const name of projectDirs) {
            try { await wc.fs.rm(`/${name}`, { recursive: true }); } catch { /* doesn't exist */ }
        }
        for (const name of projectFiles) {
            try { await wc.fs.rm(`/${name}`); } catch { /* doesn't exist */ }
        }
        console.log('[WebContainer] Project files cleared');
    }, []);

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
            console.log(`🔄 ProjectId changed from ${previousProjectIdRef.current} to ${projectId}, clearing and restoring files...`);
            (async () => {
                await clearFilesystem(webcontainerInstance);
                await restoreFilesFromSupabase(webcontainerInstance);
            })();
        }
        previousProjectIdRef.current = projectId;
    }, [projectId, restoreFilesFromSupabase, clearFilesystem]);

    // Mount files to WebContainer
    const mountFiles = useCallback(async (files: Record<string, any>) => {
        const wc = await boot();
        await wc.mount(files);
        console.log('📁 Files mounted');
    }, [boot]);

    // Write a single file
    const writeFile = useCallback(async (path: string, content: string) => {
        const mappedPath = mapToProjectPath(path);
        if (!mappedPath) return false;
        const wc = await boot();

        // Ensure directory exists
        const dir = mappedPath.substring(0, mappedPath.lastIndexOf('/'));
        if (dir) {
            await wc.fs.mkdir(dir, { recursive: true });
        }

        await wc.fs.writeFile(mappedPath, content);
        console.log('✏️ Wrote file:', mappedPath);

        // Auto-save to Supabase
        const effectiveProjectId = projectIdRef.current;
        if (effectiveProjectId) {
            saveFileToSupabase(effectiveProjectId, mappedPath, content);
        }

        return true;
    }, [boot, mapToProjectPath]);

    // Write a binary file (e.g. images) — skips Supabase persistence
    const writeBinaryFile = useCallback(async (path: string, data: Uint8Array) => {
        const mappedPath = mapToProjectPath(path);
        if (!mappedPath) return false;
        const wc = await boot();
        const dir = mappedPath.substring(0, mappedPath.lastIndexOf('/'));
        if (dir) {
            await wc.fs.mkdir(dir, { recursive: true });
        }
        await wc.fs.writeFile(mappedPath, data);
        console.log('📁 Wrote binary file:', mappedPath);
        return true;
    }, [boot, mapToProjectPath]);

    // Read a file
    const readFile = useCallback(async (path: string): Promise<string> => {
        const mappedPath = mapToProjectPath(path);
        if (!mappedPath) return '';
        const wc = await boot();
        const content = await wc.fs.readFile(mappedPath, 'utf-8');
        return content;
    }, [boot, mapToProjectPath]);

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
        const mappedPath = mapToProjectPath(path);
        if (!mappedPath) return false;
        const wc = await boot();
        try {
            await wc.fs.rm(mappedPath);
            console.log('🗑️ Deleted file:', mappedPath);

            // Auto-delete from Supabase
            const effectiveProjectId = projectIdRef.current;
            if (effectiveProjectId) {
                deleteFileFromSupabase(effectiveProjectId, mappedPath);
            }
            return true;
        } catch (e) {
            console.error('Failed to delete file:', mappedPath, e);
            return false;
        }
    }, [boot, mapToProjectPath]);

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
        const effectiveProjectId = projectIdRef.current;

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            onProgress?.(i + 1, operations.length, `Applying: ${op.path}`);
            const mappedPath = mapToProjectPath(op.path);

            try {
                if (!mappedPath) {
                    errors.push(`${op.path}: Invalid path`);
                }
                else if (op.type === 'write' && op.content !== undefined) {
                    // Create directory if needed
                    const dir = mappedPath.substring(0, mappedPath.lastIndexOf('/'));
                    if (dir) {
                        await wc.fs.mkdir(dir, { recursive: true });
                    }
                    await wc.fs.writeFile(mappedPath, op.content);
                    console.log('✏️ Wrote:', mappedPath);

                    // Auto-save to Supabase
                    if (effectiveProjectId) {
                        saveFileToSupabase(effectiveProjectId, mappedPath, op.content);
                    }
                    applied++;
                }
                else if (op.type === 'delete') {
                    await wc.fs.rm(mappedPath);
                    console.log('🗑️ Deleted:', mappedPath);

                    // Auto-delete from Supabase
                    if (effectiveProjectId) {
                        deleteFileFromSupabase(effectiveProjectId, mappedPath);
                    }
                    applied++;
                }
                else if (op.type === 'modify' && op.oldText && op.newText) {
                    // Read, replace, write
                    const content = await wc.fs.readFile(mappedPath, 'utf-8');
                    if (content.includes(op.oldText)) {
                        const newContent = content.replace(op.oldText, op.newText);
                        await wc.fs.writeFile(mappedPath, newContent);
                        console.log('🔄 Modified:', mappedPath);

                        // Auto-save to Supabase
                        if (effectiveProjectId) {
                            saveFileToSupabase(effectiveProjectId, mappedPath, newContent);
                        }
                        applied++;
                    } else {
                        errors.push(`Text not found in ${mappedPath}`);
                    }
                }
            } catch (e: any) {
                errors.push(`${mappedPath || op.path}: ${e.message}`);
            }
        }

        return { success: errors.length === 0, applied, errors };
    }, [boot, mapToProjectPath]);

    // Install dependencies with retry
    const installDependencies = useCallback(async (maxRetries = 2) => {
        setState(s => ({ ...s, status: 'installing' }));

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                console.log(`📦 Installing dependencies (attempt ${attempt + 1}/${maxRetries + 1})...`);
                const wc = await boot();
                const output: string[] = [];

                const installProcess = await wc.spawn('npm', ['install', '--prefer-offline']);

                // Capture output for debugging
                await installProcess.output.pipeTo(new WritableStream({
                    write(data) {
                        const cleaned = data.replace(/\x1b\[[0-9;]*[a-zA-Z]|\[[\d;]*[GKH]/g, '').trim();
                        if (cleaned && !/^[\\|/\-]$/.test(cleaned)) {
                            output.push(cleaned);
                            console.log('[npm install]', cleaned);
                        }
                    }
                }));

                const exitCode = await installProcess.exit;

                if (exitCode === 0) {
                    console.log('📦 Dependencies installed successfully');
                    await recordPkgHash(wc);
                    return;
                }

                const errorOutput = output.slice(-10).join('\n');
                console.warn(`⚠️ npm install attempt ${attempt + 1} failed (exit ${exitCode}):`, errorOutput);

                if (attempt < maxRetries) {
                    console.log('🔄 Retrying npm install...');
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    throw new Error(`npm install failed after ${maxRetries + 1} attempts: ${errorOutput.slice(0, 200)}`);
                }
            } catch (err: any) {
                if (attempt === maxRetries) throw err;
                console.warn(`⚠️ npm install error on attempt ${attempt + 1}:`, err.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }, [boot]);

    // Start dev server
    const startDevServer = useCallback(async () => {
        const wc = await boot();

        setState(s => ({ ...s, status: 'starting' }));

        // Start Next.js dev server
        serverProcess.current = await runCommand('npm', ['run', 'dev']);

        // Detect dev server crash
        if (serverProcess.current) {
            serverProcess.current.exit.then((exitCode: number) => {
                if (exitCode !== 0) {
                    console.warn('[WebContainer] Dev server exited with code:', exitCode);
                    setState(s => ({ ...s, status: 'error', error: `Dev server crashed (exit ${exitCode})` }));
                }
            });
        }

        // Wait for server to be ready
        wc.on('server-ready', (port, url) => {
            console.log('🌐 Server ready:', url);
            setState(s => ({ ...s, previewUrl: url, status: 'running' }));
            onReady?.(url);
        });
    }, [boot, runCommand, onReady]);

    // Install a single npm package
    const installPackage = useCallback(async (packageName: string) => {
        console.log(`📦 Installing package: ${packageName}`);
        const process = await runCommand('npm', ['install', packageName]);
        const exitCode = await process.exit;
        if (exitCode !== 0) {
            throw new Error(`Failed to install ${packageName}`);
        }
        console.log(`✅ Installed ${packageName}`);
    }, [runCommand]);

    // Restart the dev server (kill existing, re-spawn)
    const restartDevServer = useCallback(async () => {
        console.log('🔄 Restarting dev server...');
        if (serverProcess.current) {
            serverProcess.current.kill();
            serverProcess.current = null;
        }
        await startDevServer();
    }, [startDevServer]);

    // Initialize from GitHub repo - fetch ALL files for complete project
    const initFromGitHub = useCallback(async (repoUrl: string, token?: string, branch: string = 'main') => {
        try {
            setState(s => ({ ...s, status: 'booting', error: null }));
            console.log('🔄 Fetching project from GitHub:', repoUrl);

            const wc = await boot();

            // Clear previous project files before mounting new ones
            await clearFilesystem(wc);

            // Kill existing dev server so the new one can bind to the port
            if (serverProcess.current) {
                serverProcess.current.kill();
                serverProcess.current = null;
            }

            // HANDLE LOCAL PROJECT (No GitHub Repo)
            if (!repoUrl) {
                console.log('📂 No GitHub repo linked (Local Project). Using starter template.');

                setState(s => ({ ...s, status: 'mounting' }));
                // Import and mount starter template
                const { STARTER_TEMPLATE } = await import('@/lib/webcontainer/starterTemplate');
                await mountFiles(STARTER_TEMPLATE);

                await detectProjectLayout(wc);

                // Restore persisted files
                if (projectIdRef.current && wc) {
                    console.log('🔄 Restoring persisted files on top of starter template...');
                    await restoreFilesFromSupabase(wc);
                }

                if (!await shouldSkipInstall(wc)) {
                    setState(s => ({ ...s, status: 'installing' }));
                    console.log('📦 Installing dependencies...');
                    await installDependencies();
                    await recordPkgHash(wc);
                }
                setState(s => ({ ...s, status: 'starting' }));
                console.log('🚀 Starting dev server...');
                await startDevServer();
                console.log('✅ Started local project');
                return;
            }

            const owner = repoUrl.match(/github\.com\/([^/]+)/)?.[1];
            const repo = repoUrl.match(/github\.com\/[^/]+\/([^/]+)/)?.[1]?.replace('.git', '');

            if (!owner || !repo) {
                // Non-GitHub URL or invalid URL — fall back to local project mode
                console.warn('⚠️ Not a valid GitHub URL, falling back to starter template:', repoUrl);

                setState(s => ({ ...s, status: 'mounting' }));
                const { STARTER_TEMPLATE } = await import('@/lib/webcontainer/starterTemplate');
                await mountFiles(STARTER_TEMPLATE);

                await detectProjectLayout(wc);

                if (projectIdRef.current && wc) {
                    console.log('🔄 Restoring persisted files on top of starter template...');
                    await restoreFilesFromSupabase(wc);
                }

                if (!await shouldSkipInstall(wc)) {
                    setState(s => ({ ...s, status: 'installing' }));
                    console.log('📦 Installing dependencies...');
                    await installDependencies();
                    await recordPkgHash(wc);
                }
                setState(s => ({ ...s, status: 'starting' }));
                console.log('🚀 Starting dev server...');
                await startDevServer();
                console.log('✅ Started local project (fallback from invalid URL)');
                return;
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
                    setState(s => ({ ...s, status: 'mounting' }));
                    // Import and mount starter template instead
                    const { STARTER_TEMPLATE } = await import('@/lib/webcontainer/starterTemplate');
                    await mountFiles(STARTER_TEMPLATE);

                    await detectProjectLayout(wc);

                    // CRITICAL: Restore any persisted files from Supabase AFTER mounting template
                    if (projectIdRef.current && wc) {
                        console.log('🔄 Restoring persisted files on top of starter template...');
                        await restoreFilesFromSupabase(wc);
                    }

                    if (!await shouldSkipInstall(wc)) {
                        setState(s => ({ ...s, status: 'installing' }));
                        console.log('📦 Installing dependencies...');
                        await installDependencies();
                        await recordPkgHash(wc);
                    }
                    setState(s => ({ ...s, status: 'starting' }));
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

            setState(s => ({ ...s, status: 'mounting' }));
            console.log('📁 Mounting files to WebContainer...');
            await mountFiles(files);

            await detectProjectLayout(wc);

            // CRITICAL: Re-apply persisted edits on top of the GitHub snapshot
            // This preserves AI/manual edits that haven't been synced back to GitHub yet.
            if (projectIdRef.current && wc) {
                console.log('🔄 Restoring persisted files on top of GitHub project...');
                await restoreFilesFromSupabase(wc);
            }

            if (!await shouldSkipInstall(wc)) {
                setState(s => ({ ...s, status: 'installing' }));
                console.log('📦 Installing dependencies...');
                await installDependencies();
                await recordPkgHash(wc);
            }

            setState(s => ({ ...s, status: 'starting' }));
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
    }, [boot, mountFiles, installDependencies, startDevServer, onError, restoreFilesFromSupabase, detectProjectLayout, clearFilesystem]);

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
    const applyFileOperations = useCallback(async (
        operations: any[],
        versionInfo?: { clientId: string; sessionId: string; messageId: string }
    ) => {
        const wc = await boot();
        let appliedCount = 0;
        const effectiveProjectId = projectIdRef.current;

        console.log(`🔧 Applying ${operations.length} file operations to WebContainer...`);

        for (const op of operations) {
            try {
                // Capture previous content for code version tracking
                let previousContent: string | null = null;
                if (versionInfo && (op.type === 'write' || op.type === 'modify')) {
                    try {
                        previousContent = await readFile(op.path);
                    } catch {
                        previousContent = null; // File doesn't exist yet
                    }
                }

                let newContent: string | null = null;
                let action: 'create' | 'modify' | 'delete' = 'modify';

                if (op.type === 'write') {
                    await writeFile(op.path, op.content);
                    console.log(`✏️ Wrote file: ${op.path}`);
                    newContent = op.content;
                    action = previousContent ? 'modify' : 'create';
                    appliedCount++;
                } else if (op.type === 'modify') {
                    // Read, replace, write
                    try {
                        let content = await readFile(op.path);
                        if (op.oldText && op.newText && content.includes(op.oldText)) {
                            content = content.replace(op.oldText, op.newText);
                            await writeFile(op.path, content);
                            console.log(`🔄 Modified file: ${op.path}`);
                            newContent = content;
                            action = 'modify';
                            appliedCount++;
                        } else if (op.oldText && !content.includes(op.oldText)) {
                            console.warn(`⚠️ Could not find text to replace in ${op.path}`);
                            if (!content || content.trim().length === 0) {
                                await writeFile(op.path, op.newText);
                                console.log(`✏️ Created new file: ${op.path}`);
                                newContent = op.newText;
                                action = 'create';
                                appliedCount++;
                            }
                        }
                    } catch (e) {
                        console.error(`❌ Failed to modify file ${op.path}`, e);
                        if (op.newText) {
                            try {
                                await writeFile(op.path, op.newText);
                                console.log(`✏️ Created file (fallback): ${op.path}`);
                                newContent = op.newText;
                                action = 'create';
                                appliedCount++;
                            } catch (writeErr) {
                                console.error(`❌ Failed to create file ${op.path}`, writeErr);
                            }
                        }
                    }
                } else if (op.type === 'delete') {
                    try {
                        // Capture content before delete for version tracking
                        if (versionInfo) {
                            try {
                                previousContent = await readFile(op.path);
                            } catch {
                                previousContent = null;
                            }
                        }
                        const mappedPath = mapToProjectPath(op.path);
                        if (!mappedPath) continue;
                        await wc.fs.rm(mappedPath, { recursive: true, force: true });
                        console.log(`🗑️ Deleted file: ${op.path}`);
                        action = 'delete';
                        if (effectiveProjectId) {
                            deleteFileFromSupabase(effectiveProjectId, mappedPath);
                        }
                        appliedCount++;
                    } catch (rmErr) {
                        console.warn(`⚠️ Failed to delete file ${op.path}`, rmErr);
                    }
                }

                // Save code version for tracking
                if (versionInfo && appliedCount > 0 && (newContent !== null || action === 'delete')) {
                    try {
                        await supabase.from('code_versions').insert({
                            client_id: versionInfo.clientId,
                            session_id: versionInfo.sessionId,
                            message_id: versionInfo.messageId,
                            file_path: op.path,
                            action,
                            previous_content: previousContent,
                            new_content: newContent,
                            change_description: `${action} ${op.path}`,
                            is_applied: true,
                            is_reverted: false,
                        });
                    } catch (verErr) {
                        console.error('Failed to save code version:', verErr);
                    }
                }
            } catch (e) {
                console.error(`❌ Failed to apply operation ${op.type} on ${op.path}`, e);
            }
        }

        console.log(`✅ Applied ${appliedCount}/${operations.length} file operations successfully`);

        return { success: appliedCount > 0, applied: appliedCount, total: operations.length };
    }, [boot, writeFile, readFile, mapToProjectPath]);

    return {
        ...state,
        boot,
        writeFile,
        writeBinaryFile,
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
        installPackage,
        startDevServer,
        restartDevServer,
        initFromGitHub,
        terminalOutput: terminalOutput.current,
    };
}
