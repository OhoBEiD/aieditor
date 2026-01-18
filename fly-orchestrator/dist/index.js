"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const fsSync = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const http_proxy_middleware_1 = require("http-proxy-middleware");
const http_proxy_1 = require("http-proxy");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// Configuration
const PORT = process.env.PORT || 3001;
const WORKSPACES_DIR = process.env.WORKSPACES_DIR || '/workspaces';
const PREVIEW_DOMAIN = process.env.PREVIEW_DOMAIN || 'preview.automatelb.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n-ai-editor.fly.dev';
// In-memory state for active previews
const activePreviews = new Map();
// In-memory state for active n8n executions (requestId -> executionId)
const activeExecutions = new Map();
// Cache proxy middleware instances to prevent memory leaks from creating new middleware on every request
const proxyCache = new Map();
// Cache WebSocket proxy instances for clean frame handling
const wsProxyCache = new Map();
// Configuration for automatic cleanup
const MAX_WORKSPACE_AGE_HOURS = 24; // Remove workspaces older than 24 hours
const MAX_WORKSPACES = 20; // Keep at most 20 workspaces
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // Run cleanup every 30 minutes
// Automatic workspace cleanup function
async function cleanupOldWorkspaces(force = false) {
    const removed = [];
    const errors = [];
    try {
        const entries = await fs_1.promises.readdir(WORKSPACES_DIR, { withFileTypes: true });
        const workspaceDirs = entries.filter(e => e.isDirectory());
        console.log(`[Cleanup] Found ${workspaceDirs.length} workspaces`);
        // Get workspace info with last modified times
        const workspaceInfo = [];
        for (const dir of workspaceDirs) {
            try {
                const stat = await fs_1.promises.stat(path_1.default.join(WORKSPACES_DIR, dir.name));
                const isActive = activePreviews.has(dir.name) && activePreviews.get(dir.name)?.status === 'running';
                workspaceInfo.push({
                    name: dir.name,
                    mtime: stat.mtime,
                    isActive
                });
            }
            catch (e) {
                // Skip if we can't stat the directory
            }
        }
        // Sort by last modified time (oldest first)
        workspaceInfo.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
        const now = Date.now();
        const maxAge = MAX_WORKSPACE_AGE_HOURS * 60 * 60 * 1000;
        for (const ws of workspaceInfo) {
            const age = now - ws.mtime.getTime();
            const ageHours = Math.floor(age / (60 * 60 * 1000));
            // Skip active workspaces unless force cleanup
            if (ws.isActive && !force) {
                console.log(`[Cleanup] Skipping active workspace: ${ws.name}`);
                continue;
            }
            // When force=true, remove ALL inactive workspaces to free up space
            // Otherwise, remove if older than max age OR if we have too many workspaces
            const shouldRemove = force || age > maxAge || (workspaceInfo.length - removed.length > MAX_WORKSPACES);
            if (shouldRemove) {
                try {
                    // Stop the preview if running
                    const preview = activePreviews.get(ws.name);
                    if (preview?.pid) {
                        try {
                            process.kill(preview.pid, 'SIGTERM');
                        }
                        catch { /* ignore */ }
                    }
                    // Clean up proxy cache
                    if (preview) {
                        const cacheKey = `${ws.name}:${preview.port}`;
                        proxyCache.delete(cacheKey);
                    }
                    // Remove from active previews
                    activePreviews.delete(ws.name);
                    // Delete the workspace directory
                    const wsPath = path_1.default.join(WORKSPACES_DIR, ws.name);
                    await fs_1.promises.rm(wsPath, { recursive: true, force: true });
                    removed.push(ws.name);
                    console.log(`[Cleanup] Removed workspace: ${ws.name} (age: ${ageHours}h)`);
                }
                catch (e) {
                    errors.push(`${ws.name}: ${e.message}`);
                    console.error(`[Cleanup] Failed to remove ${ws.name}:`, e.message);
                }
            }
        }
        console.log(`[Cleanup] Complete. Removed ${removed.length} workspaces.`);
    }
    catch (e) {
        console.error('[Cleanup] Error listing workspaces:', e);
    }
    return { removed, errors };
}
// Check available disk space (Linux/Mac)
async function checkDiskSpace() {
    try {
        const output = (0, child_process_1.execSync)(`df -k ${WORKSPACES_DIR} | tail -1`, { encoding: 'utf-8' });
        const parts = output.trim().split(/\s+/);
        // Format: Filesystem 1K-blocks Used Available Use% Mounted
        const total = parseInt(parts[1]) * 1024;
        const available = parseInt(parts[3]) * 1024;
        const percentFree = (available / total) * 100;
        return { available, total, percentFree };
    }
    catch (e) {
        // Fallback: assume we have space
        return { available: 1024 * 1024 * 1024, total: 1024 * 1024 * 1024, percentFree: 100 };
    }
}
// Run cleanup on startup and periodically
(async () => {
    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('[Cleanup] Running initial cleanup...');
    await cleanupOldWorkspaces();
    // Schedule periodic cleanup
    setInterval(async () => {
        console.log('[Cleanup] Running scheduled cleanup...');
        await cleanupOldWorkspaces();
    }, CLEANUP_INTERVAL_MS);
})();
// Get next available port
let nextPort = 3100;
function getNextPort() {
    return nextPort++;
}
// Subdomain-based proxy middleware
// This must come BEFORE express.json() to handle non-JSON requests
app.use(async (req, res, next) => {
    const host = req.headers.host || '';
    // Check if this is a preview subdomain request
    if (host.includes(PREVIEW_DOMAIN) && !host.startsWith('preview-orchestrator')) {
        // Extract siteId from subdomain (e.g., siteId.preview.automatelb.com)
        const subdomain = host.split('.')[0];
        if (subdomain && subdomain !== 'preview-orchestrator' && subdomain !== 'www') {
            let preview = activePreviews.get(subdomain);
            // Lazy Start: If preview is not in memory but workspace exists, start it
            if (!preview) {
                const workspacePath = path_1.default.join(WORKSPACES_DIR, subdomain);
                try {
                    await fs_1.promises.access(workspacePath);
                    // Check if package.json exists to be sure it's a valid workspace
                    await fs_1.promises.access(path_1.default.join(workspacePath, 'package.json'));
                    console.log(`Lazy starting preview for ${subdomain} (found on disk)...`);
                    // Mark as starting to prevent concurrent starts
                    activePreviews.set(subdomain, {
                        pid: null,
                        port: 0,
                        status: 'starting',
                        lastActivity: new Date()
                    });
                    try {
                        const port = await startDevServer(subdomain, workspacePath);
                        preview = activePreviews.get(subdomain);
                    }
                    catch (startError) {
                        console.error(`Failed to lazy start ${subdomain}:`, startError);
                        activePreviews.delete(subdomain);
                    }
                }
                catch (e) {
                    // Workspace does not exist or invalid
                }
            }
            // Wait for starting status? 
            // If we just called startDevServer, it awaits 3s so it should be ready or running.
            // But if another request started it, it might be 'starting'.
            if (preview && preview.status === 'starting') {
                // Return a loading page that refreshes
                return res.send(`
                    <html>
                    <head>
                        <title>Starting Preview...</title>
                        <meta http-equiv="refresh" content="2">
                        <style>
                            body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
                            .loader { width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
                            @keyframes spin { to { transform: rotate(360deg); } }
                        </style>
                    </head>
                    <body>
                        <div class="loader"></div>
                        <p style="margin-top: 1rem; color: #4b5563;">Starting preview server...</p>
                    </body>
                    </html>
                `);
            }
            if (preview && preview.status === 'running') {
                // Update activity
                preview.lastActivity = new Date();
                // Get or create cached proxy middleware for this site
                const cacheKey = `${subdomain}:${preview.port}`;
                let proxyMiddleware = proxyCache.get(cacheKey);
                if (!proxyMiddleware) {
                    // Create new proxy middleware and cache it
                    proxyMiddleware = (0, http_proxy_middleware_1.createProxyMiddleware)({
                        target: `http://localhost:${preview.port}`,
                        changeOrigin: true,
                        ws: true, // WebSocket support for HMR
                        on: {
                            error: (err, _req, res) => {
                                console.error(`Proxy error for ${subdomain}:`, err.message);
                                if (res.writeHead) {
                                    res.writeHead(502, { 'Content-Type': 'text/html' });
                                    res.end('<h1>502 Bad Gateway</h1><p>Preview server is not responding. It might be restarting.</p>');
                                }
                            }
                        }
                    });
                    proxyCache.set(cacheKey, proxyMiddleware);
                    console.log(`Created and cached proxy middleware for ${cacheKey}`);
                }
                return proxyMiddleware(req, res, next);
            }
            else {
                // Preview not running
                return res.status(503).send(`
                    <html>
                    <head><title>Preview Not Ready</title></head>
                    <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                        <h1>Preview Not Ready</h1>
                        <p>The preview server for site <code>${subdomain}</code> is not running.</p>
                        <p>If you just created it, it might be starting.</p>
                        <p>Try sending a message to the AI to restart it.</p>
                    </body>
                    </html>
                `);
            }
        }
    }
    next();
});
// JSON parsing for API endpoints
app.use(express_1.default.json({ limit: '10mb' }));
// Ensure workspace directory exists
async function ensureWorkspace(siteId, repoUrl, branch) {
    const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
    const gitPath = path_1.default.join(workspacePath, '.git');
    // Check disk space before doing anything - cleanup if low
    const MIN_SPACE_MB = 500; // Require at least 500MB free
    const disk = await checkDiskSpace();
    const availableMB = disk.available / 1024 / 1024;
    if (availableMB < MIN_SPACE_MB || disk.percentFree < 10) {
        console.log(`[Disk] Low disk space detected: ${Math.round(availableMB)}MB (${disk.percentFree.toFixed(1)}% free). Running cleanup...`);
        await cleanupOldWorkspaces(false);
        // Check again after cleanup
        const diskAfter = await checkDiskSpace();
        const availableAfter = diskAfter.available / 1024 / 1024;
        if (availableAfter < MIN_SPACE_MB / 2) {
            // Still critically low, force cleanup including less old workspaces
            console.log(`[Disk] Still low: ${Math.round(availableAfter)}MB. Running force cleanup...`);
            await cleanupOldWorkspaces(true);
        }
    }
    // Check if it's a valid git repo
    let isValidRepo = false;
    try {
        await fs_1.promises.access(gitPath);
        isValidRepo = true;
    }
    catch {
        isValidRepo = false;
    }
    if (isValidRepo) {
        // Workspace exists and is a valid git repo
        console.log(`Workspace exists for ${siteId}, checking for local changes...`);
        try {
            // Check if there are uncommitted changes
            const statusResult = (0, child_process_1.execSync)('git status --porcelain', {
                cwd: workspacePath,
                stdio: 'pipe',
                encoding: 'utf-8'
            });
            const hasChanges = statusResult.trim().length > 0;
            if (hasChanges) {
                console.log(`Workspace has uncommitted changes for ${siteId}, preserving them...`);
                // Don't reset - preserve local changes from previous edits
                // Just fetch to update refs
                (0, child_process_1.execSync)('git fetch origin', {
                    cwd: workspacePath,
                    stdio: 'pipe'
                });
            }
            else {
                console.log(`No local changes for ${siteId}, fetching and resetting...`);
                // No local changes, safe to reset
                (0, child_process_1.execSync)(`git fetch origin && git reset --hard origin/${branch}`, {
                    cwd: workspacePath,
                    stdio: 'pipe'
                });
            }
        }
        catch (fetchError) {
            // If fetch fails, the remote might have changed - re-clone
            console.log(`Fetch failed for ${siteId}, re-cloning...`);
            await fs_1.promises.rm(workspacePath, { recursive: true, force: true });
            isValidRepo = false;
        }
    }
    if (!isValidRepo) {
        // Clean up any partial workspace
        try {
            await fs_1.promises.rm(workspacePath, { recursive: true, force: true });
        }
        catch { /* ignore */ }
        // Clone repository
        console.log(`Cloning repository for ${siteId}...`);
        console.log(`Creating workspace directory: ${workspacePath}`);
        // Use mkdirSync for better compatibility with mounted volumes
        try {
            fsSync.mkdirSync(workspacePath, { recursive: true });
            console.log(`Successfully created directory: ${workspacePath}`);
        }
        catch (mkdirError) {
            console.error(`Failed to create directory ${workspacePath}:`, mkdirError);
            throw new Error(`Cannot create workspace directory: ${mkdirError.message}`);
        }
        // Add token to URL if available
        let cloneUrl = repoUrl;
        if (GITHUB_TOKEN && repoUrl.includes('github.com')) {
            cloneUrl = repoUrl.replace('https://', `https://${GITHUB_TOKEN}@`);
        }
        (0, child_process_1.execSync)(`git clone --depth 1 --branch ${branch} ${cloneUrl} .`, {
            cwd: workspacePath,
            stdio: 'pipe'
        });
    }
    // Check if node_modules exists, install if not
    const nodeModulesPath = path_1.default.join(workspacePath, 'node_modules');
    try {
        await fs_1.promises.access(nodeModulesPath);
    }
    catch {
        console.log(`Installing dependencies for ${siteId}...`);
        (0, child_process_1.execSync)('npm install', { cwd: workspacePath, stdio: 'pipe', timeout: 300000 });
    }
    return workspacePath;
}
// Start dev server for a site
async function startDevServer(siteId, workspacePath) {
    const port = getNextPort();
    console.log(`Starting dev server for ${siteId} on port ${port}...`);
    const child = (0, child_process_1.exec)(`npm run dev -- --port ${port}`, {
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
            // Clean up cached proxy middleware when process exits
            const cacheKey = `${siteId}:${preview.port}`;
            if (proxyCache.has(cacheKey)) {
                proxyCache.delete(cacheKey);
                console.log(`Cleaned up proxy middleware cache for ${cacheKey} after process exit`);
            }
        }
    });
    // Wait for dev server to be ready by polling it
    console.log(`Waiting for dev server on port ${port} to be ready...`);
    const maxAttempts = 60; // 60 attempts = 60 seconds
    let attempts = 0;
    let ready = false;
    while (attempts < maxAttempts && !ready) {
        try {
            const response = await fetch(`http://localhost:${port}`, {
                signal: AbortSignal.timeout(1000)
            });
            if (response.status < 500) {
                ready = true;
                console.log(`Dev server ready on port ${port} after ${attempts + 1} attempts`);
            }
        }
        catch (e) {
            // Server not ready yet, wait and retry
        }
        if (!ready) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    if (!ready) {
        console.warn(`Dev server on port ${port} not ready after ${maxAttempts}s, but continuing anyway`);
    }
    return port;
}
// Apply diff to workspace
async function applyDiff(workspacePath, unifiedDiff) {
    const filesChanged = [];
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
                if (currentFile.includes('tailwind.config') ||
                    currentFile.includes('postcss.config') ||
                    currentFile.includes('next.config') ||
                    currentFile === 'package.json' ||
                    currentFile === '.env.local') {
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
        const diffPath = path_1.default.join(workspacePath, '.temp.patch');
        await fs_1.promises.writeFile(diffPath, unifiedDiff);
        try {
            (0, child_process_1.execSync)(`git apply --whitespace=fix --3way .temp.patch`, {
                cwd: workspacePath,
                stdio: 'pipe'
            });
            console.log('Diff applied successfully with git apply --3way');
        }
        catch (e1) {
            console.log('git apply --3way failed, trying without --3way...');
            try {
                (0, child_process_1.execSync)(`git apply --whitespace=fix .temp.patch`, {
                    cwd: workspacePath,
                    stdio: 'pipe'
                });
                console.log('Diff applied successfully with git apply');
            }
            catch (e2) {
                console.log('git apply failed, trying patch command...');
                try {
                    (0, child_process_1.execSync)(`patch -p1 < .temp.patch`, {
                        cwd: workspacePath,
                        stdio: 'pipe'
                    });
                    console.log('Diff applied successfully with patch command');
                }
                catch (e3) {
                    console.error('All patch methods failed. Last error:', e3);
                    // Don't throw - return partial success so workflow can continue
                    await fs_1.promises.unlink(diffPath).catch(() => { });
                    return {
                        filesChanged,
                        needsRestart,
                        // Add warning but don't fail completely
                    };
                }
            }
        }
        await fs_1.promises.unlink(diffPath).catch(() => { });
    }
    catch (error) {
        console.error('Error in applyDiff:', error);
        // Return what we have, don't fail completely
    }
    return { filesChanged, needsRestart };
}
// ==================== ENDPOINTS ====================
// POST /preview/start - Start or ensure preview is running
app.post('/preview/start', async (req, res) => {
    try {
        const { siteId, repoUrl, branch = 'main', forceClone = false } = req.body;
        if (!siteId || !repoUrl) {
            return res.status(400).json({ error: 'Missing siteId or repoUrl' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        // Handle forceClone - delete existing workspace and stop preview
        if (forceClone) {
            console.log(`Force clone requested for ${siteId}, deleting workspace...`);
            // Stop existing preview if running
            const existing = activePreviews.get(siteId);
            if (existing) {
                if (existing.pid) {
                    try {
                        process.kill(existing.pid, 'SIGTERM');
                    }
                    catch (e) {
                        // Process might already be dead
                    }
                }
                // Clean up cached proxy middleware
                const cacheKey = `${siteId}:${existing.port}`;
                if (proxyCache.has(cacheKey)) {
                    proxyCache.delete(cacheKey);
                    console.log(`Cleaned up proxy middleware cache for ${cacheKey}`);
                }
                activePreviews.delete(siteId);
            }
            // Delete the workspace directory
            try {
                await fs_1.promises.rm(workspacePath, { recursive: true, force: true });
                console.log(`Deleted workspace for ${siteId}`);
            }
            catch (e) {
                console.log(`No existing workspace to delete for ${siteId}`);
            }
        }
        // Check if already running (and not force cloning)
        if (!forceClone) {
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
        }
        // Setup workspace (will clone fresh since we deleted it)
        const finalWorkspacePath = await ensureWorkspace(siteId, repoUrl, branch);
        // Start dev server
        const port = await startDevServer(siteId, finalWorkspacePath);
        res.json({
            ok: true,
            previewUrl: `https://${siteId}.${PREVIEW_DOMAIN}`,
            status: 'running',
            port
        });
    }
    catch (error) {
        console.error('Start error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/apply - Apply diff to running preview
app.post('/preview/apply', async (req, res) => {
    try {
        const { siteId, unifiedDiff } = req.body;
        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }
        // Handle empty or missing unifiedDiff gracefully
        if (!unifiedDiff || unifiedDiff.trim() === '') {
            console.log(`No diff to apply for ${siteId} - returning early`);
            return res.json({
                ok: true,
                filesChanged: [],
                needsRestart: false,
                message: 'No changes to apply'
            });
        }
        const preview = activePreviews.get(siteId);
        if (!preview || preview.status !== 'running') {
            return res.status(400).json({ error: 'Preview not running. Call /preview/start first.' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        const result = await applyDiff(workspacePath, unifiedDiff);
        // Update activity time
        preview.lastActivity = new Date();
        // If restart needed, restart the dev server
        if (result.needsRestart && preview.pid) {
            console.log(`Restarting dev server for ${siteId} due to config changes...`);
            try {
                process.kill(preview.pid);
            }
            catch { /* ignore */ }
            await startDevServer(siteId, workspacePath);
        }
        res.json({
            ok: true,
            filesChanged: result.filesChanged,
            needsRestart: result.needsRestart
        });
    }
    catch (error) {
        console.error('Apply error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/read - Read a file from workspace
app.post('/preview/read', async (req, res) => {
    try {
        const { siteId, filePath } = req.body;
        if (!siteId || !filePath) {
            return res.status(400).json({ error: 'Missing required fields: siteId, filePath' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        const fullPath = path_1.default.join(workspacePath, filePath);
        // Security check - ensure path is within workspace
        const resolvedPath = path_1.default.resolve(fullPath);
        const resolvedWorkspace = path_1.default.resolve(workspacePath);
        if (!resolvedPath.startsWith(resolvedWorkspace)) {
            return res.status(403).json({ error: 'Invalid file path' });
        }
        try {
            const content = await fs_1.promises.readFile(fullPath, 'utf-8');
            res.json({
                ok: true,
                content,
                file: filePath
            });
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).json({ error: 'File not found' });
            }
            throw err;
        }
    }
    catch (error) {
        console.error('Read error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/pull - Git pull latest changes from remote and clear cache
app.post('/preview/pull', async (req, res) => {
    try {
        const { siteId, clearCache = true, restart = true, retries = 3 } = req.body;
        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        // Check if workspace exists
        try {
            await fs_1.promises.access(workspacePath);
        }
        catch {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        // Retry logic for fetching from GitHub (commits might not be immediately available)
        let fetchSuccess = false;
        for (let i = 0; i < retries; i++) {
            try {
                if (i > 0) {
                    console.log(`Retry ${i}/${retries} - waiting 1s before fetching...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                (0, child_process_1.execSync)('git fetch origin main', {
                    cwd: workspacePath,
                    stdio: 'pipe',
                    timeout: 10000
                });
                fetchSuccess = true;
                console.log(`Successfully fetched latest changes for ${siteId}`);
                break;
            }
            catch (e) {
                console.log(`Fetch attempt ${i + 1} failed for ${siteId}`);
                if (i === retries - 1) {
                    throw e;
                }
            }
        }
        if (!fetchSuccess) {
            throw new Error('Failed to fetch from GitHub after retries');
        }
        // Reset any local changes and pull latest from GitHub
        // This ensures the workspace matches GitHub exactly, discarding any direct writes
        (0, child_process_1.execSync)('git reset --hard origin/main', {
            cwd: workspacePath,
            stdio: 'pipe'
        });
        console.log(`Reset workspace to latest commit for ${siteId}`);
        // Clear .next and .turbo caches to force rebuild (fixes stale build errors)
        if (clearCache) {
            const nextCachePath = path_1.default.join(workspacePath, '.next');
            const turboCachePath = path_1.default.join(workspacePath, '.turbo');
            const nodeModulesCachePath = path_1.default.join(workspacePath, 'node_modules', '.cache');
            try {
                await fs_1.promises.rm(nextCachePath, { recursive: true, force: true });
                console.log(`Cleared .next cache for ${siteId}`);
            }
            catch (e) {
                console.log(`No .next cache to clear for ${siteId}`);
            }
            try {
                await fs_1.promises.rm(turboCachePath, { recursive: true, force: true });
                console.log(`Cleared .turbo cache for ${siteId}`);
            }
            catch (e) {
                console.log(`No .turbo cache to clear for ${siteId}`);
            }
            try {
                await fs_1.promises.rm(nodeModulesCachePath, { recursive: true, force: true });
                console.log(`Cleared node_modules cache for ${siteId}`);
            }
            catch (e) {
                console.log(`No node_modules cache to clear for ${siteId}`);
            }
        }
        // Restart dev server to pick up changes cleanly
        if (restart) {
            const preview = activePreviews.get(siteId);
            if (preview && preview.status === 'running' && preview.pid) {
                console.log(`Restarting dev server for ${siteId} after pull...`);
                try {
                    process.kill(preview.pid, 'SIGTERM');
                    // Wait a bit for graceful shutdown
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                catch { /* ignore - process might already be dead */ }
                // Clean up cached proxy middleware
                const cacheKey = `${siteId}:${preview.port}`;
                if (proxyCache.has(cacheKey)) {
                    proxyCache.delete(cacheKey);
                }
                // Start new dev server
                await startDevServer(siteId, workspacePath);
                console.log(`Dev server restarted for ${siteId}`);
            }
        }
        res.json({
            ok: true,
            message: 'Pulled latest changes, cleared cache, and restarted dev server'
        });
    }
    catch (error) {
        console.error('Pull error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /execution/register - Register an n8n execution ID for a request (called by n8n workflow)
app.post('/execution/register', async (req, res) => {
    try {
        const { requestId, executionId } = req.body;
        if (!requestId || !executionId) {
            return res.status(400).json({ error: 'Missing requestId or executionId' });
        }
        activeExecutions.set(requestId, executionId);
        console.log(`Registered execution ${executionId} for request ${requestId}`);
        res.json({ ok: true, registered: true });
    }
    catch (error) {
        console.error('Execution register error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// Map to track stop requests (requestId -> shouldStop flag)
const stopRequests = new Map();
// POST /execution/stop - Stop a running n8n execution
app.post('/execution/stop', async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) {
            return res.status(400).json({ error: 'Missing requestId' });
        }
        // Set stop flag for the workflow to check
        stopRequests.set(requestId, true);
        console.log(`🛑 Stop signal set for request ${requestId}`);
        const executionId = activeExecutions.get(requestId);
        if (!executionId) {
            console.log(`No execution found for request ${requestId}, but stop flag is set`);
            return res.json({ ok: true, message: 'Stop signal set (execution may have completed)' });
        }
        if (!N8N_API_KEY) {
            console.error('N8N_API_KEY not configured');
            return res.json({ ok: true, message: 'Stop signal set (cannot call n8n API without key)' });
        }
        // Call n8n API to stop the execution (best effort)
        console.log(`Attempting to stop n8n execution ${executionId} for request ${requestId}...`);
        try {
            const n8nResponse = await fetch(`${N8N_API_URL}/api/v1/executions/${executionId}`, {
                method: 'DELETE',
                headers: {
                    'X-N8N-API-KEY': N8N_API_KEY,
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            if (n8nResponse.ok) {
                console.log(`✅ Successfully stopped execution ${executionId}`);
            }
            else {
                const errorText = await n8nResponse.text();
                console.log(`⚠️ Failed to stop execution via API: ${n8nResponse.status} - ${errorText}`);
            }
        }
        catch (apiError) {
            console.log(`⚠️ n8n API call failed (workflow will check stop flag):`, apiError);
        }
        res.json({ ok: true, stopped: true, requestId });
    }
    catch (error) {
        console.error('Execution stop error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// GET /execution/check/:requestId - Check if execution should stop
app.get('/execution/check/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        if (!requestId) {
            return res.status(400).json({ error: 'Missing requestId' });
        }
        const shouldStop = stopRequests.get(requestId) === true;
        res.json({
            ok: true,
            shouldStop,
            requestId
        });
    }
    catch (error) {
        console.error('Execution check error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /execution/cleanup - Remove completed execution from tracking (called by n8n at end of workflow)
app.post('/execution/cleanup', async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) {
            return res.status(400).json({ error: 'Missing requestId' });
        }
        activeExecutions.delete(requestId);
        stopRequests.delete(requestId); // Clean up stop flag
        console.log(`Cleaned up execution tracking and stop flag for request ${requestId}`);
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Execution cleanup error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/status - Get preview status
app.post('/preview/status', async (req, res) => {
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
    }
    catch (error) {
        console.error('Status error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/install - Install packages in preview workspace
app.post('/preview/install', async (req, res) => {
    try {
        const { siteId, packages = [], preset } = req.body;
        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }
        const preview = activePreviews.get(siteId);
        if (!preview || preview.status !== 'running') {
            return res.status(400).json({ error: 'Preview not running. Call /preview/start first.' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        // Preset library bundles
        const PRESETS = {
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
        let packagesToInstall = [...packages];
        let devPackagesToInstall = [];
        let configFiles = {};
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
            (0, child_process_1.execSync)(`npm install ${packagesToInstall.join(' ')}`, {
                cwd: workspacePath,
                stdio: 'pipe',
                timeout: 120000
            });
        }
        // Install dev packages
        if (devPackagesToInstall.length > 0) {
            console.log(`Installing dev packages for ${siteId}:`, devPackagesToInstall.join(', '));
            (0, child_process_1.execSync)(`npm install -D ${devPackagesToInstall.join(' ')}`, {
                cwd: workspacePath,
                stdio: 'pipe',
                timeout: 120000
            });
        }
        // Create config files
        for (const [filename, content] of Object.entries(configFiles)) {
            const filePath = path_1.default.join(workspacePath, filename);
            await fs_1.promises.writeFile(filePath, content, 'utf-8');
            console.log(`Created config file: ${filename}`);
        }
        // Restart dev server to pick up new packages
        if (packagesToInstall.length > 0 || devPackagesToInstall.length > 0) {
            console.log(`Restarting dev server for ${siteId} after package installation...`);
            if (preview.pid) {
                try {
                    process.kill(preview.pid);
                }
                catch { /* ignore */ }
            }
            await startDevServer(siteId, workspacePath);
        }
        res.json({
            ok: true,
            installed: [...packagesToInstall, ...devPackagesToInstall],
            configsCreated: Object.keys(configFiles),
            preset: preset || null
        });
    }
    catch (error) {
        console.error('Install error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/stop - Stop a preview
app.post('/preview/stop', async (req, res) => {
    try {
        const { siteId } = req.body;
        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }
        const preview = activePreviews.get(siteId);
        if (preview && preview.pid) {
            try {
                process.kill(preview.pid);
            }
            catch { /* ignore */ }
            preview.status = 'stopped';
            preview.pid = null;
            // Clean up cached proxy middleware to prevent memory leaks
            const cacheKey = `${siteId}:${preview.port}`;
            if (proxyCache.has(cacheKey)) {
                proxyCache.delete(cacheKey);
                console.log(`Cleaned up proxy middleware cache for ${cacheKey}`);
            }
        }
        res.json({ ok: true, status: 'stopped' });
    }
    catch (error) {
        console.error('Stop error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/cleanup - Manually trigger workspace cleanup
app.post('/preview/cleanup', async (req, res) => {
    try {
        const { force = false } = req.body;
        console.log(`[Cleanup] Manual cleanup triggered (force: ${force})`);
        const diskBefore = await checkDiskSpace();
        const result = await cleanupOldWorkspaces(force);
        const diskAfter = await checkDiskSpace();
        res.json({
            ok: true,
            removed: result.removed,
            errors: result.errors,
            diskSpace: {
                before: `${Math.round(diskBefore.available / 1024 / 1024)}MB (${diskBefore.percentFree.toFixed(1)}% free)`,
                after: `${Math.round(diskAfter.available / 1024 / 1024)}MB (${diskAfter.percentFree.toFixed(1)}% free)`
            }
        });
    }
    catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// GET /preview/disk - Check disk space status
app.get('/preview/disk', async (req, res) => {
    try {
        const disk = await checkDiskSpace();
        const entries = await fs_1.promises.readdir(WORKSPACES_DIR, { withFileTypes: true }).catch(() => []);
        const workspaceCount = entries.filter(e => e.isDirectory()).length;
        res.json({
            ok: true,
            available: `${Math.round(disk.available / 1024 / 1024)}MB`,
            total: `${Math.round(disk.total / 1024 / 1024)}MB`,
            percentFree: disk.percentFree.toFixed(1) + '%',
            workspaces: workspaceCount,
            activePreview: activePreviews.size,
            warning: disk.percentFree < 10 ? 'Low disk space!' : undefined
        });
    }
    catch (error) {
        console.error('Disk check error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/deploy - Commit changes and create PR
app.post('/preview/deploy', async (req, res) => {
    try {
        const { siteId, mode = 'pr', title, body } = req.body;
        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        // Configure git user identity for commit
        (0, child_process_1.execSync)('git config user.email "ai-editor@automate.dev"', { cwd: workspacePath, stdio: 'pipe' });
        (0, child_process_1.execSync)('git config user.name "AI Editor"', { cwd: workspacePath, stdio: 'pipe' });
        // Ensure .gitignore excludes node_modules to prevent large file errors
        const gitignorePath = path_1.default.join(workspacePath, '.gitignore');
        try {
            let gitignoreContent = await fs_1.promises.readFile(gitignorePath, 'utf-8');
            if (!gitignoreContent.includes('node_modules')) {
                gitignoreContent += '\nnode_modules/\n';
                await fs_1.promises.writeFile(gitignorePath, gitignoreContent, 'utf-8');
            }
        }
        catch {
            // .gitignore doesn't exist, create it
            await fs_1.promises.writeFile(gitignorePath, 'node_modules/\n.next/\n.turbo/\ndist/\nbuild/\n', 'utf-8');
        }
        // Stage and commit changes (excluding node_modules)
        (0, child_process_1.execSync)('git add -A', { cwd: workspacePath, stdio: 'pipe' });
        const commitMessage = title || 'AI Editor: Apply changes';
        (0, child_process_1.execSync)(`git commit -m "${commitMessage}"`, { cwd: workspacePath, stdio: 'pipe' });
        if (mode === 'merge') {
            // Push directly to main
            (0, child_process_1.execSync)('git push origin main', { cwd: workspacePath, stdio: 'pipe' });
            return res.json({
                ok: true,
                mode: 'merge',
                message: 'Changes pushed to main'
            });
        }
        else {
            // Create branch and push
            const branchName = `ai-changes-${Date.now()}`;
            (0, child_process_1.execSync)(`git checkout -b ${branchName}`, { cwd: workspacePath, stdio: 'pipe' });
            (0, child_process_1.execSync)(`git push origin ${branchName}`, { cwd: workspacePath, stdio: 'pipe' });
            // Create PR via GitHub API
            const repoInfo = (0, child_process_1.execSync)('git remote get-url origin', { cwd: workspacePath, encoding: 'utf-8' });
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
                (0, child_process_1.execSync)('git checkout main', { cwd: workspacePath, stdio: 'pipe' });
                return res.json({
                    ok: true,
                    mode: 'pr',
                    prUrl: prData.html_url || '',
                    branch: branchName
                });
            }
            // Switch back to main
            (0, child_process_1.execSync)('git checkout main', { cwd: workspacePath, stdio: 'pipe' });
            return res.json({
                ok: true,
                mode: 'pr',
                branch: branchName,
                message: 'Branch pushed, create PR manually'
            });
        }
    }
    catch (error) {
        console.error('Deploy error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/write - Write file directly to workspace (instant HMR, no GitHub roundtrip)
app.post('/preview/write', async (req, res) => {
    try {
        const { siteId, filePath, content } = req.body;
        if (!siteId || !filePath || content === undefined) {
            return res.status(400).json({ error: 'Missing siteId, filePath, or content' });
        }
        const preview = activePreviews.get(siteId);
        if (!preview || preview.status !== 'running') {
            return res.status(400).json({ error: 'Preview not running. Call /preview/start first.' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        const fullPath = path_1.default.join(workspacePath, filePath);
        // Security: Prevent path traversal
        if (!fullPath.startsWith(workspacePath)) {
            return res.status(400).json({ error: 'Invalid file path' });
        }
        // Ensure directory exists
        const dir = path_1.default.dirname(fullPath);
        await fs_1.promises.mkdir(dir, { recursive: true });
        // Write file directly - Next.js HMR will pick this up instantly
        await fs_1.promises.writeFile(fullPath, content, 'utf-8');
        // Update activity
        preview.lastActivity = new Date();
        console.log(`[${siteId}] Direct write: ${filePath} (${content.length} bytes)`);
        res.json({
            ok: true,
            file: filePath,
            size: content.length
        });
    }
    catch (error) {
        console.error('Write error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/replace - Search and replace in a file
app.post('/preview/replace', async (req, res) => {
    try {
        const { siteId, filePath, search, replace, githubToken } = req.body;
        if (!siteId || !filePath || !search) {
            return res.status(400).json({ error: 'Missing siteId, filePath, or search' });
        }
        const preview = activePreviews.get(siteId);
        if (!preview || preview.status !== 'running') {
            return res.status(400).json({ error: 'Preview not running. Call /preview/start first.' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        const fullPath = path_1.default.join(workspacePath, filePath);
        // Security: Prevent path traversal
        if (!fullPath.startsWith(workspacePath)) {
            return res.status(400).json({ error: 'Invalid file path' });
        }
        // Read current file
        let content;
        try {
            content = await fs_1.promises.readFile(fullPath, 'utf-8');
        }
        catch (e) {
            return res.status(404).json({ error: `File not found: ${filePath}` });
        }
        // Check if search text exists
        if (!content.includes(search)) {
            return res.status(400).json({
                error: `Search text not found in file`,
                searchText: search.substring(0, 100),
                hint: 'Make sure the exact text exists in the file'
            });
        }
        // Perform replacement
        const newContent = content.replace(search, replace || '');
        // Write file back
        await fs_1.promises.writeFile(fullPath, newContent, 'utf-8');
        // Update activity
        preview.lastActivity = new Date();
        console.log(`[${siteId}] Replace in ${filePath}: "${search.substring(0, 30)}..." -> "${(replace || '').substring(0, 30)}..."`);
        res.json({
            ok: true,
            file: filePath,
            replaced: true
        });
    }
    catch (error) {
        console.error('Replace error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// POST /preview/push - Commit and push all changes to GitHub
app.post('/preview/push', async (req, res) => {
    try {
        const { siteId, githubToken, message = 'AI Automated Update' } = req.body;
        if (!siteId) {
            return res.status(400).json({ error: 'Missing siteId' });
        }
        const workspacePath = path_1.default.join(WORKSPACES_DIR, siteId);
        // Check if workspace exists
        try {
            await fs_1.promises.access(workspacePath);
        }
        catch {
            return res.status(404).json({ error: 'Workspace not found' });
        }
        // Configure git user identity for commit
        (0, child_process_1.execSync)('git config user.email "ai-editor@automate.dev"', { cwd: workspacePath, stdio: 'pipe' });
        (0, child_process_1.execSync)('git config user.name "AI Editor"', { cwd: workspacePath, stdio: 'pipe' });
        // Check if there are any changes to commit
        const statusOutput = (0, child_process_1.execSync)('git status --porcelain', { cwd: workspacePath, encoding: 'utf-8' });
        if (!statusOutput.trim()) {
            return res.json({
                ok: true,
                message: 'No changes to push',
                pushed: false
            });
        }
        console.log(`[${siteId}] Changes detected, committing and pushing...`);
        console.log(`[${siteId}] Status:\n${statusOutput}`);
        // Stage all changes
        (0, child_process_1.execSync)('git add -A', { cwd: workspacePath, stdio: 'pipe' });
        // Commit changes
        const commitMsg = message.replace(/"/g, '\\"'); // Escape quotes
        (0, child_process_1.execSync)(`git commit -m "${commitMsg}"`, { cwd: workspacePath, stdio: 'pipe' });
        // Get the commit SHA
        const commitSha = (0, child_process_1.execSync)('git rev-parse HEAD', { cwd: workspacePath, encoding: 'utf-8' }).trim();
        // Push to origin main
        (0, child_process_1.execSync)('git push origin main', { cwd: workspacePath, stdio: 'pipe' });
        console.log(`[${siteId}] Successfully pushed commit ${commitSha.substring(0, 7)}`);
        res.json({
            ok: true,
            message: 'Changes pushed to GitHub',
            pushed: true,
            commitSha,
            changedFiles: statusOutput.trim().split('\n').length
        });
    }
    catch (error) {
        console.error('Push error:', error);
        res.status(500).json({
            error: String(error),
            stderr: error.stderr?.toString() || '',
            stdout: error.stdout?.toString() || ''
        });
    }
});
// Health check
app.get('/health', (req, res) => {
    res.json({ ok: true, activePreviews: activePreviews.size });
});
// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message });
});
// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 Fly Orchestrator running on port ${PORT}`);
    console.log(`   Preview domain: ${PREVIEW_DOMAIN}`);
    console.log(`   Workspaces dir: ${WORKSPACES_DIR}`);
});
// Handle WebSocket upgrades for HMR using http-proxy directly for clean frame handling
server.on('upgrade', (req, socket, head) => {
    const host = req.headers.host || '';
    // Check if this is a preview subdomain request
    if (host.includes(PREVIEW_DOMAIN) && !host.startsWith('preview-orchestrator')) {
        const subdomain = host.split('.')[0];
        const preview = activePreviews.get(subdomain);
        if (preview && preview.status === 'running') {
            const cacheKey = `ws:${subdomain}:${preview.port}`;
            // Get or create a dedicated WebSocket proxy for this site
            let wsProxy = wsProxyCache.get(cacheKey);
            if (!wsProxy) {
                wsProxy = (0, http_proxy_1.createProxyServer)({
                    target: `http://localhost:${preview.port}`,
                    ws: true,
                    changeOrigin: true,
                });
                // Handle WebSocket proxy errors gracefully
                wsProxy.on('error', (err) => {
                    console.error(`[WS Proxy Error] ${subdomain}:`, err.message);
                });
                wsProxyCache.set(cacheKey, wsProxy);
                console.log(`[WS] Created WebSocket proxy for ${cacheKey}`);
            }
            try {
                // Update last activity
                preview.lastActivity = new Date();
                // Proxy the WebSocket upgrade
                wsProxy.ws(req, socket, head);
            }
            catch (err) {
                console.error(`[WS] Upgrade error for ${subdomain}:`, err.message);
                socket.destroy();
            }
        }
        else {
            // Preview not ready - send 503 and close gracefully
            console.log(`[WS] Preview not ready for ${subdomain}, status: ${preview?.status || 'not found'}`);
            socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
            socket.destroy();
        }
    }
    else {
        socket.destroy();
    }
});
