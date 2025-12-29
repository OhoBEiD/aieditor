const fs = require('fs');

// V6 Multi-Agent Workflow with ALL tools from old workflow
const workflow = {
    "name": "AI Editor - V6 Multi-Agent (Complete)",
    "nodes": [
        // === WEBHOOK ===
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "agent/edit-ui",
                "responseMode": "responseNode",
                "options": { "allowedOrigins": "*" }
            },
            "id": "webhook-1",
            "name": "Webhook Edit UI",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [200, 500],
            "webhookId": "edit-ui"
        },

        // === VALIDATE INPUT (with image support) ===
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
            "id": "validate-1",
            "name": "Validate Input",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [400, 500]
        },

        // === LOAD SITE ===
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
            "id": "loadsite-1",
            "name": "Load Site",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [600, 500]
        },

        // === BUILD CONTEXT ===
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

return [{json:{
  ...inp,
  site:{
    id:site.id,
    name:site.name,
    repo_url:site.repo_url,
    default_branch:site.default_branch||'main',
    stack:site.stack||'unknown',
    allowedPaths:['**/*'],
    owner,
    repo
  },
  fileContents:{},
  filesToFetch:['src/app/page.tsx','src/app/layout.tsx','src/app/globals.css'],
  owner,
  repo,
  branch:site.default_branch||'main'
}}];`
            },
            "id": "buildctx-1",
            "name": "Build Context",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [800, 500]
        },

        // === FLY START PREVIEW ===
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
            "id": "flystart-1",
            "name": "Fly Start Preview",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [1000, 500]
        },

        // === MERGE FLY RESPONSE ===
        {
            "parameters": {
                "jsCode": `const ctx = $('Build Context').item.json;
const flyResp = $input.first().json;
return [{ json: { ...ctx, previewUrl: flyResp.previewUrl || '', previewStatus: flyResp.status || 'unknown' } }];`
            },
            "id": "mergefly-1",
            "name": "Merge Fly Response",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1200, 500]
        },

        // === PLANNER AGENT (Claude Haiku - cheap/fast) ===
        {
            "parameters": {
                "promptType": "define",
                "text": "={{ $json.message }}",
                "options": {
                    "systemMessage": `You are a code change planner. Analyze the request and output a JSON plan.

REPO: {{ $json.owner }}/{{ $json.repo }}
{{ $json.image ? 'IMAGE ATTACHED: The user provided an image/screenshot. Consider what they want based on this.' : '' }}

Return ONLY valid JSON (no markdown, no explanation):
{
  "files_to_read": ["src/app/globals.css", "src/app/page.tsx"],
  "files_to_modify": ["paths to create or update"],
  "summary": "brief description of changes needed"
}

RULES:
- For color/theme/style changes: include globals.css in files_to_read and files_to_modify
- For component/page changes: include the relevant tsx file
- For new features: list all files that need to be created or modified
- Keep file lists minimal but complete`,
                    "maxIterations": 1
                }
            },
            "id": "planner-1",
            "name": "Planner Agent",
            "type": "@n8n/n8n-nodes-langchain.agent",
            "typeVersion": 1.7,
            "position": [1400, 500]
        },

        // === PLANNER MODEL (Claude Haiku) ===
        {
            "parameters": {
                "model": {
                    "__rl": true,
                    "value": "claude-3-haiku-20240307",
                    "mode": "list",
                    "cachedResultName": "Claude 3 Haiku"
                },
                "options": {
                    "maxTokensToSample": 500
                }
            },
            "id": "haiku-1",
            "name": "Haiku (Planner)",
            "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
            "typeVersion": 1.3,
            "position": [1300, 700],
            "credentials": {
                "anthropicApi": {
                    "id": "cR1eoa32avbXUEse",
                    "name": "Anthropic account"
                }
            }
        },

        // === PARSE PLAN ===
        {
            "parameters": {
                "jsCode": `const ctx = $('Merge Fly Response').item.json;
const raw = $('Planner Agent').item.json;
let out = raw?.output || raw?.text || '';

// Parse the JSON plan
let plan = { files_to_read: [], files_to_modify: [], summary: '' };
try {
  const jsonMatch = out.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) {
    plan = JSON.parse(jsonMatch[0]);
  }
} catch (e) {
  // Fallback based on message
  const msg = ctx.message.toLowerCase();
  if (msg.includes('color') || msg.includes('theme') || msg.includes('style')) {
    plan.files_to_read = ['src/app/globals.css'];
    plan.files_to_modify = ['src/app/globals.css'];
  } else {
    plan.files_to_read = ['src/app/page.tsx'];
    plan.files_to_modify = ['src/app/page.tsx'];
  }
  plan.summary = ctx.message;
}

// Combine with default files
const filesToFetch = [...new Set([...(plan.files_to_read || []), ...(ctx.filesToFetch || [])])].slice(0, 5);

return [{ json: { ...ctx, plan, filesToFetch } }];`
            },
            "id": "parseplan-1",
            "name": "Parse Plan",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1600, 500]
        },

        // === PREPARE FETCH ===
        {
            "parameters": {
                "jsCode": `const ctx = $input.first().json;
const files = ctx.filesToFetch || [];
if (files.length === 0) {
  return [{ json: { ...ctx, fileContents: {} } }];
}
return files.map((f, idx) => ({ json: { ...ctx, currentFetchPath: f, fetchIndex: idx, totalFiles: files.length } }));`
            },
            "id": "prepfetch-1",
            "name": "Prepare Fetch",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1800, 500]
        },

        // === FETCH FILES ===
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
            "id": "fetchfiles-1",
            "name": "Fetch GitHub Files",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [2000, 500]
        },

        // === MERGE FILES ===
        {
            "parameters": {
                "jsCode": `const prepareItems = $('Prepare Fetch').all();
const fetchItems = $input.all();
const originalCtx = $('Parse Plan').item.json;

const fileContents = {};
for (let i = 0; i < prepareItems.length; i++) {
  const path = prepareItems[i].json.currentFetchPath;
  const content = fetchItems[i]?.json?.content;
  if (path && content) {
    try {
      fileContents[path] = Buffer.from(content, 'base64').toString('utf8');
    } catch (e) {
      fileContents[path] = '// Error decoding file';
    }
  }
}

return [{ json: { ...originalCtx, fileContents } }];`
            },
            "id": "mergefiles-1",
            "name": "Merge Files",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2200, 500]
        },

        // === EXECUTOR AGENT (Claude Sonnet) ===
        {
            "parameters": {
                "promptType": "define",
                "text": "={{ $json.message }}",
                "options": {
                    "systemMessage": `You are AutoMate, an AI code editor. You MUST use tools to make changes.

## REPOSITORY
Owner: {{ $json.site.owner }} | Repo: {{ $json.site.repo }} | Branch: {{ $json.site.default_branch }}

{{ $json.image ? '## USER PROVIDED IMAGE\\nThe user attached an image/screenshot. Analyze it carefully to understand what they want.' : '' }}

## PLAN FROM ANALYSIS
{{ $json.plan.summary || 'Execute the user request' }}
Files to modify: {{ ($json.plan.files_to_modify || []).join(', ') || 'as needed' }}

## LOADED FILES
{{ Object.entries($json.fileContents || {}).map(([p, c]) => '### ' + p + '\\n\`\`\`\\n' + c.substring(0, 800) + (c.length > 800 ? '\\n...' : '') + '\\n\`\`\`').join('\\n\\n') || 'None' }}

## TOOLS
- list_files: List repo files. Input: "list" or empty
- read_file: Read a file. Input: just the path like "src/app/page.tsx"
- create_file: Create/update file. Input: {"filePath": "path", "content": "full content"}
- fetch_url: Fetch web page content. Input: the URL like "https://example.com"

## RULES
1. Use read_file if you need a file not shown above
2. Call create_file for EVERY file you modify - include COMPLETE content
3. Use 'use client' for React components with hooks
4. Be efficient - aim for 1-3 tool calls max

After your tool calls succeed, briefly summarize what you did.`,
                    "maxIterations": 5,
                    "returnIntermediateSteps": true
                }
            },
            "id": "executor-1",
            "name": "Executor Agent",
            "type": "@n8n/n8n-nodes-langchain.agent",
            "typeVersion": 1.7,
            "position": [2400, 500]
        },

        // === EXECUTOR MODEL (Claude Sonnet) ===
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
            "id": "sonnet-1",
            "name": "Sonnet (Executor)",
            "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
            "typeVersion": 1.3,
            "position": [2300, 750],
            "credentials": {
                "anthropicApi": {
                    "id": "cR1eoa32avbXUEse",
                    "name": "Anthropic account"
                }
            }
        },

        // === CREATE FILE TOOL (with HMR) ===
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
            "id": "createfile-1",
            "name": "Create File",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [2460, 750]
        },

        // === READ FILE TOOL ===
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
            "id": "readfile-1",
            "name": "Read File",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [2620, 750]
        },

        // === LIST FILES TOOL ===
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
            "id": "listfiles-1",
            "name": "List Files",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [2780, 750]
        },

        // === FETCH URL TOOL ===
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
            "id": "fetchurl-1",
            "name": "Fetch URL",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [2940, 750]
        },

        // === PARSE RESULTS ===
        {
            "parameters": {
                "jsCode": `const ctx = $('Merge Files').item.json;
const raw = $('Executor Agent').item.json;
let out = raw?.output || raw?.text || '';
if (typeof out === 'object') out = JSON.stringify(out);

const filesCreated = [];
const steps = raw?.intermediateSteps || [];
const debug = { stepCount: steps.length, toolCalls: [] };

for (const step of steps) {
  const action = step?.action;
  const observation = step?.observation || step?.result || '';
  
  if (action) {
    debug.toolCalls.push(action.tool);
    
    if (action.tool === 'create_file') {
      try {
        const obsObj = typeof observation === 'string' ? JSON.parse(observation) : observation;
        if (obsObj.success && obsObj.file) {
          filesCreated.push(obsObj.file);
        }
      } catch (e) {
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

const plan = {
  humanSummary: out || (filesCreated.length > 0 ? 'Updated: ' + filesCreated.join(', ') : ctx.plan?.summary || 'Changes processed'),
  unifiedDiff: '',
  fileTargets: filesCreated.map(f => ({ path: f, action: 'create' })),
  warnings: filesCreated.length === 0 && steps.length > 0 ? ['AI made ' + steps.length + ' tool calls but no files were created'] : []
};

return [{ json: { ...ctx, plan, filesCreated, debug } }];`
            },
            "id": "parseresults-1",
            "name": "Parse Plan",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2600, 500]
        },

        // === GUARDRAILS ===
        {
            "parameters": {
                "jsCode": "const ctx = $input.first().json;\nif (!ctx?.site) throw new Error('Missing site');\nif (!ctx?.plan) throw new Error('Missing plan');\nreturn [{ json: ctx }];"
            },
            "id": "guardrails-1",
            "name": "Guardrails",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2800, 500]
        },

        // === GIT PULL ===
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
            "id": "gitpull-1",
            "name": "Git Pull",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [3000, 500]
        },

        // === MERGE PULL ===
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
            "id": "mergepull-1",
            "name": "Merge Pull",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [3200, 500]
        },

        // === SAVE REQUEST ===
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
            "id": "savereq-1",
            "name": "Save Request",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [3400, 500]
        },

        // === RESPONSE ===
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ JSON.stringify({ requestId: $('Merge Pull').item.json.requestId, status: 'preview_ready', summary: $('Merge Pull').item.json.plan.humanSummary || '', diff: '', previewUrl: $('Merge Pull').item.json.previewUrl || '', filesChanged: $('Merge Pull').item.json.filesChanged || [], warnings: $('Merge Pull').item.json.plan.warnings || [], debug: $('Merge Pull').item.json.debug || {} }) }}",
                "options": {}
            },
            "id": "response-1",
            "name": "Response",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [3600, 500]
        }
    ],
    "connections": {
        "Webhook Edit UI": { "main": [[{ "node": "Validate Input", "type": "main", "index": 0 }]] },
        "Validate Input": { "main": [[{ "node": "Load Site", "type": "main", "index": 0 }]] },
        "Load Site": { "main": [[{ "node": "Build Context", "type": "main", "index": 0 }]] },
        "Build Context": { "main": [[{ "node": "Fly Start Preview", "type": "main", "index": 0 }]] },
        "Fly Start Preview": { "main": [[{ "node": "Merge Fly Response", "type": "main", "index": 0 }]] },
        "Merge Fly Response": { "main": [[{ "node": "Planner Agent", "type": "main", "index": 0 }]] },
        "Haiku (Planner)": { "ai_languageModel": [[{ "node": "Planner Agent", "type": "ai_languageModel", "index": 0 }]] },
        "Planner Agent": { "main": [[{ "node": "Parse Plan", "type": "main", "index": 0 }]] },
        "Parse Plan": { "main": [[{ "node": "Prepare Fetch", "type": "main", "index": 0 }]] },
        "Prepare Fetch": { "main": [[{ "node": "Fetch GitHub Files", "type": "main", "index": 0 }]] },
        "Fetch GitHub Files": { "main": [[{ "node": "Merge Files", "type": "main", "index": 0 }]] },
        "Merge Files": { "main": [[{ "node": "Executor Agent", "type": "main", "index": 0 }]] },
        "Sonnet (Executor)": { "ai_languageModel": [[{ "node": "Executor Agent", "type": "ai_languageModel", "index": 0 }]] },
        "Create File": { "ai_tool": [[{ "node": "Executor Agent", "type": "ai_tool", "index": 0 }]] },
        "Read File": { "ai_tool": [[{ "node": "Executor Agent", "type": "ai_tool", "index": 0 }]] },
        "List Files": { "ai_tool": [[{ "node": "Executor Agent", "type": "ai_tool", "index": 0 }]] },
        "Fetch URL": { "ai_tool": [[{ "node": "Executor Agent", "type": "ai_tool", "index": 0 }]] },
        "Executor Agent": { "main": [[{ "node": "Parse Plan", "type": "main", "index": 0 }]] },
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

// Fix connections - Executor connects to Parse Plan (results), not the planner's Parse Plan
workflow.connections["Executor Agent"] = { "main": [[{ "node": "Parse Plan", "type": "main", "index": 0 }]] };

// Rename parse nodes to avoid conflict
workflow.nodes.find(n => n.id === "parseresults-1").name = "Parse Results";
workflow.connections["Executor Agent"] = { "main": [[{ "node": "Parse Results", "type": "main", "index": 0 }]] };
workflow.connections["Parse Results"] = { "main": [[{ "node": "Guardrails", "type": "main", "index": 0 }]] };
delete workflow.connections["Parse Plan"]["main"];

fs.writeFileSync('n8n/AI-EDITOR-V6-COMPLETE.json', JSON.stringify(workflow, null, 2));
console.log('Created AI-EDITOR-V6-COMPLETE.json');
console.log('');
console.log('FEATURES:');
console.log('- Multi-agent: Planner (Haiku) + Executor (Sonnet)');
console.log('- All tools: create_file (HMR), read_file, list_files, fetch_url');
console.log('- Image analysis support');
console.log('- Token optimized: ~15k total per request');
