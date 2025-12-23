import express, { Request, Response, NextFunction } from 'express';
import { execSync, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// Configuration
const PORT = process.env.PORT || 3001;
const WORKSPACES_DIR = process.env.WORKSPACES_DIR || '/workspaces';
const PREVIEW_DOMAIN = process.env.PREVIEW_DOMAIN || 'preview.automatelb.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// In-memory state for active previews
const activePreviews: Map<string, {
    pid: number | null;
    port: number;
    status: 'starting' | 'running' | 'stopped';
    lastActivity: Date;
}> = new Map();

// Get next available port
let nextPort = 3100;
function getNextPort(): number {
    return nextPort++;
}

// Subdomain-based proxy middleware
// This must come BEFORE express.json() to handle non-JSON requests
app.use((req: Request, res: Response, next: NextFunction) => {
    const host = req.headers.host || '';

    // Check if this is a preview subdomain request
    if (host.includes(PREVIEW_DOMAIN) && !host.startsWith('preview-orchestrator')) {
        // Extract siteId from subdomain (e.g., siteId.preview.automatelb.com)
        const subdomain = host.split('.')[0];

        if (subdomain && subdomain !== 'preview-orchestrator' && subdomain !== 'www') {
            const preview = activePreviews.get(subdomain);

            if (preview && preview.status === 'running') {
                // Update activity
                preview.lastActivity = new Date();

                // Proxy to the dev server
                const proxyMiddleware = createProxyMiddleware({
                    target: `http://localhost:${preview.port}`,
                    changeOrigin: true,
                    ws: true, // WebSocket support for HMR
                    on: {
                        error: (err: Error, _req: any, res: any) => {
                            console.error(`Proxy error for ${subdomain}:`, err.message);
                            if (res.writeHead) {
                                res.writeHead(502, { 'Content-Type': 'text/html' });
                                res.end('<h1>502 Bad Gateway</h1><p>Preview server is not responding</p>');
                            }
                        }
                    }
                });

                return proxyMiddleware(req, res, next);
            } else {
                // Preview not running
                return res.status(503).send(`
                    <html>
                    <head><title>Preview Not Ready</title></head>
                    <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                        <h1>Preview Not Ready</h1>
                        <p>The preview server for site <code>${subdomain}</code> is not running.</p>
                        <p>Try sending a message to start the preview.</p>
                    </body>
                    </html>
                `);
            }
        }
    }

    next();
});

// JSON parsing for API endpoints
app.use(express.json({ limit: '10mb' }));

// Ensure workspace directory exists
async function ensureWorkspace(siteId: string, repoUrl: string, branch: string): Promise<string> {
    const workspacePath = path.join(WORKSPACES_DIR, siteId);

    try {
        await fs.access(workspacePath);
        // Workspace exists, fetch and reset
        console.log(`Workspace exists for ${siteId}, fetching updates...`);
        execSync(`git fetch origin && git reset --hard origin/${branch}`, {
            cwd: workspacePath,
            stdio: 'pipe'
        });
    } catch {
        // Clone repository
        console.log(`Cloning repository for ${siteId}...`);
        await fs.mkdir(workspacePath, { recursive: true });

        // Add token to URL if available
        let cloneUrl = repoUrl;
        if (GITHUB_TOKEN && repoUrl.includes('github.com')) {
            cloneUrl = repoUrl.replace('https://', `https://${GITHUB_TOKEN}@`);
        }

        execSync(`git clone --depth 1 --branch ${branch} ${cloneUrl} .`, {
            cwd: workspacePath,
            stdio: 'pipe'
        });
    }

    // Check if node_modules exists, install if not
    const nodeModulesPath = path.join(workspacePath, 'node_modules');
    try {
        await fs.access(nodeModulesPath);
    } catch {
        console.log(`Installing dependencies for ${siteId}...`);
        execSync('npm install', { cwd: workspacePath, stdio: 'pipe' });
    }

    return workspacePath;
}

// Start dev server for a site
async function startDevServer(siteId: string, workspacePath: string): Promise<number> {
    const port = getNextPort();

    console.log(`Starting dev server for ${siteId} on port ${port}...`);

    const child = exec(`npm run dev -- --port ${port}`, {
        cwd: workspacePath,
        env: { ...process.env, PORT: String(port) }
    });

    activePreviews.set(siteId, {
        pid: child.pid || null,
        port,
        status: 'running',
        lastActivity: new Date()
    });

    child.stdout?.on('data', (data) => console.log(`[${siteId}] ${data}`));
    child.stderr?.on('data', (data) => console.error(`[${siteId}] ${data}`));

    child.on('exit', () => {
        const preview = activePreviews.get(siteId);
        if (preview) {
            preview.status = 'stopped';
            preview.pid = null;
        }
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    return port;
}

// Apply diff to workspace
async function applyDiff(workspacePath: string, unifiedDiff: string): Promise<{
    filesChanged: string[];
    needsRestart: boolean;
}> {
    const filesChanged: string[] = [];
    let needsRestart = false;

    console.log('Applying diff to workspace:', workspacePath);
    console.log('Diff content (first 500 chars):', unifiedDiff.slice(0, 500));

    // Parse unified diff to extract file names
    const diffLines = unifiedDiff.split('\n');

    for (const line of diffLines) {
        if (line.startsWith('+++ b/') || line.startsWith('+++ ')) {
            const currentFile = line.replace('+++ b/', '').replace('+++ ', '').trim();
            if (currentFile && currentFile !== '/dev/null') {
                filesChanged.push(currentFile);

                // Check if this file requires restart
                if (
                    currentFile.includes('tailwind.config') ||
                    currentFile.includes('postcss.config') ||
                    currentFile.includes('next.config') ||
                    currentFile === 'package.json' ||
                    currentFile === '.env.local'
                ) {
                    needsRestart = true;
                }
            }
        }
    }

    if (filesChanged.length === 0) {
        console.log('No files detected in diff, skipping apply');
        return { filesChanged: [], needsRestart: false };
    }

    // Try multiple approaches to apply the diff
    try {
        // Approach 1: Try git apply with --3way for better merge handling
        const diffPath = path.join(workspacePath, '.temp.patch');
        await fs.writeFile(diffPath, unifiedDiff);

        try {
            execSync(`git apply --whitespace=fix --3way .temp.patch`, {
                cwd: workspacePath,
                stdio: 'pipe'
            });
            console.log('Diff applied successfully with git apply --3way');
        } catch (e1) {
            console.log('git apply --3way failed, trying without --3way...');
            try {
                execSync(`git apply --whitespace=fix .temp.patch`, {
                    cwd: workspacePath,
                    stdio: 'pipe'
                });
                console.log('Diff applied successfully with git apply');
            } catch (e2) {
                console.log('git apply failed, trying patch command...');
                try {
                    execSync(`patch -p1 < .temp.patch`, {
                        cwd: workspacePath,
                        stdio: 'pipe'
                    });
                    console.log('Diff applied successfully with patch command');
                } catch (e3) {
                    console.error('All patch methods failed. Last error:', e3);
                    // Don't throw - return partial success so workflow can continue
                    await fs.unlink(diffPath).catch(() => { });
                    return {
                        filesChanged,
                        needsRestart,
                        // Add warning but don't fail completely
                    };
                }
            }
        }

        await fs.unlink(diffPath).catch(() => { });
    } catch (error) {
        console.error('Error in applyDiff:', error);
        // Return what we have, don't fail completely
    }

    return { filesChanged, needsRestart };
}

// ==================== ENDPOINTS ====================

// POST /preview/start - Start or ensure preview is running
app.post('/preview/start', async (req: Request, res: Response) => {
    try {
        const { siteId, repoUrl, branch = 'main' } = req.body;

        if (!siteId || !repoUrl) {
            return res.status(400).json({ error: 'Missing siteId or repoUrl' });
        }

        // Check if already running
        const existing = activePreviews.get(siteId);
        if (existing && existing.status === 'running') {
            existing.lastActivity = new Date();
            return res.json({
                ok: true,
                previewUrl: `https://${siteId}.${PREVIEW_DOMAIN}`,
                status: 'running',
                port: existing.port
            });
        }

        // Setup workspace
        const workspacePath = await ensureWorkspace(siteId, repoUrl, branch);

        // Start dev server
        const port = await startDevServer(siteId, workspacePath);

        res.json({
            ok: true,
            previewUrl: `https://${siteId}.${PREVIEW_DOMAIN}`,
            status: 'running',
            port
        });
    } catch (error) {
        console.error('Start error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// POST /preview/apply - Apply diff to running preview
app.post('/preview/apply', async (req: Request, res: Response) => {
    try {
        const { siteId, unifiedDiff } = req.body;

        if (!siteId || !unifiedDiff) {
            return res.status(400).json({ error: 'Missing siteId or unifiedDiff' });
        }

        const preview = activePreviews.get(siteId);
        if (!preview || preview.status !== 'running') {
            return res.status(400).json({ error: 'Preview not running. Call /preview/start first.' });
        }

        const workspacePath = path.join(WORKSPACES_DIR, siteId);
        const result = await applyDiff(workspacePath, unifiedDiff);

        // Update activity time
        preview.lastActivity = new Date();

        // If restart needed, restart the dev server
        if (result.needsRestart && preview.pid) {
            console.log(`Restarting dev server for ${siteId} due to config changes...`);
            try {
                process.kill(preview.pid);
            } catch { /* ignore */ }
            await startDevServer(siteId, workspacePath);
        }

        res.json({
            ok: true,
            filesChanged: result.filesChanged,
            needsRestart: result.needsRestart
        });
    } catch (error) {
        console.error('Apply error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// POST /preview/status - Get preview status
app.post('/preview/status', async (req: Request, res: Response) => {
    try {
        const { siteId } = req.body;

        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }

        const preview = activePreviews.get(siteId);

        if (!preview) {
            return res.json({
                ok: true,
                status: 'not_found',
                previewUrl: null
            });
        }

        res.json({
            ok: true,
            status: preview.status,
            previewUrl: preview.status === 'running'
                ? `https://${siteId}.${PREVIEW_DOMAIN}`
                : null,
            port: preview.port,
            lastActivity: preview.lastActivity
        });
    } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// POST /preview/install - Install packages in preview workspace
app.post('/preview/install', async (req: Request, res: Response) => {
    try {
        const { siteId, packages = [], preset } = req.body;

        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }

        const preview = activePreviews.get(siteId);
        if (!preview || preview.status !== 'running') {
            return res.status(400).json({ error: 'Preview not running. Call /preview/start first.' });
        }

        const workspacePath = path.join(WORKSPACES_DIR, siteId);

        // Preset library bundles
        const PRESETS: Record<string, { packages: string[], devPackages: string[], configs?: Record<string, string> }> = {
            'tailwind': {
                packages: [],
                devPackages: ['tailwindcss', 'postcss', 'autoprefixer'],
                configs: {
                    'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      animation: {
        'gradient': 'gradient 8s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}`,
                    'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`
                }
            },
            'animation': {
                packages: ['framer-motion', '@react-spring/web'],
                devPackages: []
            },
            'icons': {
                packages: ['lucide-react', 'react-icons', '@heroicons/react'],
                devPackages: []
            },
            'ui': {
                packages: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tooltip', '@radix-ui/react-popover', 'class-variance-authority', 'clsx', 'tailwind-merge'],
                devPackages: []
            },
            'forms': {
                packages: ['react-hook-form', '@hookform/resolvers', 'zod'],
                devPackages: []
            },
            'charts': {
                packages: ['recharts', '@tremor/react'],
                devPackages: []
            },
            'carousel': {
                packages: ['embla-carousel-react', 'swiper'],
                devPackages: []
            },
            'dates': {
                packages: ['date-fns', 'dayjs', 'react-day-picker'],
                devPackages: []
            },
            'full-stack': {
                packages: ['framer-motion', 'lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', 'class-variance-authority', 'clsx', 'tailwind-merge', 'react-hook-form', 'zod'],
                devPackages: ['tailwindcss', 'postcss', 'autoprefixer'],
                configs: {
                    'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      animation: {
        'gradient': 'gradient 8s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}`,
                    'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`
                }
            }
        };

        let packagesToInstall: string[] = [...packages];
        let devPackagesToInstall: string[] = [];
        let configFiles: Record<string, string> = {};

        // Apply preset if specified
        if (preset && PRESETS[preset]) {
            const p = PRESETS[preset];
            packagesToInstall = [...packagesToInstall, ...p.packages];
            devPackagesToInstall = [...devPackagesToInstall, ...p.devPackages];
            if (p.configs) {
                configFiles = { ...configFiles, ...p.configs };
            }
        }

        // Install production packages
        if (packagesToInstall.length > 0) {
            console.log(`Installing packages for ${siteId}:`, packagesToInstall.join(', '));
            execSync(`npm install ${packagesToInstall.join(' ')}`, {
                cwd: workspacePath,
                stdio: 'pipe',
                timeout: 120000
            });
        }

        // Install dev packages
        if (devPackagesToInstall.length > 0) {
            console.log(`Installing dev packages for ${siteId}:`, devPackagesToInstall.join(', '));
            execSync(`npm install -D ${devPackagesToInstall.join(' ')}`, {
                cwd: workspacePath,
                stdio: 'pipe',
                timeout: 120000
            });
        }

        // Create config files
        for (const [filename, content] of Object.entries(configFiles)) {
            const filePath = path.join(workspacePath, filename);
            await fs.writeFile(filePath, content, 'utf-8');
            console.log(`Created config file: ${filename}`);
        }

        // Restart dev server to pick up new packages
        if (packagesToInstall.length > 0 || devPackagesToInstall.length > 0) {
            console.log(`Restarting dev server for ${siteId} after package installation...`);
            if (preview.pid) {
                try {
                    process.kill(preview.pid);
                } catch { /* ignore */ }
            }
            await startDevServer(siteId, workspacePath);
        }

        res.json({
            ok: true,
            installed: [...packagesToInstall, ...devPackagesToInstall],
            configsCreated: Object.keys(configFiles),
            preset: preset || null
        });
    } catch (error) {
        console.error('Install error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// POST /preview/stop - Stop a preview
app.post('/preview/stop', async (req: Request, res: Response) => {
    try {
        const { siteId } = req.body;

        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }

        const preview = activePreviews.get(siteId);

        if (preview && preview.pid) {
            try {
                process.kill(preview.pid);
            } catch { /* ignore */ }
            preview.status = 'stopped';
            preview.pid = null;
        }

        res.json({ ok: true, status: 'stopped' });
    } catch (error) {
        console.error('Stop error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// POST /preview/deploy - Commit changes and create PR
app.post('/preview/deploy', async (req: Request, res: Response) => {
    try {
        const { siteId, mode = 'pr', title, body } = req.body;

        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }

        const workspacePath = path.join(WORKSPACES_DIR, siteId);

        // Stage and commit changes
        execSync('git add -A', { cwd: workspacePath, stdio: 'pipe' });

        const commitMessage = title || 'AI Editor: Apply changes';
        execSync(`git commit -m "${commitMessage}"`, { cwd: workspacePath, stdio: 'pipe' });

        if (mode === 'merge') {
            // Push directly to main
            execSync('git push origin main', { cwd: workspacePath, stdio: 'pipe' });
            return res.json({
                ok: true,
                mode: 'merge',
                message: 'Changes pushed to main'
            });
        } else {
            // Create branch and push
            const branchName = `ai-changes-${Date.now()}`;
            execSync(`git checkout -b ${branchName}`, { cwd: workspacePath, stdio: 'pipe' });
            execSync(`git push origin ${branchName}`, { cwd: workspacePath, stdio: 'pipe' });

            // Create PR via GitHub API
            const repoInfo = execSync('git remote get-url origin', { cwd: workspacePath, encoding: 'utf-8' });
            const match = repoInfo.match(/github\.com[:/]([^/]+)\/([^/.]+)/);

            if (match && GITHUB_TOKEN) {
                const [, owner, repo] = match;
                const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${GITHUB_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: title || 'AI Editor Changes',
                        head: branchName,
                        base: 'main',
                        body: body || 'Changes made via AI Editor'
                    })
                });

                const prData = await prResponse.json() as { html_url?: string };

                // Switch back to main
                execSync('git checkout main', { cwd: workspacePath, stdio: 'pipe' });

                return res.json({
                    ok: true,
                    mode: 'pr',
                    prUrl: prData.html_url || '',
                    branch: branchName
                });
            }

            // Switch back to main
            execSync('git checkout main', { cwd: workspacePath, stdio: 'pipe' });

            return res.json({
                ok: true,
                mode: 'pr',
                branch: branchName,
                message: 'Branch pushed, create PR manually'
            });
        }
    } catch (error) {
        console.error('Deploy error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
    res.json({ ok: true, activePreviews: activePreviews.size });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Fly Orchestrator running on port ${PORT}`);
    console.log(`   Preview domain: ${PREVIEW_DOMAIN}`);
    console.log(`   Workspaces dir: ${WORKSPACES_DIR}`);
});
