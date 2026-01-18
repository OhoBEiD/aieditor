'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';

interface WebContainerState {
    status: 'idle' | 'booting' | 'installing' | 'running' | 'error';
    previewUrl: string | null;
    error: string | null;
}

interface UseWebContainerOptions {
    repoUrl?: string;
    githubToken?: string;
    onReady?: (url: string) => void;
    onError?: (error: string) => void;
}

// Singleton WebContainer instance (only one per browser tab)
let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export function useWebContainer(options: UseWebContainerOptions = {}) {
    const { repoUrl, githubToken, onReady, onError } = options;

    const [state, setState] = useState<WebContainerState>({
        status: 'idle',
        previewUrl: null,
        error: null,
    });

    const terminalOutput = useRef<string[]>([]);
    const serverProcess = useRef<any>(null);

    // Boot WebContainer (singleton pattern)
    const boot = useCallback(async () => {
        if (webcontainerInstance) {
            setState(s => ({ ...s, status: 'running' }));
            return webcontainerInstance;
        }

        if (bootPromise) {
            return bootPromise;
        }

        setState(s => ({ ...s, status: 'booting', error: null }));

        try {
            bootPromise = WebContainer.boot();
            webcontainerInstance = await bootPromise;
            console.log('🚀 WebContainer booted');
            return webcontainerInstance;
        } catch (error: any) {
            const errorMsg = error.message || 'Failed to boot WebContainer';
            setState(s => ({ ...s, status: 'error', error: errorMsg }));
            onError?.(errorMsg);
            throw error;
        }
    }, [onError]);

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
        return true;
    }, [boot]);

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

        process.output.pipeTo(new WritableStream({
            write(data) {
                terminalOutput.current.push(data);
                console.log('[WebContainer]', data);
            }
        }));

        return process;
    }, [boot]);

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

    // Initialize from GitHub repo
    const initFromGitHub = useCallback(async (repoUrl: string, token?: string) => {
        try {
            setState(s => ({ ...s, status: 'booting', error: null }));

            await boot();

            // For now, we'll need to fetch files via API and mount them
            // In production, you'd fetch from GitHub API
            const owner = repoUrl.match(/github\.com\/([^/]+)/)?.[1];
            const repo = repoUrl.match(/github\.com\/[^/]+\/([^/]+)/)?.[1]?.replace('.git', '');

            if (!owner || !repo) {
                throw new Error('Invalid GitHub URL');
            }

            // Fetch repo contents via GitHub API
            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json'
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Get tree recursively
            const treeRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
                { headers }
            );

            if (!treeRes.ok) {
                throw new Error('Failed to fetch repo tree');
            }

            const tree = await treeRes.json();
            const files: Record<string, any> = {};

            // Fetch file contents (limit to essential files for speed)
            const essentialPaths = ['package.json', 'src/', 'public/', 'next.config', 'tsconfig', 'tailwind'];
            const fileItems = tree.tree.filter((item: any) =>
                item.type === 'blob' &&
                essentialPaths.some(p => item.path.includes(p) || item.path === p)
            ).slice(0, 50); // Limit files

            for (const item of fileItems) {
                try {
                    const contentRes = await fetch(
                        `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}`,
                        { headers: { ...headers, 'Accept': 'application/vnd.github.v3.raw' } }
                    );
                    if (contentRes.ok) {
                        const content = await contentRes.text();
                        // Build nested file structure
                        const parts = item.path.split('/');
                        let current = files;
                        for (let i = 0; i < parts.length - 1; i++) {
                            if (!current[parts[i]]) {
                                current[parts[i]] = { directory: {} };
                            }
                            current = current[parts[i]].directory;
                        }
                        current[parts[parts.length - 1]] = { file: { contents: content } };
                    }
                } catch (e) {
                    console.warn('Failed to fetch:', item.path);
                }
            }

            await mountFiles(files);
            await installDependencies();
            await startDevServer();

        } catch (error: any) {
            const errorMsg = error.message || 'Failed to initialize from GitHub';
            setState(s => ({ ...s, status: 'error', error: errorMsg }));
            onError?.(errorMsg);
        }
    }, [boot, mountFiles, installDependencies, startDevServer, onError]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (serverProcess.current) {
                serverProcess.current.kill();
            }
        };
    }, []);

    return {
        ...state,
        boot,
        writeFile,
        readFile,
        mountFiles,
        runCommand,
        installDependencies,
        startDevServer,
        initFromGitHub,
        terminalOutput: terminalOutput.current,
    };
}
