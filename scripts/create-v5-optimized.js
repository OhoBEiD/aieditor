const fs = require('fs');

// Optimized workflow with reduced token usage
const workflow = {
    "name": "AI Editor - V5 Token Optimized",
    "nodes": [
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "agent/edit-ui",
                "responseMode": "responseNode",
                "options": { "allowedOrigins": "*" }
            },
            "id": "a5be7bae-0938-40a8-aabc-44efeebd36a8",
            "name": "Webhook Edit UI",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [14240, 512],
            "webhookId": "edit-ui"
        },
        {
            "parameters": {
                "jsCode": `const b=$input.first().json.body||$input.first().json;
const req=['siteId','conversationId','userId','message'];
const miss=req.filter(k=>!b[k]);
if(miss.length)throw new Error('Missing: '+miss.join(', '));
const rid=b.requestId||('req_'+Date.now()+'_'+Math.random().toString(36).slice(2,11));
return[{json:{
  siteId:b.siteId,
  conversationId:b.conversationId,
  userId:b.userId,
  message:b.message,
  pageUrl:b.pageUrl||null,
  uiContext:b.uiContext||{},
  requestId:rid,
  image:b.image||null
}}];`
            },
            "id": "b8e7c03a-f737-45b5-9e2c-6981d4d4d1c1",
            "name": "Validate Input",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [14432, 512]
        },
        {
            "parameters": {
                "url": "=https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/sites?site_key=eq.{{$json.siteId}}&select=*",
                "sendHeaders": true,
                "headerParameters": {
                    "parameters": [
                        { "name": "apikey", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4" },
                        { "name": "Authorization", "value": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4" }
                    ]
                },
                "options": {}
            },
            "id": "d04c8d7b-065b-4543-942c-022a47091db9",
            "name": "Load Site",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [14608, 512]
        },
        {
            "parameters": {
                "jsCode": `const inp=$('Validate Input').item.json;
const siteArr=$input.first().json;
const site=Array.isArray(siteArr)?siteArr[0]:siteArr;
if(!site)throw new Error('Site not found');

const repoUrl=site.repo_url||'';
const match=repoUrl.match(/github\\.com\\/([^/]+)\\/([^/]+)/);
const owner=match?match[1]:'';
const repo=match?match[2].replace(/\\.git$/,''):'';

// OPTIMIZATION: Only fetch globals.css for color changes, otherwise minimal files
const msg = inp.message.toLowerCase();
const filesToFetch = [];

// Smart file selection based on request
if (msg.includes('color') || msg.includes('theme') || msg.includes('style') || msg.includes('css')) {
  filesToFetch.push('src/app/globals.css');
}
if (msg.includes('page') || msg.includes('hero') || msg.includes('component') || msg.includes('button')) {
  filesToFetch.push('src/app/page.tsx');
}
// Always minimal - AI can read more if needed
if (filesToFetch.length === 0) {
  filesToFetch.push('src/app/page.tsx');
}

return [{
  json: {
    ...inp,
    site: {
      id: site.id,
      name: site.name,
      repo_url: site.repo_url,
      default_branch: site.default_branch || 'main',
      stack: site.stack || 'unknown',
      allowedPaths: ['**/*'],
      owner,
      repo
    },
    fileContents: {},
    filesToFetch,
    owner,
    repo,
    branch: site.default_branch || 'main'
  }
}];`
            },
            "id": "0d009caa-d356-4505-9cce-c837650e7d58",
            "name": "Build Context",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [14784, 512]
        },
        {
            "parameters": {
                "method": "POST",
                "url": "https://preview-orchestrator.fly.dev/preview/start",
                "sendHeaders": true,
                "headerParameters": { "parameters": [{ "name": "Content-Type", "value": "application/json" }] },
                "sendBody": true,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ siteId: $json.site.id, repoUrl: $json.site.repo_url, branch: $json.site.default_branch }) }}",
                "options": { "response": { "response": { "neverError": true } }, "timeout": 120000 }
            },
            "id": "0834ed5c-ccf0-45f3-b3c9-dd1ae5fe9f19",
            "name": "Fly Start Preview",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [14960, 512]
        },
        {
            "parameters": {
                "jsCode": "const ctx = $('Build Context').item.json;\nconst flyResp = $input.first().json;\nreturn [{ json: { ...ctx, previewUrl: flyResp.previewUrl || '', previewStatus: flyResp.status || 'unknown' } }];"
            },
            "id": "09e58fd6-91a1-4d53-b115-747cc309ba39",
            "name": "Merge Fly Response",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [15152, 512]
        },
        {
            "parameters": {
                "jsCode": `const ctx = $input.first().json;
const files = ctx.filesToFetch || [];
if (files.length === 0) {
  return [{ json: { ...ctx, fileContents: {}, skipFetch: true } }];
}
return files.map((f, idx) => ({ 
  json: { ...ctx, currentFetchPath: f, fetchIndex: idx, totalFiles: files.length } 
}));`
            },
            "id": "95104930-512f-4f51-8ffd-146eee7f87f0",
            "name": "Prepare Fetch",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [15328, 512]
        },
        {
            "parameters": {
                "url": "=https://api.github.com/repos/{{ $json.site.owner }}/{{ $json.site.repo }}/contents/{{ $json.currentFetchPath }}?ref={{ $json.site.default_branch }}",
                "sendHeaders": true,
                "headerParameters": {
                    "parameters": [
                        { "name": "Authorization", "value": "Bearer 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" },
                        { "name": "Accept", "value": "application/vnd.github+json" }
                    ]
                },
                "options": { "response": { "response": { "neverError": true } } }
            },
            "id": "e3499c34-0670-4a73-a175-5b1fce26977c",
            "name": "Fetch GitHub Files",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [15504, 512]
        },
        {
            "parameters": {
                "jsCode": `const prepareItems = $('Prepare Fetch').all();
const fetchItems = $input.all();
const originalCtx = $('Merge Fly Response').item.json;

const fileContents = {};

for (let i = 0; i < prepareItems.length; i++) {
  const path = prepareItems[i].json.currentFetchPath;
  const fetchResp = fetchItems[i]?.json;
  
  if (!path) continue;
  
  let content = fetchResp?.content;
  
  if (content) {
    try {
      // OPTIMIZATION: Truncate file content to 400 chars max
      const decoded = Buffer.from(content, 'base64').toString('utf8');
      fileContents[path] = decoded.substring(0, 400) + (decoded.length > 400 ? '\\n... (truncated)' : '');
    } catch (e) {
      fileContents[path] = '// Error decoding';
    }
  }
}

return [{ json: { ...originalCtx, fileContents } }];`
            },
            "id": "ab69f697-01c0-40c8-ad3d-644aa72fcdd1",
            "name": "Merge Files",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [15680, 512]
        },
        // Tools - OPTIMIZED versions
        {
            "parameters": {
                "name": "create_file",
                "description": "Create/update file. JSON: {filePath, content}",
                "jsCode": `let input;
try { input = typeof query === 'string' ? JSON.parse(query) : query; } 
catch (e) { return '{"error":"Invalid JSON"}'; }

const { filePath, content } = input;
if (!filePath || !content) return '{"error":"filePath and content required"}';

let ctx = {};
try { ctx = $('Merge Files')?.item?.json || {}; } catch (e) {}

const siteId = ctx.siteId || ctx.site?.id;
const owner = ctx.owner || ctx.site?.owner;
const repo = ctx.repo || ctx.site?.repo;
const branch = ctx.branch || ctx.site?.default_branch || 'main';

if (!owner || !repo) return '{"error":"Missing repo info"}';

try {
  // Direct write for instant HMR
  if (siteId) {
    try {
      await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://preview-orchestrator.fly.dev/preview/write',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, filePath, content }),
        timeout: 5000
      });
    } catch (e) {}
  }

  // GitHub commit
  let sha = null;
  try {
    const existing = await this.helpers.httpRequest({
      method: 'GET',
      url: \`https://api.github.com/repos/\${owner}/\${repo}/contents/\${filePath}?ref=\${branch}\`,
      headers: { 'Authorization': 'Bearer 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', 'Accept': 'application/vnd.github+json' }
    });
    sha = existing.sha;
  } catch (e) {}

  const body = { message: (sha ? 'Update ' : 'Create ') + filePath, content: Buffer.from(content).toString('base64'), branch };
  if (sha) body.sha = sha;

  await this.helpers.httpRequest({
    method: 'PUT',
    url: \`https://api.github.com/repos/\${owner}/\${repo}/contents/\${filePath}\`,
    headers: { 'Authorization': 'Bearer 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', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return \`{"ok":true,"file":"\${filePath}"}\`;
} catch (e) {
  return \`{"error":"\${e.message}"}\`;
}`
            },
            "id": "fada3e41-6359-4007-8359-65485cb680ae",
            "name": "Create File",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [15744, 736]
        },
        {
            "parameters": {
                "name": "read_file",
                "description": "Read file content. Input: file path",
                "jsCode": `let filePath = String(query).trim().replace(/["'{}]/g, '');
if (filePath.includes('filePath')) {
  try { filePath = JSON.parse(query).filePath; } catch (e) {}
}
if (!filePath) return '{"error":"path required"}';

let ctx = {};
try { ctx = $('Merge Files')?.item?.json || {}; } catch (e) {}

const owner = ctx.owner || ctx.site?.owner;
const repo = ctx.repo || ctx.site?.repo;
const branch = ctx.branch || 'main';

if (!owner || !repo) return '{"error":"no repo"}';

try {
  const r = await this.helpers.httpRequest({
    method: 'GET',
    url: \`https://api.github.com/repos/\${owner}/\${repo}/contents/\${filePath}?ref=\${branch}\`,
    headers: { 'Authorization': 'Bearer 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', 'Accept': 'application/vnd.github+json' }
  });
  return r.content ? Buffer.from(r.content, 'base64').toString('utf8') : '{"error":"empty"}';
} catch (e) {
  return \`{"error":"\${e.message}"}\`;
}`
            },
            "id": "94414d36-2d5e-46f6-9c49-ed9ec250c181",
            "name": "Read File",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [15904, 736]
        },
        {
            "parameters": {
                "name": "list_files",
                "description": "List repo files. No input needed.",
                "jsCode": `let ctx = {};
try { ctx = $('Merge Files')?.item?.json || {}; } catch (e) {}

const owner = ctx.owner || ctx.site?.owner;
const repo = ctx.repo || ctx.site?.repo;
const branch = ctx.branch || 'main';

if (!owner || !repo) return '{"error":"no repo"}';

try {
  const r = await this.helpers.httpRequest({
    method: 'GET',
    url: \`https://api.github.com/repos/\${owner}/\${repo}/git/trees/\${branch}?recursive=1\`,
    headers: { 'Authorization': 'Bearer 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', 'Accept': 'application/vnd.github+json' }
  });
  // Only return src files to save tokens
  const files = (r.tree || []).filter(f => f.type === 'blob' && f.path.startsWith('src/')).map(f => f.path).slice(0, 50);
  return JSON.stringify(files);
} catch (e) {
  return \`{"error":"\${e.message}"}\`;
}`
            },
            "id": "03762d50-0483-4282-9e24-37db90e427ea",
            "name": "List Files",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [16064, 736]
        },
        // AI Plan - OPTIMIZED prompt (much shorter!)
        {
            "parameters": {
                "promptType": "define",
                "text": "={{ $json.message }}",
                "options": {
                    "systemMessage": `You are AutoMate, an AI code editor. USE TOOLS to make changes.

REPO: {{ $json.site.owner }}/{{ $json.site.repo }} ({{ $json.site.default_branch }})
{{ $json.image ? 'IMAGE ATTACHED: Analyze it for context.' : '' }}

FILES PREVIEW:
{{ Object.entries($json.fileContents || {}).map(([p, c]) => p + ': ' + c.substring(0, 200).replace(/\\n/g, ' ')).join('\\n') || 'Use list_files and read_file' }}

TOOLS:
- list_files: See repo structure
- read_file: Read full file content
- create_file: {filePath, content} - CREATE OR UPDATE files

RULES:
1. read_file FIRST to get full content before editing
2. create_file for EVERY change - include COMPLETE file content
3. Use 'use client' for React with hooks
4. Be efficient - minimal iterations`,
                    "maxIterations": 5,
                    "returnIntermediateSteps": true
                }
            },
            "id": "4ca6d46a-8723-4201-a60d-a204628f85e7",
            "name": "AI Plan",
            "type": "@n8n/n8n-nodes-langchain.agent",
            "typeVersion": 1.7,
            "position": [15872, 512]
        },
        // Anthropic - OPTIMIZED tokens
        {
            "parameters": {
                "model": {
                    "__rl": true,
                    "value": "claude-sonnet-4-5-20250929",
                    "mode": "list",
                    "cachedResultName": "Claude Sonnet 4.5"
                },
                "options": {
                    "maxTokensToSample": 8000
                }
            },
            "id": "191091ae-e27c-4151-89c5-ff9a96661394",
            "name": "Anthropic",
            "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
            "typeVersion": 1.3,
            "position": [15616, 704],
            "credentials": {
                "anthropicApi": {
                    "id": "cR1eoa32avbXUEse",
                    "name": "Anthropic account"
                }
            }
        },
        // Parse Plan
        {
            "parameters": {
                "jsCode": `const ctx = $('Merge Files').item.json;
const raw = $('AI Plan').item.json;
let out = raw?.output || raw?.text || '';
if (typeof out === 'object') out = JSON.stringify(out);

const filesCreated = [];
const steps = raw?.intermediateSteps || [];

for (const step of steps) {
  const action = step?.action;
  const obs = step?.observation || '';
  if (action?.tool === 'create_file') {
    try {
      const o = typeof obs === 'string' ? JSON.parse(obs) : obs;
      if (o.ok && o.file) filesCreated.push(o.file);
    } catch (e) {
      try {
        const inp = typeof action.toolInput === 'string' ? JSON.parse(action.toolInput) : action.toolInput;
        if (inp.filePath) filesCreated.push(inp.filePath);
      } catch (e2) {}
    }
  }
}

const plan = {
  humanSummary: out || (filesCreated.length ? 'Updated: ' + filesCreated.join(', ') : 'Processed'),
  fileTargets: filesCreated.map(f => ({ path: f })),
  warnings: filesCreated.length === 0 && steps.length > 0 ? ['No files created'] : []
};

return [{ json: { ...ctx, plan, filesCreated, iterations: steps.length } }];`
            },
            "id": "64058a79-b5b3-481a-8abf-476a2d2830f0",
            "name": "Parse Plan",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [16048, 512]
        },
        // Guardrails
        {
            "parameters": {
                "jsCode": "const ctx = $input.first().json;\nif (!ctx?.site) throw new Error('Missing site');\nif (!ctx?.plan) throw new Error('Missing plan');\nreturn [{ json: ctx }];"
            },
            "id": "76e33a80-f2d7-444e-bccb-bce25c94decb",
            "name": "Guardrails",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [16224, 512]
        },
        // Git Pull
        {
            "parameters": {
                "method": "POST",
                "url": "https://preview-orchestrator.fly.dev/preview/pull",
                "sendHeaders": true,
                "headerParameters": { "parameters": [{ "name": "Content-Type", "value": "application/json" }] },
                "sendBody": true,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ siteId: $json.site.id }) }}",
                "options": { "response": { "response": { "neverError": true } }, "timeout": 60000 }
            },
            "id": "c079772c-d015-46f8-9da3-eceae48d50b9",
            "name": "Git Pull",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [16400, 512]
        },
        // Merge Pull
        {
            "parameters": {
                "jsCode": `const ctx = $('Guardrails').item.json;
const pullResp = $input.first().json;
return [{ json: { ...ctx, filesChanged: ctx.filesCreated || [], pullOk: pullResp.ok !== false } }];`
            },
            "id": "3e1bce11-a816-4da2-8b3d-827a3da774eb",
            "name": "Merge Pull",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [16592, 512]
        },
        // Save Request
        {
            "parameters": {
                "method": "POST",
                "url": "=https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/code_versions",
                "sendHeaders": true,
                "headerParameters": {
                    "parameters": [
                        { "name": "apikey", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4" },
                        { "name": "Authorization", "value": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4" },
                        { "name": "Content-Type", "value": "application/json" },
                        { "name": "Prefer", "value": "return=representation" }
                    ]
                },
                "sendBody": true,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ site_id: $json.site.id, request_id: $json.requestId, instruction: $json.message, plan_json: $json.plan, diff: '', status: 'preview_ready', preview_url: $json.previewUrl || '' }) }}",
                "options": { "response": { "response": { "neverError": true } } }
            },
            "id": "0fe1e63c-b4c2-4ddd-8fca-c145e1a62f28",
            "name": "Save Request",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [16768, 512]
        },
        // Response
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ JSON.stringify({ requestId: $('Merge Pull').item.json.requestId, status: 'preview_ready', summary: $('Merge Pull').item.json.plan.humanSummary || '', previewUrl: $('Merge Pull').item.json.previewUrl || '', filesChanged: $('Merge Pull').item.json.filesChanged || [], warnings: $('Merge Pull').item.json.plan.warnings || [], iterations: $('Merge Pull').item.json.iterations || 0 }) }}",
                "options": {}
            },
            "id": "8c4e79aa-7998-47b1-b0a5-eb308e3101a1",
            "name": "Response",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [16960, 512]
        }
    ],
    "connections": {
        "Webhook Edit UI": { "main": [[{ "node": "Validate Input", "type": "main", "index": 0 }]] },
        "Validate Input": { "main": [[{ "node": "Load Site", "type": "main", "index": 0 }]] },
        "Load Site": { "main": [[{ "node": "Build Context", "type": "main", "index": 0 }]] },
        "Build Context": { "main": [[{ "node": "Fly Start Preview", "type": "main", "index": 0 }]] },
        "Fly Start Preview": { "main": [[{ "node": "Merge Fly Response", "type": "main", "index": 0 }]] },
        "Merge Fly Response": { "main": [[{ "node": "Prepare Fetch", "type": "main", "index": 0 }]] },
        "Prepare Fetch": { "main": [[{ "node": "Fetch GitHub Files", "type": "main", "index": 0 }]] },
        "Fetch GitHub Files": { "main": [[{ "node": "Merge Files", "type": "main", "index": 0 }]] },
        "Merge Files": { "main": [[{ "node": "AI Plan", "type": "main", "index": 0 }]] },
        "Create File": { "ai_tool": [[{ "node": "AI Plan", "type": "ai_tool", "index": 0 }]] },
        "Read File": { "ai_tool": [[{ "node": "AI Plan", "type": "ai_tool", "index": 0 }]] },
        "List Files": { "ai_tool": [[{ "node": "AI Plan", "type": "ai_tool", "index": 0 }]] },
        "AI Plan": { "main": [[{ "node": "Parse Plan", "type": "main", "index": 0 }]] },
        "Anthropic": { "ai_languageModel": [[{ "node": "AI Plan", "type": "ai_languageModel", "index": 0 }]] },
        "Parse Plan": { "main": [[{ "node": "Guardrails", "type": "main", "index": 0 }]] },
        "Guardrails": { "main": [[{ "node": "Git Pull", "type": "main", "index": 0 }]] },
        "Git Pull": { "main": [[{ "node": "Merge Pull", "type": "main", "index": 0 }]] },
        "Merge Pull": { "main": [[{ "node": "Save Request", "type": "main", "index": 0 }]] },
        "Save Request": { "main": [[{ "node": "Response", "type": "main", "index": 0 }]] }
    },
    "pinData": {},
    "meta": {
        "templateCredsSetupCompleted": true,
        "instanceId": "8278f0fbb558df00ecd79690c89f9c1e0fbf89bbd188221ebac4a3ae271261b8"
    }
};

fs.writeFileSync('n8n/AI-EDITOR-V5-OPTIMIZED.json', JSON.stringify(workflow, null, 2));
console.log('Created AI-EDITOR-V5-OPTIMIZED.json');
console.log('');
console.log('TOKEN OPTIMIZATIONS:');
console.log('- System prompt: ~500 tokens (was ~1500)');
console.log('- File previews: 400 chars max (was 800)');
console.log('- maxIterations: 5 (was 9-20)');
console.log('- maxTokensToSample: 8000 (was 16000)');
console.log('- Smart file selection: only fetches relevant files');
console.log('- Compact tool responses');
console.log('');
console.log('Expected: ~5-6k tokens/iteration × 5 max = ~30k total');
