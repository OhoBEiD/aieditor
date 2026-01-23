// Add Git Push node to V51 workflow (creates V52)
// FIXED: Response now reads from Git Push, not Save Request (which overwrites context)
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json');
const outputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V52-WITH-GIT-PUSH.json');

// Read workflow
const workflow = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const GITHUB_TOKEN = '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';

// Create Git Push node with empty repo handling
const gitPushNode = {
    parameters: {
        jsCode: `// GIT PUSH - Commit and push file changes to GitHub
// Handles empty repos (creates initial commit) and always passes through fileOperations
const ctx = $input.item.json;
const fileOperations = ctx.fileOperations || [];
const owner = ctx.owner;
const repo = ctx.repo;
const branch = ctx.branch || 'main';
const githubToken = ctx.githubToken || '${GITHUB_TOKEN}';

// Always pass through context - wrap push in try/catch
try {
    // Skip if no file operations
    if (!fileOperations.length) {
        console.log('📝 No file operations to push');
        return [{ json: ctx }];
    }

    console.log('📤 Pushing', fileOperations.length, 'files to GitHub...');

    const headers = {
        'Authorization': 'Bearer ' + githubToken,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    };

    // Create blobs for each file first (this works even for empty repos)
    const treeItems = [];
    for (const op of fileOperations) {
        if (op.type === 'write' && op.content) {
            const blobRes = await this.helpers.httpRequest({
                method: 'POST',
                url: 'https://api.github.com/repos/' + owner + '/' + repo + '/git/blobs',
                headers,
                body: JSON.stringify({
                    content: op.content,
                    encoding: 'utf-8'
                }),
                timeout: 10000,
                json: true
            });

            treeItems.push({
                path: op.path.startsWith('/') ? op.path.slice(1) : op.path,
                mode: '100644',
                type: 'blob',
                sha: blobRes.sha
            });
        } else if (op.type === 'delete') {
            treeItems.push({
                path: op.path.startsWith('/') ? op.path.slice(1) : op.path,
                mode: '100644',
                type: 'blob',
                sha: null
            });
        }
    }

    if (treeItems.length === 0) {
        console.log('📝 No valid file operations');
        return [{ json: ctx }];
    }

    // Try to get the current branch ref (may fail for empty repos)
    let baseSha = null;
    let baseTreeSha = null;
    let isEmptyRepo = false;

    try {
        const branchRes = await this.helpers.httpRequest({
            method: 'GET',
            url: 'https://api.github.com/repos/' + owner + '/' + repo + '/git/ref/heads/' + branch,
            headers,
            timeout: 10000,
            json: true,
            ignoreHttpStatusErrors: true
        });

        if (branchRes && branchRes.object && branchRes.object.sha) {
            baseSha = branchRes.object.sha;

            // Get the current tree
            const commitRes = await this.helpers.httpRequest({
                method: 'GET',
                url: 'https://api.github.com/repos/' + owner + '/' + repo + '/git/commits/' + baseSha,
                headers,
                timeout: 10000,
                json: true
            });
            baseTreeSha = commitRes.tree.sha;
        } else {
            isEmptyRepo = true;
            console.log('📂 Repo appears empty, will create initial commit');
        }
    } catch (e) {
        isEmptyRepo = true;
        console.log('📂 Repo is empty (no commits yet), creating initial commit');
    }

    // Create new tree
    const treeBody = isEmptyRepo ? { tree: treeItems } : { base_tree: baseTreeSha, tree: treeItems };
    const newTreeRes = await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://api.github.com/repos/' + owner + '/' + repo + '/git/trees',
        headers,
        body: JSON.stringify(treeBody),
        timeout: 10000,
        json: true
    });

    // Create commit
    const commitMessage = 'AutoMate: ' + (ctx.message || 'Update files').substring(0, 50);
    const commitBody = {
        message: commitMessage,
        tree: newTreeRes.sha,
        parents: isEmptyRepo ? [] : [baseSha]
    };
    const newCommitRes = await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://api.github.com/repos/' + owner + '/' + repo + '/git/commits',
        headers,
        body: JSON.stringify(commitBody),
        timeout: 10000,
        json: true
    });

    // Update or create branch reference
    if (isEmptyRepo) {
        // Create the branch ref
        await this.helpers.httpRequest({
            method: 'POST',
            url: 'https://api.github.com/repos/' + owner + '/' + repo + '/git/refs',
            headers,
            body: JSON.stringify({
                ref: 'refs/heads/' + branch,
                sha: newCommitRes.sha
            }),
            timeout: 10000,
            json: true
        });
    } else {
        // Update existing branch ref
        await this.helpers.httpRequest({
            method: 'PATCH',
            url: 'https://api.github.com/repos/' + owner + '/' + repo + '/git/refs/heads/' + branch,
            headers,
            body: JSON.stringify({
                sha: newCommitRes.sha,
                force: false
            }),
            timeout: 10000,
            json: true
        });
    }

    console.log('✅ Pushed to GitHub:', newCommitRes.sha.substring(0, 7));
    return [{ json: { ...ctx, commitSha: newCommitRes.sha, gitPushSuccess: true } }];

} catch (e) {
    // IMPORTANT: Always pass through context with fileOperations even if push fails
    console.error('⚠️ Git push failed (will retry on next request):', e.message);
    return [{ json: { ...ctx, gitPushError: e.message, gitPushSuccess: false } }];
}`
    },
    id: 'git-push-node-' + Date.now(),
    name: 'Git Push',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [3900, 1968]
};

// Find and remove old Git Push node if it exists
workflow.nodes = workflow.nodes.filter(n => n.name !== 'Git Push');

// Add the new node
workflow.nodes.push(gitPushNode);

// KEY FIX: Change connections so that:
// Parse Results -> Git Push -> Response (direct)
// Git Push -> Save Request (parallel, for logging only)

// Update connections
workflow.connections['Parse Results'] = {
    main: [[{ node: 'Git Push', type: 'main', index: 0 }]]
};

// Git Push goes to BOTH Response AND Save Request in parallel
// Response gets the data directly (preserves fileOperations)
// Save Request logs to DB but its output is ignored
workflow.connections['Git Push'] = {
    main: [[
        { node: 'Response', type: 'main', index: 0 },
        { node: 'Save Request', type: 'main', index: 0 }
    ]]
};

// Save Request no longer connects to Response (Response gets data directly from Git Push)
delete workflow.connections['Save Request'];

// Write output
fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
console.log('✅ Created:', outputFile);
console.log('📝 FIXED: Response now reads directly from Git Push (preserves fileOperations)');
console.log('📝 Save Request runs in parallel (for logging only, output ignored)');
