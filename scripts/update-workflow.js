const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('n8n/FIXED-AGENT-WORKFLOW-V3.json', 'utf-8'));

// Find the create_file tool node and update its jsCode
const createFileNode = workflow.nodes.find(n => n.name === 'Create File');
if (createFileNode) {
    createFileNode.parameters.jsCode = `// create_file tool - writes to preview instantly, then commits to GitHub
let input;
try { 
  input = typeof query === 'string' ? JSON.parse(query) : query; 
} catch (e) {
  return JSON.stringify({ error: 'Invalid JSON. Required format: {"filePath": "path/file.tsx", "content": "file content"}' });
}

const { filePath, content } = input;
if (!filePath || typeof content !== 'string') {
  return JSON.stringify({ error: 'Both filePath and content are required' });
}

let ctx = {};
try {
  ctx = $('Merge Files')?.item?.json || {};
} catch (e) {}

const siteId = ctx.siteId || ctx.site?.id;
const owner = ctx.owner || ctx.site?.owner;
const repo = ctx.repo || ctx.site?.repo;
const branch = ctx.branch || ctx.site?.default_branch || 'main';

if (!owner || !repo) {
  return JSON.stringify({ error: 'Missing repository info', owner, repo });
}

try {
  // STEP 1: Write directly to preview workspace for instant HMR
  let hmrOk = false;
  if (siteId) {
    try {
      await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://preview-orchestrator.fly.dev/preview/write',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, filePath, content }),
        timeout: 5000
      });
      hmrOk = true;
    } catch (e) {
      console.log('Direct write failed, continuing with GitHub:', e.message);
    }
  }

  // STEP 2: Also commit to GitHub for persistence
  let sha = null;
  try {
    const existing = await this.helpers.httpRequest({
      method: 'GET',
      url: \`https://api.github.com/repos/\${owner}/\${repo}/contents/\${filePath}?ref=\${branch}\`,
      headers: {
        'Authorization': 'Bearer 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',
        'Accept': 'application/vnd.github+json'
      }
    });
    sha = existing.sha;
  } catch (e) {}

  const body = {
    message: sha ? \`Update \${filePath}\` : \`Create \${filePath}\`,
    content: Buffer.from(content).toString('base64'),
    branch: branch
  };
  if (sha) body.sha = sha;

  const result = await this.helpers.httpRequest({
    method: 'PUT',
    url: \`https://api.github.com/repos/\${owner}/\${repo}/contents/\${filePath}\`,
    headers: {
      'Authorization': 'Bearer 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',
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  return JSON.stringify({ success: true, file: filePath, sha: result.content?.sha, hmrOk });
} catch (e) {
  return JSON.stringify({ error: e.message, file: filePath });
}`;
    console.log('Updated create_file tool with HMR support');
}

// Update workflow name
workflow.name = 'AI Editor - V3 with Instant HMR';

fs.writeFileSync('n8n/FIXED-AGENT-WORKFLOW-V3.json', JSON.stringify(workflow, null, 4));
console.log('Workflow V3 saved successfully');
