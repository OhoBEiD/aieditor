import express, { Request, Response, NextFunction } from 'express';
import { execSync, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

const app = express();
app.use(express.json({ limit: '10mb' }));

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

    // Parse unified diff and apply changes
    const diffLines = unifiedDiff.split('\n');
    let currentFile: string | null = null;
    let currentContent: string[] = [];
    let inHunk = false;

    for (const line of diffLines) {
        if (line.startsWith('--- a/') || line.startsWith('--- /dev/null')) {
            // Old file (ignore for now)
        } else if (line.startsWith('+++ b/')) {
            currentFile = line.substring(6);
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
        } else if (line.startsWith('@@')) {
            inHunk = true;
        } else if (inHunk && currentFile) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
                currentContent.push(line.substring(1));
            } else if (line.startsWith(' ')) {
                currentContent.push(line.substring(1));
            }
        }
    }

    // For simplicity, write direct file updates (in production, use proper patch application)
    // This is a simplified implementation - real diff application would use 'git apply'

    try {
        // Try to apply using git apply
        const diffPath = path.join(workspacePath, '.temp.patch');
        await fs.writeFile(diffPath, unifiedDiff);
        execSync(`git apply --whitespace=fix .temp.patch`, { cwd: workspacePath, stdio: 'pipe' });
        await fs.unlink(diffPath);
    } catch (error) {
        console.error('Failed to apply diff with git apply:', error);
        throw new Error('Failed to apply diff');
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

                const prData = await prResponse.json();

                // Switch back to main
                execSync('git checkout main', { cwd: workspacePath, stdio: 'pipe' });

                return res.json({
                    ok: true,
                    mode: 'pr',
                    prUrl: prData.html_url,
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
