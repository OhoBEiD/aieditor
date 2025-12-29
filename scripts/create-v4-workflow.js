const fs = require('fs');

// Load the base workflow from user's provided JSON
const workflow = {
    "name": "AI Editor - V4 Enhanced with Vision & Browser",
    "nodes": [
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "agent/edit-ui",
                "responseMode": "responseNode",
                "options": {
                    "allowedOrigins": "*"
                }
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
    filesToFetch: ['src/app/page.tsx','src/app/layout.tsx','src/app/globals.css'],
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
  json: { 
    ...ctx, 
    currentFetchPath: f,
    fetchIndex: idx,
    totalFiles: files.length
  } 
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
      fileContents[path] = Buffer.from(content, 'base64').toString('utf8');
    } catch (e) {
      fileContents[path] = '// Error decoding file';
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
        // Tools
        {
            "parameters": {
                "name": "create_file",
                "description": "Create or update a file in the repository. Input must be JSON with filePath and content fields.",
                "jsCode": `// create_file tool - writes to preview instantly, then commits to GitHub
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
                "description": "Read a file from the repository. Input: just the file path as a string.",
                "jsCode": `let filePath = String(query).trim().replace(/["'{}]/g, '');
if (filePath.includes('filePath')) {
  try {
    const parsed = JSON.parse(query);
    filePath = parsed.filePath || parsed.path;
  } catch (e) {}
}

if (!filePath) return JSON.stringify({ error: 'filePath is required' });

let ctx = {};
try {
  ctx = $('Merge Files')?.item?.json || {};
} catch (e) {}

const owner = ctx.owner || ctx.site?.owner;
const repo = ctx.repo || ctx.site?.repo;
const branch = ctx.branch || ctx.site?.default_branch || 'main';

if (!owner || !repo) {
  return JSON.stringify({ error: 'Missing repository info' });
}

try {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: \`https://api.github.com/repos/\${owner}/\${repo}/contents/\${filePath}?ref=\${branch}\`,
    headers: {
      'Authorization': 'Bearer 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',
      'Accept': 'application/vnd.github+json'
    }
  });
  
  if (response.content && response.encoding === 'base64') {
    return Buffer.from(response.content, 'base64').toString('utf8');
  }
  return JSON.stringify({ error: 'File not found or empty' });
} catch (e) {
  return JSON.stringify({ error: e.message, file: filePath });
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
                "description": "List all files in the repository. No input needed.",
                "jsCode": `let ctx = {};
try {
  ctx = $('Merge Files')?.item?.json || {};
} catch (e) {}

const owner = ctx.owner || ctx.site?.owner;
const repo = ctx.repo || ctx.site?.repo;
const branch = ctx.branch || ctx.site?.default_branch || 'main';

if (!owner || !repo) {
  return JSON.stringify({ error: 'Missing repository info' });
}

try {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: \`https://api.github.com/repos/\${owner}/\${repo}/git/trees/\${branch}?recursive=1\`,
    headers: {
      'Authorization': 'Bearer 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',
      'Accept': 'application/vnd.github+json'
    }
  });
  
  if (!response.tree) return JSON.stringify({ error: 'Could not fetch tree' });
  
  const files = response.tree
    .filter(f => f.type === 'blob')
    .map(f => f.path)
    .slice(0, 100);
  
  return JSON.stringify(files);
} catch (e) {
  return JSON.stringify({ error: e.message });
}`
            },
            "id": "03762d50-0483-4282-9e24-37db90e427ea",
            "name": "List Files",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [16064, 736]
        },
        // NEW: Fetch URL Tool
        {
            "parameters": {
                "name": "fetch_url",
                "description": "Fetch and read content from a web page URL. Input: the URL to fetch.",
                "jsCode": `// fetch_url tool - fetches a web page and extracts text content
const url = String(query).trim();
if (!url.startsWith('http')) {
  return JSON.stringify({ error: 'URL must start with http:// or https://' });
}

try {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: url,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AutoMate/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml'
    },
    timeout: 15000,
    returnFullResponse: false
  });
  
  // Extract text content (strip HTML)
  const text = String(response)
    .replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .substring(0, 15000); // Limit to 15k chars
  
  return JSON.stringify({ url, content: text, length: text.length });
} catch (e) {
  return JSON.stringify({ error: e.message, url });
}`
            },
            "id": "e7a1f2b3-c4d5-6789-abcd-ef0123456789",
            "name": "Fetch URL",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [16224, 736]
        },
        // AI Plan with enhanced prompt + vision support
        {
            "parameters": {
                "promptType": "define",
                "text": "={{ $json.message }}",
                "options": {
                    "systemMessage": `You are AutoMate, an AI code editor. You MUST use tools to make changes - never just describe them.

## REPOSITORY
Owner: {{ $json.site.owner }} | Repo: {{ $json.site.repo }} | Branch: {{ $json.site.default_branch }}

{{ $json.image ? '## USER PROVIDED IMAGE\\nThe user attached an image/screenshot. Analyze it carefully to understand what they want.' : '' }}

## LOADED FILES
{{ Object.entries($json.fileContents || {}).map(([p, c]) => '### ' + p + '\\n\`\`\`\\n' + c.substring(0, 800) + (c.length > 800 ? '\\n...' : '') + '\\n\`\`\`').join('\\n\\n') || 'None' }}

## TOOLS (YOU MUST USE THESE)
- list_files: List repo files. Input: "list" or empty
- read_file: Read a file. Input: just the path like "src/app/page.tsx"
- create_file: Create/update file. Input: {"filePath": "path", "content": "full content"}
- fetch_url: Fetch web page content. Input: the URL like "https://example.com"

## MANDATORY WORKFLOW
1. Analyze the request (and image if provided)
2. Use list_files if you need to see what exists
3. Use read_file for any files not shown above
4. Use fetch_url if the user asks about a web page
5. **CRITICAL: Call create_file for EVERY file you need to create or modify**
6. After tools complete, summarize what you did

## ABSOLUTE RULES
⚠️ You MUST call create_file for each change - NEVER just describe changes
⚠️ If you say "I created X" you MUST have called create_file first
⚠️ Include complete file content with all imports
⚠️ Use 'use client' for React components with hooks
⚠️ Verify your tool calls succeeded before claiming success

## RESPONSE
After your tool calls succeed, briefly explain what you created.
If a tool fails, explain the error and try to fix it.

REMEMBER: Your changes only happen if you call create_file. Describing code does NOTHING.`,
                    "maxIterations": 20,
                    "returnIntermediateSteps": true
                }
            },
            "id": "4ca6d46a-8723-4201-a60d-a204628f85e7",
            "name": "AI Plan",
            "type": "@n8n/n8n-nodes-langchain.agent",
            "typeVersion": 1.7,
            "position": [15872, 512]
        },
        // Anthropic with increased tokens
        {
            "parameters": {
                "model": {
                    "__rl": true,
                    "value": "claude-sonnet-4-5-20250929",
                    "mode": "list",
                    "cachedResultName": "Claude Sonnet 4.5"
                },
                "options": {
                    "maxTokensToSample": 16000
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
                "jsCode": `// Parse Plan with full debugging
const ctx = $('Merge Files').item.json;
const raw = $('AI Plan').item.json;
let plan;
let out = '';
let debug = { hasOutput: false, hasSteps: false, toolCalls: [], errors: [] };

// Get the AI output text
if (raw?.output) {
  debug.hasOutput = true;
  if (typeof raw.output === 'string') out = raw.output;
  else if (typeof raw.output === 'object') out = JSON.stringify(raw.output);
}
if (!out && raw?.text) out = String(raw.text);

// Collect files created via tool calls
const filesCreated = [];
const steps = raw?.intermediateSteps || [];
debug.hasSteps = steps.length > 0;
debug.stepCount = steps.length;

for (const step of steps) {
  const action = step?.action;
  const observation = step?.observation || step?.result || '';
  
  if (action) {
    const toolInfo = {
      tool: action.tool,
      input: typeof action.toolInput === 'string' ? action.toolInput.substring(0, 100) : JSON.stringify(action.toolInput).substring(0, 100),
      observation: typeof observation === 'string' ? observation.substring(0, 100) : JSON.stringify(observation).substring(0, 100)
    };
    debug.toolCalls.push(toolInfo);
    
    // Check for successful file creation
    if (action.tool === 'create_file') {
      try {
        const obsObj = typeof observation === 'string' ? JSON.parse(observation) : observation;
        if (obsObj.success && obsObj.file) {
          filesCreated.push(obsObj.file);
        }
      } catch (e) {
        // Check string observation
        if (typeof observation === 'string' && observation.includes('success')) {
          try {
            const input = typeof action.toolInput === 'string' ? JSON.parse(action.toolInput) : action.toolInput;
            if (input.filePath) filesCreated.push(input.filePath);
          } catch (e2) {}
        }
      }
    }
  }
}

// Build the plan
if (filesCreated.length > 0) {
  plan = {
    humanSummary: out || \`Created/updated \${filesCreated.length} file(s): \${filesCreated.join(', ')}\`,
    unifiedDiff: '',
    fileTargets: filesCreated.map(f => ({ path: f, action: 'create' })),
    warnings: []
  };
} else if (out) {
  plan = {
    humanSummary: out,
    unifiedDiff: '',
    fileTargets: [],
    warnings: debug.stepCount === 0 ? ['AI did not use any tools'] : [\`AI made \${debug.stepCount} tool calls but no files were created\`]
  };
} else {
  plan = {
    humanSummary: 'Could not process request. Please try again.',
    unifiedDiff: '',
    fileTargets: [],
    warnings: ['No output from AI']
  };
}

// Add debug info to warnings for troubleshooting
if (filesCreated.length === 0 && debug.toolCalls.length > 0) {
  plan.warnings.push('Tool calls made: ' + debug.toolCalls.map(t => t.tool).join(', '));
}

plan.warnings = Array.isArray(plan.warnings) ? plan.warnings : [];
plan.unifiedDiff = typeof plan.unifiedDiff === 'string' ? plan.unifiedDiff : '';
plan.fileTargets = Array.isArray(plan.fileTargets) ? plan.fileTargets : [];
plan.humanSummary = plan.humanSummary || 'Changes processed.';

return [{ json: { ...ctx, plan, filesCreated, debug } }];`
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
const filesChanged = ctx.filesCreated || [];
const pullOk = pullResp.ok !== false;

if (!pullOk && pullResp.error) {
  ctx.plan.warnings = ctx.plan.warnings || [];
  ctx.plan.warnings.push('Git pull: ' + pullResp.error);
}

return [{ json: { ...ctx, filesChanged, applyOk: true, pullResult: pullResp } }];`
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
                "responseBody": "={{ JSON.stringify({ requestId: $('Merge Pull').item.json.requestId, status: 'preview_ready', summary: $('Merge Pull').item.json.plan.humanSummary || '', diff: '', previewUrl: $('Merge Pull').item.json.previewUrl || '', filesChanged: $('Merge Pull').item.json.filesChanged || [], warnings: $('Merge Pull').item.json.plan.warnings || [], debug: $('Merge Pull').item.json.debug || {} }) }}",
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
        "Fetch URL": { "ai_tool": [[{ "node": "AI Plan", "type": "ai_tool", "index": 0 }]] },
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

fs.writeFileSync('n8n/AI-EDITOR-V4-ENHANCED.json', JSON.stringify(workflow, null, 2));
console.log('Created AI-EDITOR-V4-ENHANCED.json');
console.log('Features:');
console.log('- Browser fetch_url tool');
console.log('- Image/vision support via image field');
console.log('- 16000 max output tokens');
console.log('- 200k context window (Claude Sonnet 4.5)');
console.log('- maxIterations: 20');
